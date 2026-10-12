"use server";

import { createClient } from "@/lib/supabase/server";

// O papel vem apenas de app_metadata (só editável pelo servidor/service role).
// user_metadata nunca é usado: o próprio usuário pode editá-lo.
export async function getUserRole(): Promise<"admin" | "funcionario" | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const role = data.user.app_metadata?.role;
  if (role === "admin" || role === "funcionario") return role;
  return null;
}

export async function requireAdmin(): Promise<void> {
  const role = await getUserRole();
  if (role !== "admin") throw new Error("Apenas administradores.");
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !data.user.email) return null;
  return { id: data.user.id, email: data.user.email };
}
