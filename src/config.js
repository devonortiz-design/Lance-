export const SUPABASE_URL = "https://dtqmzdteomgjresjfrog.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cW16ZHRlb21nanJlc2pmcm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTU1NDYsImV4cCI6MjA4NzQ5MTU0Nn0.C6PQfoGgx4Y6g0f26qlI6WwAaY46Mde6SUmMIUfBjSw";
export const VOICE_URL = `${SUPABASE_URL}/functions/v1/lance-voice`;
export const DOCX_URL  = `${SUPABASE_URL}/functions/v1/lance-docx`;
export const MODEL     = "claude-sonnet-4-20250514";
export const SESSION_ID = crypto.randomUUID();
export const SB_HEADERS = {"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Prefer":"return=representation"};