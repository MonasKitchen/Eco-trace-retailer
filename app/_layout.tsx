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
      console.log('Auth state changed:', _event, session); // Debug log
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    console.log('Session or segments changed:', { session, segments, loading }); // Debug log
    
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (session && !inAuthGroup) {
      // User is logged in but not in tabs, redirect to tabs
      console.log('Redirecting to tabs'); // Debug log
      router.replace("/(tabs)");
    } else if (!session && inAuthGroup) {
      // User is logged out but still in tabs, redirect to auth screen
      console.log('Redirecting to auth screen with reset'); // Debug log
      // Use a more aggressive navigation reset
      router.dismissAll();
      setTimeout(() => {
        router.replace("/");
      }, 100);
    }
  }, [session, segments, loading, router]);

  // Show nothing while loading
  if (loading) {
    return null;
  }

  // Force redirect to auth if no session and we're in tabs
  if (!session && segments[0] === '(tabs)') {
    return null; // Don't render anything until navigation completes
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}