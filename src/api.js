import { MODEL, VOICE_URL, DOCX_URL, SEARCH_URL } from "./config";
import { buildSystem } from "./system";

export async function callClaude(messages, facts, sessions, fileContents = [], profile = []) {
  const apiMessages = [...messages];

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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.REACT_APP_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystem(facts, profile, sessions),
      messages: apiMessages,
    }),
  });

  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text || "";
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

export function detectDocumentContent(text) {
  return [/^#\s/m, /^##\s/m, /sermon outline/i, /exam\s*key/i, /study guide/i, /chapter \d+/i, /outline:/i].some(p => p.test(text));
}
