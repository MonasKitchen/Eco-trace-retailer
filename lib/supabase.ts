import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://cblevrcvwtjditqwgdls.supabase.co";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNibGV2cmN2d3RqZGl0cXdnZGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5NjcxNDAsImV4cCI6MjA3MTU0MzE0MH0.usgR5jspwI-GXncUyp0_RUI9PXxpjSHgZBvII1wq8_Y";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
