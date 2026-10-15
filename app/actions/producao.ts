"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/app/actions/auth-role";
import { rpcError } from "@/lib/supabase/rpc-error";
import { revalidatePath } from "next/cache";
import type { Tables } from "@/types/supabase";
import type { RpcResultadoFalta } from "@/types/rpc";

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
  data_producao: string,
  insumoOverrides?: Array<{ insumo_id: string; quantidade: number; unidade: string }>,
  fragancia?: string
): Promise<LoteRow> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: loteId, error } = await supabase.rpc("criar_lote", {
    p_formula_id: formula_id,
    p_numero_lote: numero_lote,
    p_data_producao: data_producao,
    p_fragancia: fragancia || null,
    // lista vazia: a função usa os insumos da fórmula
    p_insumos: insumoOverrides ?? [],
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);

  const { data: lote, error: loteError } = await supabase
    .from("lotes_producao")
    .select("*")
    .eq("id", loteId as string)
    .single();
  if (loteError) throw new Error(loteError.message);
  return lote;
}

export async function deleteLote(id: string): Promise<void> {
  const supabase = await createClient();

  const { count: produtoCount, error: produtoError } = await supabase
    .from("produtos_acabados")
    .select("id", { count: "exact", head: true })
    .eq("lote_id", id);
  if (produtoError) throw new Error(produtoError.message);

  if ((produtoCount ?? 0) > 0) {
    throw new Error(
      "Este lote está vinculado a um produto acabado e não pode ser excluído."
    );
  }

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

export async function moverLoteParaEnvase(
  loteId: string,
  confirmarFalta: boolean
): Promise<RpcResultadoFalta> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  // a função regista a atividade e os movimentos por conta própria
  const { data, error } = await supabase.rpc("mover_lote_para_envase", {
    p_lote_id: loteId,
    p_confirmar_falta: confirmarFalta,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);

  const resultado = data as unknown as RpcResultadoFalta;
  if (resultado.ok) {
    revalidatePath("/");
    revalidatePath("/producao");
    revalidatePath("/envase");
    revalidatePath("/estoque-insumos");
  }
  return resultado;
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

export async function updateLote(
  id: string,
  numero_lote: string,
  data_producao: string,
  fragancia?: string
): Promise<LoteRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .update({ numero_lote, data_producao, fragancia: fragancia || null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getInsumosList(tipo?: "producao" | "material") {
  const supabase = await createClient();
  let query = supabase.from("insumos").select("id, nome, unidade").order("nome");
  if (tipo) query = query.eq("tipo", tipo);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
