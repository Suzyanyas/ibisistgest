"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, requireAdmin } from "@/app/actions/auth-role";
import { rpcError } from "@/lib/supabase/rpc-error";
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
    estoque_baixo: p.estoque_atual <= p.estoque_seguranca,
  }));
}

export async function createProdutoAcabado(
  nome: string,
  estoque_seguranca: number,
  estoque_1l: number,
  estoque_2l: number,
  estoque_5l: number,
  estoque_20l: number,
  formula_id: string
): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("criar_produto_acabado", {
    p_nome: nome,
    p_formula_id: formula_id,
    p_estoque_200ml: 0,
    p_estoque_500ml: 0,
    p_estoque_1l: estoque_1l,
    p_estoque_2l: estoque_2l,
    p_estoque_5l: estoque_5l,
    p_estoque_20l: estoque_20l,
    p_estoque_seguranca: estoque_seguranca,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);
}

export async function registrarRetirada(
  produto_id: string,
  qtd_1l: number,
  qtd_2l: number,
  qtd_5l: number,
  qtd_20l: number
): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("registrar_retirada", {
    p_produto_id: produto_id,
    p_qtd_200ml: 0,
    p_qtd_500ml: 0,
    p_qtd_1l: qtd_1l,
    p_qtd_2l: qtd_2l,
    p_qtd_5l: qtd_5l,
    p_qtd_20l: qtd_20l,
    p_obs: null,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);
}

// Define o estoque absoluto por tamanho. 200ml/500ml omitidos mantêm o valor atual.
export async function ajustarProdutoAcabado(
  produto_id: string,
  estoque_1l: number,
  estoque_2l: number,
  estoque_5l: number,
  estoque_20l: number,
  estoque_200ml?: number,
  estoque_500ml?: number,
  obs?: string
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const user = await getCurrentUser();

  let atual200 = estoque_200ml;
  let atual500 = estoque_500ml;
  if (atual200 === undefined || atual500 === undefined) {
    const { data: produto, error: fetchError } = await supabase
      .from("produtos_acabados")
      .select("estoque_200ml, estoque_500ml")
      .eq("id", produto_id)
      .single();
    if (fetchError) throw new Error(fetchError.message);
    atual200 ??= produto.estoque_200ml ?? 0;
    atual500 ??= produto.estoque_500ml ?? 0;
  }

  const { error } = await supabase.rpc("ajustar_produto_acabado", {
    p_produto_id: produto_id,
    p_estoque_200ml: atual200,
    p_estoque_500ml: atual500,
    p_estoque_1l: estoque_1l,
    p_estoque_2l: estoque_2l,
    p_estoque_5l: estoque_5l,
    p_estoque_20l: estoque_20l,
    p_obs: obs ?? null,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);
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
