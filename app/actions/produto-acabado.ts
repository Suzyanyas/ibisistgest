"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export type ProdutoAcabadoRow = Tables<"produtos_acabados">;
export type RetiradasRow = Tables<"produto_retiradas">;

export type ProdutoAcabadoWithFlag = ProdutoAcabadoRow & {
  estoque_baixo: boolean;
};

export type RetiradasHoje = RetiradasRow & {
  produtos_acabados: Pick<Tables<"produtos_acabados">, "nome"> | null;
};

export type LoteConcluidoWithFormula = Tables<"lotes_producao"> & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
};

export async function getProdutosAcabados(): Promise<ProdutoAcabadoWithFlag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos_acabados")
    .select("*")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    ...p,
    estoque_baixo: p.estoque_atual < p.estoque_seguranca,
  }));
}

export async function createProdutoAcabado(
  nome: string,
  lote_id: string | null,
  estoque_inicial: number,
  estoque_seguranca: number
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("produtos_acabados").insert({
    nome,
    lote_id: lote_id || null,
    estoque_atual: estoque_inicial,
    estoque_seguranca,
  });
  if (error) throw new Error(error.message);
}

export async function registrarRetirada(
  produto_id: string,
  quantidade: number
): Promise<void> {
  const supabase = await createClient();

  const { data: produto, error: fetchErr } = await supabase
    .from("produtos_acabados")
    .select("estoque_atual")
    .eq("id", produto_id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const novoEstoque = (produto.estoque_atual ?? 0) - quantidade;

  const { error: updateErr } = await supabase
    .from("produtos_acabados")
    .update({ estoque_atual: novoEstoque })
    .eq("id", produto_id);
  if (updateErr) throw new Error(updateErr.message);

  const today = new Date().toISOString().slice(0, 10);
  const { error: insertErr } = await supabase
    .from("produto_retiradas")
    .insert({ produto_id, quantidade, data_retirada: today });
  if (insertErr) throw new Error(insertErr.message);
}

export async function getRetiradasHoje(): Promise<RetiradasHoje[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("produto_retiradas")
    .select("*, produtos_acabados(nome)")
    .eq("data_retirada", today)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RetiradasHoje[];
}

export async function getLotesConcluidos(): Promise<LoteConcluidoWithFormula[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select("*, formulas(nome, sigla)")
    .eq("status", "concluido")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LoteConcluidoWithFormula[];
}
