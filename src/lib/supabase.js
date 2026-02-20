import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://nrycpjspndvocpnhuuun.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yeWNwanNwbmR2Y3hwbmh1dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODA0MDcsImV4cCI6MjA4Njk1NjQwN30.fFd67FLCD2LVYRjECKldGXZwR_PzKY-tQdM3fh8Px60";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
