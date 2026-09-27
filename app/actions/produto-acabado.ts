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

export type HistoricoProdutoItem = Tables<"lotes_producao"> & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
  envases: Pick<
    Tables<"envases">,
    "qtd_1l" | "qtd_2l" | "qtd_5l" | "qtd_20l" | "rendimento_real" | "data_envase"
  >[];
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
  estoque_seguranca: number,
  estoque_1l: number,
  estoque_2l: number,
  estoque_5l: number,
  estoque_20l: number
): Promise<void> {
  const supabase = await createClient();
  const estoque_atual = estoque_1l + estoque_2l + estoque_5l + estoque_20l;
  const { error } = await supabase.from("produtos_acabados").insert({
    nome,
    lote_id: lote_id || null,
    estoque_atual,
    estoque_seguranca,
    estoque_1l,
    estoque_2l,
    estoque_5l,
    estoque_20l,
  });
  if (error) throw new Error(error.message);
}

export async function registrarRetirada(
  produto_id: string,
  qtd_1l: number,
  qtd_2l: number,
  qtd_5l: number,
  qtd_20l: number
): Promise<void> {
  const supabase = await createClient();
  const total = qtd_1l + qtd_2l + qtd_5l + qtd_20l;

  const { data: produto, error: fetchErr } = await supabase
    .from("produtos_acabados")
    .select("estoque_atual, estoque_1l, estoque_2l, estoque_5l, estoque_20l")
    .eq("id", produto_id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const { error: updateErr } = await supabase
    .from("produtos_acabados")
    .update({
      estoque_atual: (produto.estoque_atual ?? 0) - total,
      estoque_1l: (produto.estoque_1l ?? 0) - qtd_1l,
      estoque_2l: (produto.estoque_2l ?? 0) - qtd_2l,
      estoque_5l: (produto.estoque_5l ?? 0) - qtd_5l,
      estoque_20l: (produto.estoque_20l ?? 0) - qtd_20l,
    })
    .eq("id", produto_id);
  if (updateErr) throw new Error(updateErr.message);

  const today = new Date().toISOString().slice(0, 10);
  const { error: insertErr } = await supabase
    .from("produto_retiradas")
    .insert({ produto_id, quantidade: total, qtd_1l, qtd_2l, qtd_5l, qtd_20l, data_retirada: today });
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

export async function getHistoricoProduto(
  produto_nome: string
): Promise<HistoricoProdutoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select(
      "*, formulas!inner(nome, sigla), envases(qtd_1l, qtd_2l, qtd_5l, qtd_20l, rendimento_real, data_envase)"
    )
    .eq("status", "concluido")
    .eq("formulas.nome", produto_nome)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const withEnvase = ((data ?? []) as HistoricoProdutoItem[]).filter(
    (l) => l.envases && l.envases.length > 0
  );
  withEnvase.sort((a, b) => {
    const da = a.envases[0]?.data_envase ?? "";
    const db = b.envases[0]?.data_envase ?? "";
    return db.localeCompare(da);
  });
  return withEnvase;
}
