import { useState, useRef, useEffect } from "react";

// ── Config ──
const SUPABASE_URL = "https://dtqmzdteomgjresjfrog.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cW16ZHRlb21nanJlc2pmcm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTU1NDYsImV4cCI6MjA4NzQ5MTU0Nn0.C6PQfoGgx4Y6g0f26qlI6WwAaY46Mde6SUmMIUfBjSw";
const VOICE_URL   = `${SUPABASE_URL}/functions/v1/lance-voice`;

const sbH = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
};

any function sbInsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:"POST", headers:sbH, body:JSON.stringify(data) });
}