import React, { useState, useRef, useEffect, useCallback } from "react";
import { callClaude, speak, downloadDocx, readFile, detectDocumentContent, webSearch, formatSearchResults } from "./api";
import { loadMemory, loadRecentSessions, saveMessage, saveMemoryFact, saveSession, parseMemoryTags, stripMemoryTags } from "./memory";
import { SESSION_ID } from "./config";
import { LanceLogo, SendIcon, SpeakerIcon, StopIcon, DownloadIcon, AttachIcon, CloseIcon } from "./icons";

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
:root { --accent:#C9A84C; --text:#1a2340; --text2:#4a5568; }
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;-webkit-text-size-adjust:100%;}
body{font-family:'DM Sans',-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
textarea:focus,button:focus{outline:none;}
::-webkit-scrollbar{width:0;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@keyframes pulseGlow{0%,100%{filter:drop-shadow(0 0 10px rgba(201,168,76,0.4));}50%{filter:drop-shadow(0 0 26px rgba(201,168,76,0.75));}}
@keyframes dot{0%,80%,100%{transform:scale(0.55);opacity:0.3;}40%{transform:scale(1);opacity:1;}}
@keyframes slideIn{from{opacity:0;transform:translateY(-6px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
.speak-btn{background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:6px;transition:all 0.14s ease;opacity:0.55;}
.speak-btn:hover{opacity:1;background:rgba(201,168,76,0.12);}
.speak-btn.active{opacity:1;color:#C9A84C;}
.teach-toggle{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid;transition:all 0.18s ease;letter-spacing:0.02em;}
.file-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:8px;font-size:13px;color:#fff;font-family:inherit;}
.file-chip button{background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.6);display:flex;align-items:center;padding:0;transition:color 0.12s;}
.file-chip button:hover{color:#fff;}
`;

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages,       setMessages]       = useState([]);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [memoryFacts,    setMemoryFacts]    = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [teachMode,      setTeachMode]      = useState(false);
  const [speakingIdx,    setSpeakingIdx]    = useState(null);
  const [loadingIdx,     setLoadingIdx]     = useState(null);
  const [pendingFiles,   setPendingFiles]   = useState([]);
  const [dragOver,       setDragOver]       = useState(false);
  const [docxIdx,        setDocxIdx]        = useState(null);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const audioRef   = useRef(null);
  const fileRef    = useRef(null);
  const msgCount   = useRef(0);

  // Load memory on mount
  useEffect(() => {
    (async () => {
      const [f, s] = await Promise.all([
        loadMemory().catch(() => []),
        loadRecentSessions().catch(() => []),
      ]);
      setMemoryFacts(Array.isArray(f) ? f : []);
      setRecentSessions(Array.isArray(s) ? s : []);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Voice
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeakingIdx(null);
    setLoadingIdx(null);
  }, []);

  const speakMessage = useCallback(async (text, idx) => {
    stopSpeaking();
    setLoadingIdx(idx);
    const audio = await speak(
      text,
      () => { setLoadingIdx(null); setSpeakingIdx(idx); },
      () => { setSpeakingIdx(null); audioRef.current = null; },
      () => { setLoadingIdx(null); setSpeakingIdx(null); }
    );
    audioRef.current = audio;
  }, [stopSpeaking]);

  // File handling
  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    const read  = await Promise.all(files.map(readFile));
    setPendingFiles(prev => [...prev, ...read]);
  }, []);

  const removeFile = useCallback((idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // Send message
  const send = useCallback(async (textOverride) => {
    const t = (textOverride || input).trim();
    if ((!t && pendingFiles.length === 0) || loading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    stopSpeaking();

    const filesToSend = [...pendingFiles];
    setPendingFiles([]);

    // Build display content for user bubble
    const displayText = t || (filesToSend.length > 0 ? `[${filesToSend.map(f => f.name).join(", ")}]` : "");
    const next = [...messages, { role: "user", content: displayText }];
    setMessages(next);
    setLoading(true);

    if (t) saveMessage("user", t).catch(() => {});

    try {
      // Auto-search: if message looks like it needs current info, search first
      let searchContext = "";
      const needsSearch = /\b(latest|current|recent|today|news|2024|2025|2026|price|weather|who is|what is|how much|when did|search|look up|find out|research)\b/i.test(t);
      if (needsSearch && t.length > 10) {
        try {
          const searchData = await webSearch(t, 5);
          if (searchData.results && searchData.results.length > 0) {
            searchContext = "\n\n[WEB SEARCH RESULTS for: " + t + "]\n" + formatSearchResults(searchData) + "\n[END SEARCH RESULTS]";
          }
        } catch (searchErr) {
          // Search failed silently — Lance continues without it
        }
      }

      // Inject search results into the message if we got them
      const messagesWithSearch = searchContext
        ? [...next.slice(0, -1), { role: "user", content: (next[next.length-1].content || "") + searchContext }]
        : next;

      const raw   = await callClaude(messagesWithSearch, memoryFacts, recentSessions, filesToSend);
      const tags  = parseMemoryTags(raw);
      const clean = stripMemoryTags(raw);
      const idx   = next.length;
      const isDoc = detectDocumentContent(clean);

      setMessages([...next, { role: "assistant", content: clean, isDoc }]);
      msgCount.current += 2;

      saveMessage("assistant", clean).catch(() => {});
      for (const tag of tags) {
        saveMemoryFact(tag.category, tag.fact, tag.confidence, SESSION_ID).catch(() => {});
      }
      if (tags.length > 0) {
        loadMemory().then(f => { if (Array.isArray(f)) setMemoryFacts(f); }).catch(() => {});
      }
      if (msgCount.current % 4 === 0) {
        const summary = `${t.slice(0, 90)}${t.length > 90 ? "…" : ""}`;
        saveSession("general", summary, msgCount.current).catch(() => {});
      }

      if (teachMode) speakMessage(clean, idx);
      if (isDoc) setDocxIdx(idx);

    } catch (e) {
      setMessages([...next, { role: "assistant", content: `Something went wrong: ${e.message}`, isDoc: false }]);
    }
    setLoading(false);
  }, [input, loading, messages, memoryFacts, recentSessions, pendingFiles, teachMode, stopSpeaking, speakMessage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => {
    stopSpeaking();
    setMessages([]);
    setPendingFiles([]);
    setDocxIdx(null);
    msgCount.current = 0;
  };

  const handleDownload = async (text, idx) => {
    try {
      setDocxIdx(idx);
      // Inline docx download — calls Edge Function directly
      const DOCX = "https://dtqmzdteomgjresjfrog.supabase.co/functions/v1/lance-docx";
      const res = await fetch(DOCX, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename: "lance-document" }),
      });
      if (!res.ok) throw new Error("Docx failed: " + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lance-document.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Download failed: " + e.message);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{CSS}</style>
      <div
        style={{ height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(160deg,#0d1321 0%,#1a2340 45%,#0f1b2d 100%)" }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(41,121,255,0.18)", border: "2px dashed rgba(130,177,255,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ color: "#fff", fontSize: "18px", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Drop file for Lance to read</div>
          </div>
        )}

        {/* Header */}
        <div style={{ height: "44px", padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.18)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.10)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <LanceLogo size={30}/>
            <div>
              <div style={{ fontSize: "17px", fontWeight: 600, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Lance</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>Pastor Devon's Agent</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="teach-toggle"
              onClick={() => { setTeachMode(t => !t); if (teachMode) stopSpeaking(); }}
              style={{
                background: teachMode ? "rgba(201,168,76,0.2)" : "rgba(255,255,255,0.1)",
                borderColor: teachMode ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.2)",
                color: teachMode ? "#C9A84C" : "rgba(255,255,255,0.65)",
              }}
            >
              {teachMode ? "🔊 Teaching" : "🔇 Silent"}
            </button>

            {speakingIdx !== null && (
              <button onClick={stopSpeaking} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "8px", background: "rgba(255,80,80,0.2)", border: "1px solid rgba(255,80,80,0.4)", color: "rgba(255,160,160,0.9)", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                <StopIcon/> Stop
              </button>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#69f0ae" }}/>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Online</span>
            </div>

            {messages.length > 0 && (
              <button onClick={clearChat} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", cursor: "pointer", fontSize: "14px", color: "rgba(255,255,255,0.7)", fontFamily: "inherit", padding: "4px 10px" }}>Clear</button>
            )}
          </div>
        </div>

        {/* Chat body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px", display: "flex", flexDirection: "column", gap: "4px" }}>

          {/* Welcome */}
          {isEmpty && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeUp 0.35s ease both" }}>
              <div style={{ textAlign: "center", maxWidth: "360px" }}>
                <div style={{ display: "inline-block", marginBottom: "20px", animation: "pulseGlow 3s ease-in-out infinite" }}>
                  <LanceLogo size={76}/>
                </div>
                <div style={{ fontSize: "32px", fontWeight: 600, color: "#fff", letterSpacing: "-0.03em", marginBottom: "8px", textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>
                  Good to see you, Pastor.
                </div>
                <div style={{ fontSize: "17px", color: "rgba(255,255,255,0.68)", fontWeight: 300, lineHeight: 1.55, marginBottom: "24px" }}>
                  Type anything, drop a file, or just talk.
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                  {["Sermon outline", "Research topic", "Draft email", "Read this file"].map(q => (
                    <button key={q} onClick={() => send(q)} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: "20px", color: "#fff", fontSize: "15px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", fontWeight: 400 }}
                      onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.22)"}
                      onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.12)"}
                    >{q}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", animation: "fadeUp 0.2s ease both", marginBottom: "4px" }}>
              {m.role === "assistant" && (
                <div style={{ flexShrink: 0, marginRight: "8px", alignSelf: "flex-end" }}>
                  <LanceLogo size={24}/>
                </div>
              )}
              <div style={{ maxWidth: "74%", display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: "4px" }}>
                <div style={{
                  padding: "11px 15px",
                  borderRadius: m.role === "user" ? "18px 18px 5px 18px" : "5px 18px 18px 18px",
                  background: m.role === "user" ? "linear-gradient(135deg,#C9A84C,#a07830)" : "rgba(255,255,255,0.95)",
                  color: m.role === "user" ? "#fff" : "var(--text)",
                  fontSize: "16px", lineHeight: "1.65", whiteSpace: "pre-wrap",
                  fontWeight: 300,
                  boxShadow: m.role === "user" ? "0 4px 16px rgba(0,0,0,0.25)" : "0 4px 20px rgba(0,0,0,0.15)",
                  border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.5)",
                  letterSpacing: "-0.005em",
                }}>
                  {m.content}
                </div>

                {/* Action buttons for assistant messages */}
                {m.role === "assistant" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "2px", paddingLeft: "4px" }}>
                    {/* Speak */}
                    <button
                      className={`speak-btn${speakingIdx === i ? " active" : ""}`}
                      onClick={() => speakingIdx === i ? stopSpeaking() : speakMessage(m.content, i)}
                      style={{ color: speakingIdx === i ? "#C9A84C" : "rgba(255,255,255,0.6)" }}
                      title={speakingIdx === i ? "Stop" : "Hear Lance"}
                    >
                      <SpeakerIcon active={speakingIdx === i} spinning={loadingIdx === i}/>
                    </button>

                    {/* Download as Word doc */}
                    <button
                      className="speak-btn"
                      onClick={() => handleDownload(m.content, i)}
                      style={{ color: "rgba(255,255,255,0.6)" }}
                      title="Download as Word doc"
                    >
                      <DownloadIcon/>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing dots */}
          {loading && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", animation: "fadeUp 0.18s ease both" }}>
              <div style={{ flexShrink: 0 }}><LanceLogo size={24}/></div>
              <div style={{ padding: "11px 16px", borderRadius: "5px 18px 18px 18px", background: "rgba(255,255,255,0.95)", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", display: "flex", gap: "5px", alignItems: "center" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#C9A84C", animation: `dot 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef}/>
        </div>

        {/* Input area */}
        <div style={{ padding: "10px 20px 18px", background: "rgba(0,0,0,0.18)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>

          {/* Pending files */}
          {pendingFiles.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
              {pendingFiles.map((f, i) => (
                <div key={i} className="file-chip">
                  <span>{f.name.length > 24 ? f.name.slice(0, 21) + "…" : f.name}</span>
                  <button onClick={() => removeFile(i)} title="Remove"><CloseIcon/></button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", background: "rgba(255,255,255,0.95)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.5)", padding: "9px 10px 9px 16px", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>

            {/* Attach button */}
            <button
              onClick={() => fileRef.current?.click()}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(74,74,106,0.6)", display: "flex", alignItems: "center", padding: "4px", borderRadius: "6px", transition: "color 0.14s", flexShrink: 0 }}
              title="Attach file"
              onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(74,74,106,0.6)"}
            >
              <AttachIcon/>
            </button>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp" style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}/>

            {/* Text input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message Lance…"
              rows={1}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: "17px", color: "var(--text)", resize: "none", lineHeight: "1.5", maxHeight: "120px", overflowY: "auto", fontWeight: 300, letterSpacing: "-0.01em", fontFamily: "inherit" }}
            />

            {/* Send button */}
            <button
              onClick={() => send()}
              disabled={!input.trim() && pendingFiles.length === 0 || loading}
              style={{
                width: "33px", height: "33px", borderRadius: "50%",
                background: (input.trim() || pendingFiles.length > 0) && !loading ? "linear-gradient(135deg,#C9A84C,#a07830)" : "rgba(0,0,0,0.08)",
                border: "none",
                cursor: (input.trim() || pendingFiles.length > 0) && !loading ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                color: (input.trim() || pendingFiles.length > 0) && !loading ? "#fff" : "#aaa",
                boxShadow: (input.trim() || pendingFiles.length > 0) && !loading ? "0 3px 10px rgba(201,168,76,0.4)" : "none",
                transition: "all 0.14s ease",
              }}
            >
              <SendIcon/>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
