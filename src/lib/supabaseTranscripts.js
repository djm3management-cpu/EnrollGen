import { createClient } from "@supabase/supabase-js";

// Separate Supabase project for RAG / transcript search
// Tables: agents, call_transcripts, transcript_chunks
const transcriptsUrl =
  import.meta.env.VITE_TRANSCRIPTS_SUPABASE_URL ||
  "https://qzjtagnpklaxefwurorc.supabase.co";
const transcriptsAnonKey =
  import.meta.env.VITE_TRANSCRIPTS_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6anRhZ25wa2xheGVmd3Vyb3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODY1NDQsImV4cCI6MjA4ODI2MjU0NH0.HLYREWlaqsMdhGqaoP2T2SP3SgAoxumKGG4aQuBzx4Q";

export const supabaseTranscripts = createClient(transcriptsUrl, transcriptsAnonKey);
