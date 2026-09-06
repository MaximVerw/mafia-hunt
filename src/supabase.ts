import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Use the new publishable key variable
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase environment variables! Check your .env.local file.");
}

// createClient securely handles the publishable key format
export const supabase = createClient(supabaseUrl, supabasePublishableKey);