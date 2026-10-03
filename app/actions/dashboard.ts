"use server";

// SQL needed (run once in Supabase SQL Editor):
// CREATE TABLE log_atividades (
//   id uuid primary key default gen_random_uuid(),
//   action text not null,
//   detail text,
//   user_id uuid references auth.users(id) on delete set null,
//   user_email text,
//   created_at timestamptz default now()
// );
// alter table log_atividades enable row level security;
// create policy "allow_all_log_atividades" on log_atividades for all using (true) with check (true);

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export type AgendaItemWithFormula = Tables<"agenda_producao"> & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
};

export type LoteEnvaseItem = Tables<"lotes_producao"> & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
};

export type InsumoAbaixo = Pick<
  Tables<"insumos">,
  "id" | "nome" | "estoque_atual" | "unidade" | "estoque_seguranca"
>;

export type ProdutoAbaixo = Pick<
  Tables<"produtos_acabados">,
  "id" | "nome" | "estoque_atual" | "estoque_seguranca"
>;

export async function getAgendaProducao(
  data: string
): Promise<AgendaItemWithFormula[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("agenda_producao")
    .select("*, formulas(nome, sigla)")
    .eq("data_agenda", data)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (rows ?? []) as AgendaItemWithFormula[];
}

export async function getAgendaAtrasada(): Promise<AgendaItemWithFormula[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await supabase
    .from("agenda_producao")
    .select("*, formulas(nome, sigla)")
    .lt("data_agenda", today)
    .eq("concluido", false)
    .order("data_agenda", { ascending: true });
  if (error) throw new Error(error.message);
  return (rows ?? []) as AgendaItemWithFormula[];
}

export async function toggleAgendaItem(
  id: string,
  concluido: boolean
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_producao")
    .update({ concluido })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addAgendaItem(
  formula_id: string,
  data_agenda: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_producao")
    .insert({ formula_id, data_agenda, concluido: false });
  if (error) throw new Error(error.message);
}

export async function deleteAgendaItem(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_producao")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getLotesEmEnvase(): Promise<LoteEnvaseItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select("*, formulas(nome, sigla)")
    .eq("status", "envase")
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) throw new Error(error.message);
  return (data ?? []) as LoteEnvaseItem[];
}

export async function getInsumosAbaixoMinimo(): Promise<InsumoAbaixo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, estoque_atual, unidade, estoque_seguranca")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((i) => i.estoque_atual <= i.estoque_seguranca);
}

export async function getProdutosAbaixoMinimo(): Promise<ProdutoAbaixo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos_acabados")
    .select("id, nome, estoque_atual, estoque_seguranca")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((p) => p.estoque_atual <= p.estoque_seguranca);
}

export type AtividadeItem = {
  action: string;
  detail: string;
  user_email: string | null;
  created_at: string;
};

export async function logAtividade(
  action: string,
  detail: string,
  userId?: string,
  userEmail?: string
): Promise<void> {
  const supabase = await createClient();
  await (supabase as any).from("log_atividades").insert({
    action,
    detail,
    user_id: userId ?? null,
    user_email: userEmail ?? null,
  });
}

export async function getAtividadeRecente(): Promise<AtividadeItem[]> {
  const supabase = await createClient();

  const [lotesRes, movRes, retiradasRes, logRes] = await Promise.all([
    supabase
      .from("lotes_producao")
      .select("numero_lote, user_email, created_at, formulas(nome)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("insumo_movimentos")
      .select("tipo, quantidade, user_email, created_at, insumos(nome, unidade)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("produto_retiradas")
      .select("quantidade, user_email, created_at, produtos_acabados(nome)")
      .order("created_at", { ascending: false })
      .limit(20),
    (supabase as any)
      .from("log_atividades")
      .select("action, detail, user_email, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (lotesRes.error) throw new Error(lotesRes.error.message);
  if (movRes.error) throw new Error(movRes.error.message);
  if (retiradasRes.error) throw new Error(retiradasRes.error.message);
  if (logRes.error) throw new Error(logRes.error.message);

  const lotesAtividade: AtividadeItem[] = (
    (lotesRes.data ?? []) as unknown as Array<{
      numero_lote: string;
      user_email: string | null;
      created_at: string | null;
      formulas: { nome: string } | null;
    }>
  ).map((l) => ({
    action: "Novo lote",
    detail: `${l.numero_lote}: ${l.formulas?.nome ?? "—"}`,
    user_email: l.user_email,
    created_at: l.created_at ?? "",
  }));

  const movAtividade: AtividadeItem[] = (
    (movRes.data ?? []) as unknown as Array<{
      tipo: string;
      quantidade: number;
      user_email: string | null;
      created_at: string | null;
      insumos: { nome: string; unidade: string } | null;
    }>
  ).map((m) => ({
    action: m.tipo === "entrada" ? "Entrada de insumo" : "Ajuste de insumo",
    detail: `${m.insumos?.nome ?? "—"}: ${m.quantidade} ${m.insumos?.unidade ?? ""}`.trim(),
    user_email: m.user_email,
    created_at: m.created_at ?? "",
  }));

  const retiradasAtividade: AtividadeItem[] = (
    (retiradasRes.data ?? []) as unknown as Array<{
      quantidade: number;
      user_email: string | null;
      created_at: string | null;
      produtos_acabados: { nome: string } | null;
    }>
  ).map((r) => ({
    action: "Retirada de produto",
    detail: `${r.produtos_acabados?.nome ?? "—"}: ${r.quantidade} UND`,
    user_email: r.user_email,
    created_at: r.created_at ?? "",
  }));

  const logAtividades: AtividadeItem[] = (
    (logRes.data ?? []) as unknown as Array<{
      action: string;
      detail: string | null;
      user_email: string | null;
      created_at: string | null;
    }>
  ).map((l) => ({
    action: l.action,
    detail: l.detail ?? "",
    user_email: l.user_email,
    created_at: l.created_at ?? "",
  }));

  return [...lotesAtividade, ...movAtividade, ...retiradasAtividade, ...logAtividades]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);
}
