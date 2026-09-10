"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export type LoteRow = Tables<"lotes_producao">;
export type LoteInsumoRow = Tables<"lote_insumos">;
export type FormulaBasic = Pick<Tables<"formulas">, "id" | "nome" | "sigla">;

export type LoteWithFormula = LoteRow & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
};

export type LoteInsumoWithInsumo = LoteInsumoRow & {
  insumos: Pick<Tables<"insumos">, "nome" | "unidade"> | null;
};

export type LoteWithDetails = LoteRow & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
  lote_insumos: LoteInsumoWithInsumo[];
};

export type FormulaInsumoPreview = {
  id: string;
  insumo_id: string;
  quantidade: number;
  unidade: string;
  insumos: { nome: string; unidade: string } | null;
};

export async function getLotesProducao(): Promise<LoteWithFormula[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select("*, formulas(nome, sigla)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LoteWithFormula[];
}

export async function getLoteWithInsumos(id: string): Promise<LoteWithDetails> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select("*, formulas(nome, sigla), lote_insumos(*, insumos(nome, unidade))")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as LoteWithDetails;
}

export async function createLote(
  formula_id: string,
  numero_lote: string,
  data_producao: string
): Promise<LoteRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .insert({ formula_id, numero_lote, data_producao, status: "producao" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const lote = data;

  const { data: formulaInsumos, error: fiError } = await supabase
    .from("formula_insumos")
    .select("insumo_id, quantidade, unidade")
    .eq("formula_id", formula_id);
  if (fiError) throw new Error(fiError.message);

  if (formulaInsumos && formulaInsumos.length > 0) {
    const inserts = formulaInsumos.map((fi) => ({
      lote_id: lote.id,
      insumo_id: fi.insumo_id,
      quantidade: fi.quantidade,
      unidade: fi.unidade,
    }));
    const { error: insertError } = await supabase
      .from("lote_insumos")
      .insert(inserts);
    if (insertError) throw new Error(insertError.message);
  }

  return lote;
}

export async function deleteLote(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("lotes_producao").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addInsumoToLote(
  lote_id: string,
  insumo_id: string,
  quantidade: number,
  unidade: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lote_insumos")
    .insert({ lote_id, insumo_id, quantidade, unidade });
  if (error) throw new Error(error.message);
}

export async function removeInsumoFromLote(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("lote_insumos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateInsumoLote(
  id: string,
  quantidade: number,
  unidade: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lote_insumos")
    .update({ quantidade, unidade })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateLoteStatus(
  id: string,
  status: "producao" | "envase" | "concluido"
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lotes_producao")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getFormulasList(): Promise<FormulaBasic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formulas")
    .select("id, nome, sigla")
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getFormulaInsumos(
  formula_id: string
): Promise<FormulaInsumoPreview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formula_insumos")
    .select("id, insumo_id, quantidade, unidade, insumos(nome, unidade)")
    .eq("formula_id", formula_id);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FormulaInsumoPreview[];
}

export async function getInsumosList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, unidade")
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}
