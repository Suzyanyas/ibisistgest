"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ErroAcao } from "@/lib/acao";

// supabase.auth.getUser() é uma chamada de rede ao Supabase Auth. cache() a faz uma única
// vez por requisição, mesmo que a action chame getUserRole, requireAdmin e getCurrentUser.
const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

// O papel vem apenas de app_metadata (só editável pelo servidor/service role).
// user_metadata nunca é usado: o próprio usuário pode editá-lo.
export async function getUserRole(): Promise<"admin" | "funcionario" | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const role = user.app_metadata?.role;
  if (role === "admin" || role === "funcionario") return role;
  return null;
}

export async function requireAdmin(): Promise<void> {
  const role = await getUserRole();
  if (role !== "admin") throw new ErroAcao("Apenas administradores.");
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const user = await getAuthUser();
  if (!user || !user.email) return null;
  return { id: user.id, email: user.email };
}
