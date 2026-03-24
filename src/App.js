import { useState, useRef, useEffect } from "react";
 
const SUPABASE_URL = "https://dtqmzdteomgjresjfrog.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cW16ZHRlb21nanJlc2pmcm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTU1NDYsImV4cCI6MjA4NzQ5MTU0Nn0.C6PQfoGgx4Y6g0f26qlI6WwAaY46Mde6SUmMIUfBjSw";
const VOICE_URL   = `${SUPABASE_URL}/functions/v1/lance-voice`;
 
const sbH = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
};
 
async function sbInsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:"POST", headers:sbH, body:JSON.stringify(data) });
}
async function sbSelect(table, params="") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:sbH });
  return r.ok ? r.json() : [];
}
async function fetchMemory() {
  return sbSelect("lance_memory","active=eq.true&order=confidence.desc,updated_at.desc&limit=40");
}
async function fetchRecentSessions() {
  return sbSelect("lance_sessions","summary=not.is.null&order=created_at.desc&limit=5");
}
async function saveMessage(sid, role, content, lane) {
  await sbInsert("lance_conversations",{session_id:sid,role,content,lane});
}
async function saveMemoryFact(cat, fact, conf, sid) {
  await sbInsert("lance_memory",{category:cat,fact,confidence:conf,source_session:sid,active:true});
}
async function saveSession(sid, lane, summary, count) {
  await fetch(`${SUPABASE_URL}/rest/v1/lance_sessions`,{
    method:"POST", headers:{...sbH,"Prefer":"resolution=merge-duplicates"},
    body:JSON.stringify({id:sid,lane,summary,message_count:count}),
  });
}
 
async function speak(text, onStart, onEnd, onError) {
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
 
function parseMemoryTags(text) {
  const tags=[], re=/\[MEMORY:\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d)\s*\]/gi;
  let m;
  while((m=re.exec(text))!==null) tags.push({category:m[1].trim().toLowerCase(),fact:m[2].trim(),confidence:parseInt(m[3])});
  return tags;
}
function stripMemoryTags(t){ return t.replace(/\[MEMORY:[^\]]+\]/gi,"").trim(); }
 
function buildSystem(facts, sessions) {
  const mem = facts.length>0
    ? `\n\n━━━ LANCE'S SOUL ━━━\nThe following is what Lance has learned about Pastor over time. This is not data to reference — it is who Lance has become through knowing him. Lance does not announce this knowledge. He simply lives it.\n\n${facts.map(f=>`• [${f.category}] ${f.fact}`).join("\n")}`
    : "";
  const ses = sessions.length>0
    ? `\n\n━━━ RECENT CONVERSATIONS ━━━\n${sessions.map(s=>`• ${new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})} — ${s.lane}: ${s.summary}`).join("\n")}`
    : "";
