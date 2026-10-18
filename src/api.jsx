import { MODEL, VOICE_URL, DOCX_URL, SEARCH_URL, getLanceKey } from "./config";
import { buildSystem } from "./system";
import { findRelevantNotes } from "./memory";

// Text of Pastor's last few messages, so a follow-up like "do you see it now?"
// still finds the note the earlier message pointed at.
function recentUserText(messages) {
  return messages.filter(m => m.role === "user").slice(-3).map(m => {
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.filter(b => b && b.type === "text").map(b => b.text).join(" ");
    return "";
  }).join("\n");
}

export async function callClaude(messages, facts, sessions, fileContents = [], profile = [], project = null, brain = [], viaVoice = false) {
  const apiMessages = [...messages];

  // Pull the notebook entries this question is about, in full.
  let focus = [];
  try { focus = await findRelevantNotes(recentUserText(messages)); } catch { focus = []; }
  if (focus.length) {
    const fullIds = new Set(focus.map(n => n.id));
    brain = [...focus, ...(brain || []).filter(n => !fullIds.has(n.id))];
  }

  if (fileContents.length > 0) {
    const fileBlocks = fileContents.map(f => {
      if (f.type === "image") return { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.data } };
      if (f.type === "document") return { type: "document", source: { type: "base64", media_type: f.mediaType, data: f.data } };
      return { type: "text", text: `[File: ${f.name}]\n${f.text}` };
    });
    const last = apiMessages[apiMessages.length - 1];
    if (last && last.role === "user") {
      const content = typeof last.content === "string"
        ? [...fileBlocks, { type: "text", text: last.content }]
        : [...fileBlocks, ...last.content];
      apiMessages[apiMessages.length - 1] = { ...last, content };
    }
  }

  // Route through Supabase proxy to avoid CORS/browser security issues on iPhone
  const CLAUDE_URL = "https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-claude";
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystem(facts, profile, sessions, project, brain) + (viaVoice ? "\n\nPastor is talking to you out loud and you are being read aloud. Answer in a few short spoken sentences. Go longer only if he asks for depth." : ""),
    messages: apiMessages,
  });

  // Anthropic sometimes returns a transient overload ("high demand") or rate limit.
  // Retry a few times with backoff so those spikes ride through instead of surfacing.
  const retryable = (status, msg) =>
    status === 429 || status === 500 || status === 502 || status === 503 || status === 529 ||
    /overloaded|high demand|rate.?limit|temporarily|try again/i.test(msg || "");
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const MAX_TRIES = 4;
  let lastMsg = "Something went wrong reaching the model.";
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let res, d;
    try {
      res = await fetch(CLAUDE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-lance-key": getLanceKey() },
        body,
      });
      d = await res.json();
    } catch (e) {
      lastMsg = e.message || "Network error.";
      if (attempt < MAX_TRIES - 1) { await wait(800 * 2 ** attempt + Math.random() * 400); continue; }
      throw new Error("Lance could not reach the model. Check your connection and try again.");
    }

    if (!d.error && res.ok) {
      const txt = (d.content || []).filter(b => b && b.type === "text").map(b => b.text || "").join("");
      if (txt.trim()) return txt;
      lastMsg = "Lance sent back an empty reply (" + (d.stop_reason || "no reason") + "). Try again.";
      if (attempt < MAX_TRIES - 1) { await wait(600); continue; }
      break;
    }
    if (res.status === 401) throw new Error("Lance needs his unlock passcode again. Close and reopen Lance, then enter it.");

    lastMsg = d.error?.message || `Request failed (${res.status}).`;
    if (retryable(res.status, lastMsg) && attempt < MAX_TRIES - 1) {
      await wait(800 * 2 ** attempt + Math.random() * 400);
      continue;
    }
    break;
  }

  if (/overloaded|high demand/i.test(lastMsg)) {
    throw new Error("Anthropic's servers are busy right now. Give it a few seconds and try again.");
  }
  throw new Error(lastMsg);
}

export async function speak(text, onStart, onEnd, onError) {
  try {
    onStart?.();
    const res = await fetch(VOICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("Voice error");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); onEnd?.(); };
    audio.onerror = () => { URL.revokeObjectURL(url); onError?.(); };
    audio.play();
    return audio;
  } catch (e) { onError?.(e); return null; }
}

export async function webSearch(query, count = 5) {
  const res = await fetch(`https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, count }),
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export function formatSearchResults(data) {
  if (!data.results || data.results.length === 0) return "No results found.";
  return data.results.map((r, i) =>
    `[${i+1}] ${r.title}\n${r.url}\n${r.description || ""}${r.age ? ` (${r.age})` : ""}`
  ).join("\n\n");
}

export async function readFile(file) {
  const isImage = file.type.startsWith("image/") || file.name.toLowerCase().match(/\.(heic|heif)$/);
  const isPDF = file.type === "application/pdf";
  const isSpreadsheet = file.name.toLowerCase().match(/\.(xlsx|xls)$/);

  if (isSpreadsheet) {
    const XLSX = await import("xlsx");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: "array" });
          const parts = wb.SheetNames.map(name => {
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
            return wb.SheetNames.length > 1 ? `--- Sheet: ${name} ---\n${csv}` : csv;
          });
          resolve({ name: file.name, type: "text", text: parts.join("\n\n") });
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  if (isImage) {
    // Compress image to stay under 10MB Anthropic limit
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
        resolve({ name: file.name, type: "image", mediaType: "image/jpeg", data });
      };
      img.onerror = () => {
        // Fallback: read as-is
        URL.revokeObjectURL(url);
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: "image", mediaType: "image/jpeg", data: reader.result.split(",")[1] });
        reader.readAsDataURL(file);
      };
      img.src = url;
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (isPDF) {
      reader.onload = () => resolve({ name: file.name, type: "document", mediaType: file.type, data: reader.result.split(",")[1] });
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => resolve({ name: file.name, type: "text", text: reader.result });
      reader.onerror = reject;
      reader.readAsText(file);
    }
  });
}

export function detectDocumentContent(text, userRequest) {
  if (!text || typeof text !== "string") return false;
  // Only trigger when the PERSON explicitly asked for something worth keeping --
  // never based on the response merely looking structured.
  const req = (userRequest || "").toLowerCase();

  // Named document/study types
  const namedTypes = [
    /\bsermon\b/, /\bstudy guide\b/, /\bbible study\b/, /\bexam\b/, /\bquiz\b/,
    /\blesson plan\b/, /\bcurriculum\b/, /\bsyllabus\b/, /\bdevotion(al)?\b/,
    /\bbusiness plan\b/, /\bmeeting notes\b/, /\bmeeting agenda\b/, /\bchapter \d+\b/,
  ].some(p => p.test(req));

  // General pattern: [give/make/build/create/write/draft] me a [something worth keeping]
  // Catches workout routines, meal plans, travel itineraries, checklists, templates, programs,
  // protocols, schedules, outlines, guides, reports, proposals, letters, and similar --
  // without firing on ordinary conversational replies that merely happen to use these words.
  const requestedNoun = /\b(give|make|build|create|write|draft|put together|design)\s+(me\s+|us\s+)?(a|an|the)\s+[a-z\s]{0,25}?(plan|routine|program|schedule|protocol|regimen|itinerary|checklist|recipe|outline|template|guide|worksheet|handout|report|proposal|letter|memo|essay|document|doc|workout)\b/.test(req);

  return namedTypes || requestedNoun;
}


// Silent auto-filing: pick the best folder for a chat. Returns a folder name or "".
export async function classifyChat(messages, folders = []) {
  const convo = messages.slice(0, 8).map(m => (m.role === "user" ? "Pastor: " : "Lance: ") + String(m.content || "").replace(/\s+/g, " ").slice(0, 300)).join("\n");
  const list = folders.length
    ? folders.map(f => "- " + f.name + (f.examples.length ? " (for example: " + f.examples.join("; ") + ")" : "")).join("\n")
    : "(no folders yet)";
  const system = "You file chats into folders. Reply with ONLY the folder name, nothing else. Prefer an existing folder. If no existing folder fits and the chat has a clear subject, reply with a new folder name of two to four words, title case, no punctuation. If the chat is only a greeting, a test, or too thin to file, reply NONE.";
  const user = "Folders:\n" + list + "\n\nChat:\n" + convo + "\n\nFolder name:";
  const res = await fetch("https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-lance-key": getLanceKey() },
    body: JSON.stringify({ model: MODEL, max_tokens: 30, system, messages: [{ role: "user", content: user }] }),
  });
  const d = await res.json();
  if (!res.ok || d.error) return "";
  const txt = (d.content || []).filter(b => b && b.type === "text").map(b => b.text || "").join("").trim();
  const name = txt.split("\n")[0].replace(/^["'\s]+|["'.\s]+$/g, "");
  if (!name || /^none$/i.test(name) || name.length > 40) return "";
  return name;
}
