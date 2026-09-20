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
  // datetime-local returns "YYYY-MM-DDTHH:mm" without timezone; treat as local and convert to ISO
  const data_envase_iso = new Date(data_envase).toISOString();
  const existing = await getEnvaseByLote(lote_id);
  if (existing) {
    const { error } = await supabase
      .from("envases")
      .update({ qtd_1l, qtd_2l, qtd_5l, qtd_20l, data_envase: data_envase_iso })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("envases")
      .insert({ lote_id, qtd_1l, qtd_2l, qtd_5l, qtd_20l, data_envase: data_envase_iso });
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

  const { data: envase, error: envaseError } = await supabase
    .from("envases")
    .select("qtd_1l, qtd_2l, qtd_5l, qtd_20l")
    .eq("lote_id", lote_id)
    .maybeSingle();
  if (envaseError) throw new Error(envaseError.message);
  if (!envase) return;

  const total =
    (envase.qtd_1l ?? 0) +
    (envase.qtd_2l ?? 0) +
    (envase.qtd_5l ?? 0) +
    (envase.qtd_20l ?? 0);
  if (total === 0) return;

  const { data: lote, error: loteError } = await supabase
    .from("lotes_producao")
    .select("formula_id")
    .eq("id", lote_id)
    .single();
  if (loteError) throw new Error(loteError.message);

  const { data: formula, error: formulaError } = await supabase
    .from("formulas")
    .select("nome")
    .eq("id", lote.formula_id)
    .single();
  if (formulaError) throw new Error(formulaError.message);

  const { data: existing, error: paError } = await supabase
    .from("produtos_acabados")
    .select("id, estoque_atual")
    .eq("nome", formula.nome)
    .maybeSingle();
  if (paError) throw new Error(paError.message);

  if (existing) {
    const { error: updateError } = await supabase
      .from("produtos_acabados")
      .update({ estoque_atual: existing.estoque_atual + total })
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { error: insertError } = await supabase
      .from("produtos_acabados")
      .insert({
        nome: formula.nome,
        lote_id,
        estoque_atual: total,
        estoque_seguranca: 0,
      });
    if (insertError) throw new Error(insertError.message);
  }
}
