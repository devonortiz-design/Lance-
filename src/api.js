import { MODEL, VOICE_URL, DOCX_URL } from "./config";
import { buildSystem } from "./system";

// ── Claude ────────────────────────────────────────────────────────────────────
export async function callClaude(messages, facts, sessions, fileContents = []) {
  const apiMessages = [...messages];

  // Inject file contents as the first user message if present
  if (fileContents.length > 0) {
    const fileBlocks = fileContents.map(f => {
      if (f.type === "image") {
        return { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.data } };
      }
      if (f.type === "document") {
        return { type: "document", source: { type: "base64", media_type: f.mediaType, data: f.data } };
      }
      return { type: "text", text: `[File: ${f.name}]\n${f.text}` };
    });

    // Attach to the last user message
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
      system: buildSystem(facts, sessions),
      messages: apiMessages,
    }),
  });

  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text || "";
}

// ── Voice ─────────────────────────────────────────────────────────────────────
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
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); onEnd?.(); };
    audio.onerror = () => { URL.revokeObjectURL(url); onError?.(); };
    audio.play();
    return audio;
  } catch (e) {
    onError?.(e);
    return null;
  }
}

// ── Word Doc ──────────────────────────────────────────────────────────────────
export async function downloadDocx(text, filename) {
  const res = await fetch(DOCX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, filename: filename || "lance-document" }),
  });
  if (!res.ok) throw new Error("Docx generation failed");
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = (filename || "lance-document").replace(/\.docx$/, "") + ".docx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── File Reading ──────────────────────────────────────────────────────────────
export async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isImage = file.type.startsWith("image/");
    const isPDF   = file.type === "application/pdf";

    if (isImage || isPDF) {
      reader.onload = () => {
        const data = reader.result.split(",")[1];
        resolve({
          name: file.name,
          type: isPDF ? "document" : "image",
          mediaType: file.type,
          data,
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => resolve({ name: file.name, type: "text", text: reader.result });
      reader.onerror = reject;
      reader.readAsText(file);
    }
  });
}

// ── Gmail via Claude ──────────────────────────────────────────────────────────
// Lance drafts emails through conversation. The user confirms before sending.
// Actual sending happens through the Gmail MCP when integrated.
export function detectDocumentContent(text) {
  const docPatterns = [
    /^#\s/m, /^##\s/m, /^###\s/m,
    /sermon outline/i, /exam\s*key/i, /study guide/i,
    /chapter \d+/i, /outline:/i, /lecture notes/i,
  ];
  return docPatterns.some(p => p.test(text));
}
