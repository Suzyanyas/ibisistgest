"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/app/actions/auth-role";
import { rpcError } from "@/lib/supabase/rpc-error";
import { revalidatePath } from "next/cache";
import type { Tables } from "@/types/supabase";
import type { RpcResultadoFalta } from "@/types/rpc";
import {
  ErroAcao,
  erroBanco,
  executar,
  falha,
  type ResultadoAcao,
  type ResultadoDado,
} from "@/lib/acao";

export type LoteRow = Tables<"lotes_producao">;
export type LoteInsumoRow = Tables<"lote_insumos">;
export type FormulaBasic = Pick<
  Tables<"formulas">,
  "id" | "nome" | "sigla" | "rendimento" | "rendimento_unidade"
>;

export type InsumoEstoque = Pick<
  Tables<"insumos">,
  "id" | "nome" | "unidade" | "estoque_atual" | "densidade" | "tipo"
>;

export type LoteWithFormula = LoteRow & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
};

export type LoteInsumoWithInsumo = LoteInsumoRow & {
  insumos: Pick<Tables<"insumos">, "nome" | "unidade" | "densidade"> | null;
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
  insumos: Omit<InsumoEstoque, "id"> | null;
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
    .select("*, formulas(nome, sigla), lote_insumos(*, insumos(nome, unidade, densidade))")
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
): Promise<ResultadoDado<LoteRow>> {
  return executar("createLote", async () => {
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
    if (loteError) erroBanco("createLote.lote", loteError);
    return lote!;
  });
}

export async function deleteLote(id: string): Promise<ResultadoAcao> {
  return executar("deleteLote", async () => {
    const supabase = await createClient();

    const { count: produtoCount, error: produtoError } = await supabase
      .from("produtos_acabados")
      .select("id", { count: "exact", head: true })
      .eq("lote_id", id);
    if (produtoError) erroBanco("deleteLote.produtos", produtoError);

    if ((produtoCount ?? 0) > 0) {
      throw new ErroAcao(
        "Este lote está vinculado a um produto acabado e não pode ser excluído."
      );
    }

    const { error } = await supabase.from("lotes_producao").delete().eq("id", id);
    if (error) throw rpcError(error);
  });
}

export async function addInsumoToLote(
  lote_id: string,
  insumo_id: string,
  quantidade: number,
  unidade: string
): Promise<ResultadoAcao> {
  return executar("addInsumoToLote", async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("lote_insumos")
      .insert({ lote_id, insumo_id, quantidade, unidade });
    if (error) throw rpcError(error);
  });
}

export async function removeInsumoFromLote(id: string): Promise<ResultadoAcao> {
  return executar("removeInsumoFromLote", async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("lote_insumos").delete().eq("id", id);
    if (error) throw rpcError(error);
  });
}

export async function updateInsumoLote(
  id: string,
  quantidade: number,
  unidade: string
): Promise<ResultadoAcao> {
  return executar("updateInsumoLote", async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("lote_insumos")
      .update({ quantidade, unidade })
      .eq("id", id);
    if (error) throw rpcError(error);
  });
}

export type MoverLoteResultado = RpcResultadoFalta | { ok: false; error: string };

export async function moverLoteParaEnvase(
  loteId: string,
  confirmarFalta: boolean
): Promise<MoverLoteResultado> {
  try {
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
      revalidatePath("/envase");
      revalidatePath("/estoque-insumos");
    }
    return resultado;
  } catch (e) {
    return falha("moverLoteParaEnvase", e);
  }
}

export async function getFormulasList(): Promise<FormulaBasic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formulas")
    .select("id, nome, sigla, rendimento, rendimento_unidade")
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
    .select(
      "id, insumo_id, quantidade, unidade, insumos(nome, unidade, estoque_atual, densidade, tipo)"
    )
    .eq("formula_id", formula_id);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FormulaInsumoPreview[];
}

export async function updateLote(
  id: string,
  numero_lote: string,
  data_producao: string,
  fragancia?: string
): Promise<ResultadoDado<LoteRow>> {
  return executar("updateLote", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lotes_producao")
      .update({ numero_lote, data_producao, fragancia: fragancia || null })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        console.error("[db:updateLote]", error);
        throw new ErroAcao("Já existe um lote com este número.");
      }
      erroBanco("updateLote", error);
    }
    return data!;
  });
}

export async function getInsumosList(
  tipo?: "producao" | "material"
): Promise<InsumoEstoque[]> {
  const supabase = await createClient();
  let query = supabase
    .from("insumos")
    .select("id, nome, unidade, estoque_atual, densidade, tipo")
    .order("nome");
  if (tipo) query = query.eq("tipo", tipo);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
