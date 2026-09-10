"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export type EnvaseRow = Tables<"envases">;

export type LoteEnvaseWithFormula = Tables<"lotes_producao"> & {
  formulas: Pick<
    Tables<"formulas">,
    "nome" | "sigla" | "rendimento" | "rendimento_unidade"
  > | null;
};

export async function getLotesEnvase(): Promise<LoteEnvaseWithFormula[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select("*, formulas(nome, sigla, rendimento, rendimento_unidade)")
    .eq("status", "envase")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LoteEnvaseWithFormula[];
}

export async function getEnvaseByLote(
  lote_id: string
): Promise<EnvaseRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("envases")
    .select("*")
    .eq("lote_id", lote_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveEnvase(
  lote_id: string,
  qtd_1l: number,
  qtd_2l: number,
  qtd_5l: number,
  qtd_20l: number,
  data_envase: string
): Promise<void> {
  const supabase = await createClient();
  const existing = await getEnvaseByLote(lote_id);
  if (existing) {
    const { error } = await supabase
      .from("envases")
      .update({ qtd_1l, qtd_2l, qtd_5l, qtd_20l, data_envase })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("envases")
      .insert({ lote_id, qtd_1l, qtd_2l, qtd_5l, qtd_20l, data_envase });
    if (error) throw new Error(error.message);
  }
}

export async function concluirEnvase(lote_id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lotes_producao")
    .update({ status: "concluido" })
    .eq("id", lote_id);
  if (error) throw new Error(error.message);
}
