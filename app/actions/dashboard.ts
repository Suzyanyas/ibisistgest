"use server";

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
    .order("created_at", { ascending: false });
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
  return (data ?? []).filter((i) => i.estoque_atual < i.estoque_seguranca);
}

export async function getProdutosAbaixoMinimo(): Promise<ProdutoAbaixo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos_acabados")
    .select("id, nome, estoque_atual, estoque_seguranca")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((p) => p.estoque_atual < p.estoque_seguranca);
}
