"use server";

import { createClient } from "@/lib/supabase/server";

export async function getUserRole(): Promise<"admin" | "funcionario" | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const role = data.user.user_metadata?.role;
  if (role === "admin" || role === "funcionario") return role;
  return null;
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !data.user.email) return null;
  return { id: data.user.id, email: data.user.email };
}
