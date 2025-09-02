import { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./global.css";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (session && !inAuthGroup) {
      // User is logged in but not in tabs, redirect to tabs
      router.replace("/(tabs)");
    } else if (!session && inAuthGroup) {
      // User is not logged in but in tabs, redirect to auth
      router.replace("/");
    }
  }, [session, segments, loading, router]);

  if (loading) {
    return null; // Show nothing while loading
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}