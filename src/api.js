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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf";
    if (isImage || isPDF) {
      reader.onload = () => resolve({ name: file.name, type: isPDF ? "document" : "image", mediaType: file.type, data: reader.result.split(",")[1] });
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
