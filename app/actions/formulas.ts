"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export type FormulaRow = Tables<"formulas">;

export type InsumoBasic = Pick<Tables<"insumos">, "id" | "nome" | "unidade">;

export type FormulaInsumoRow = Tables<"formula_insumos"> & {
  insumos: { nome: string; unidade: string; custo_unitario: number | null } | null;
};

export type FormulaWithInsumos = FormulaRow & {
  formula_insumos: FormulaInsumoRow[];
};

export async function getFormulas(): Promise<FormulaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formulas")
    .select("*")
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getFormulaWithInsumos(
  id: string
): Promise<FormulaWithInsumos> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formulas")
    .select("*, formula_insumos(*, insumos(nome, unidade, custo_unitario))")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as FormulaWithInsumos;
}

export async function createFormula(payload: {
  nome: string;
  sigla: string;
  rendimento: number;
  rendimento_unidade: string;
  obs?: string | null;
}): Promise<FormulaRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formulas")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateFormula(
  id: string,
  payload: {
    nome?: string;
    sigla?: string;
    rendimento?: number;
    rendimento_unidade?: string;
    obs?: string | null;
  }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("formulas")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFormula(id: string): Promise<void> {
  const supabase = await createClient();
  // Delete children first in case there's no CASCADE
  const { error: childError } = await supabase
    .from("formula_insumos")
    .delete()
    .eq("formula_id", id);
  if (childError) throw new Error(childError.message);
  const { error } = await supabase.from("formulas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addInsumoToFormula(
  formula_id: string,
  insumo_id: string,
  quantidade: number,
  unidade: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("formula_insumos")
    .insert({ formula_id, insumo_id, quantidade, unidade });
  if (error) throw new Error(error.message);
}

export async function updateFormulaInsumo(
  id: string,
  quantidade: number,
  unidade: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("formula_insumos")
    .update({ quantidade, unidade })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeInsumoFromFormula(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("formula_insumos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type FormulaCustoBreakdown = {
  formula_insumo_id: string;
  insumo_nome: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  custo_total: number;
};

export type FormulaCusto = {
  total: number;
  breakdown: FormulaCustoBreakdown[];
};

export async function getFormulaCusto(formula_id: string): Promise<FormulaCusto> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formula_insumos")
    .select("id, quantidade, unidade, insumos(nome, custo_unitario)")
    .eq("formula_id", formula_id);
  if (error) throw new Error(error.message);

  const breakdown: FormulaCustoBreakdown[] = (data ?? []).map((row) => {
    const custo_unitario = (row.insumos as unknown as { custo_unitario: number | null } | null)?.custo_unitario ?? 0;
    const custo_total = row.quantidade * custo_unitario;
    return {
      formula_insumo_id: row.id,
      insumo_nome: (row.insumos as unknown as { nome: string } | null)?.nome ?? "—",
      quantidade: row.quantidade,
      unidade: row.unidade,
      custo_unitario,
      custo_total,
    };
  });

  return {
    total: breakdown.reduce((sum, r) => sum + r.custo_total, 0),
    breakdown,
  };
}

export async function getInsumosList(): Promise<InsumoBasic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, unidade")
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}
