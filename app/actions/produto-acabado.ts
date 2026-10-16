"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, requireAdmin } from "@/app/actions/auth-role";
import { logAtividade } from "@/app/actions/dashboard";
import { rpcError } from "@/lib/supabase/rpc-error";
import { hojeFortaleza, intervaloDiaFortaleza } from "@/lib/fortaleza";
import type { Tables } from "@/types/supabase";

export type ProdutoAcabadoRow = Tables<"produtos_acabados">;
export type RetiradasRow = Tables<"produto_retiradas">;

export type ProdutoAcabadoWithFlag = ProdutoAcabadoRow & {
  estoque_baixo: boolean;
};

export type RetiradasHoje = RetiradasRow & {
  produtos_acabados: Pick<Tables<"produtos_acabados">, "nome"> | null;
};

export type HistoricoProdutoItem = Pick<
  Tables<"envases">,
  | "id"
  | "lote_id"
  | "qtd_200ml"
  | "qtd_500ml"
  | "qtd_1l"
  | "qtd_2l"
  | "qtd_5l"
  | "qtd_20l"
  | "rendimento_real"
  | "data_envase"
  | "user_email"
> & {
  lotes_producao: { numero_lote: string } | null;
  produtos_acabados: { nome: string } | null;
};

export type ResultadoAcao = { ok: true } | { ok: false; error: string };

function revalidarProdutoAcabado() {
  revalidatePath("/");
  revalidatePath("/produto-acabado");
}

function mensagemErro(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

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

export type OrigemProduto = "estoque_inicial" | "produto_de_fora";

export type CreateProdutoAcabadoInput = {
  nome: string;
  formula_id: string;
  estoque_seguranca: number;
  estoque_200ml: number;
  estoque_500ml: number;
  estoque_1l: number;
  estoque_2l: number;
  estoque_5l: number;
  estoque_20l: number;
  origem: OrigemProduto;
  obs: string;
};

export async function createProdutoAcabado(
  input: CreateProdutoAcabadoInput
): Promise<ResultadoAcao> {
  const nome = input.nome.trim();
  const obs = input.obs.trim();
  if (!nome) return { ok: false, error: "Nome é obrigatório." };
  if (!input.formula_id) {
    return { ok: false, error: "Selecione a fórmula correspondente a este produto." };
  }
  if (input.origem !== "estoque_inicial" && input.origem !== "produto_de_fora") {
    return { ok: false, error: "Selecione a origem do produto." };
  }
  if (input.origem === "produto_de_fora" && !obs) {
    return {
      ok: false,
      error: "Informe a observação (ex.: revenda, fornecedor X) para produto de fora.",
    };
  }

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("criar_produto_acabado", {
    p_nome: nome,
    p_formula_id: input.formula_id,
    p_estoque_200ml: input.estoque_200ml,
    p_estoque_500ml: input.estoque_500ml,
    p_estoque_1l: input.estoque_1l,
    p_estoque_2l: input.estoque_2l,
    p_estoque_5l: input.estoque_5l,
    p_estoque_20l: input.estoque_20l,
    p_estoque_seguranca: input.estoque_seguranca,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) return { ok: false, error: rpcError(error).message };

  try {
    await logAtividade(
      input.origem === "produto_de_fora" ? "Produto de fora" : "Estoque inicial",
      obs ? `${nome} | ${obs}` : nome,
      user?.id,
      user?.email
    );
  } catch {
    // o produto já foi criado; falha no histórico não deve desfazer a operação
  }

  revalidarProdutoAcabado();
  return { ok: true };
}

// Tamanhos 200ml e 500ml ficam no fim, com 0 por padrão, para manter as chamadas existentes.
export async function registrarRetirada(
  produto_id: string,
  qtd_1l: number,
  qtd_2l: number,
  qtd_5l: number,
  qtd_20l: number,
  qtd_200ml: number = 0,
  qtd_500ml: number = 0,
  obs?: string
): Promise<ResultadoAcao> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("registrar_retirada", {
    p_produto_id: produto_id,
    p_qtd_200ml: qtd_200ml,
    p_qtd_500ml: qtd_500ml,
    p_qtd_1l: qtd_1l,
    p_qtd_2l: qtd_2l,
    p_qtd_5l: qtd_5l,
    p_qtd_20l: qtd_20l,
    p_obs: obs?.trim() ? obs.trim() : null,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) return { ok: false, error: rpcError(error).message };
  revalidarProdutoAcabado();
  return { ok: true };
}

// Define o estoque absoluto por tamanho. 200ml/500ml omitidos mantêm o valor atual.
// Ordem dos argumentos: produto_id, 1L, 2L, 5L, 20L, 200ml, 500ml, obs.
export async function ajustarProdutoAcabado(
  produto_id: string,
  estoque_1l: number,
  estoque_2l: number,
  estoque_5l: number,
  estoque_20l: number,
  estoque_200ml?: number,
  estoque_500ml?: number,
  obs?: string
): Promise<ResultadoAcao> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: mensagemErro(e, "Apenas administradores.") };
  }
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
    if (fetchError) return { ok: false, error: "Produto acabado não encontrado." };
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
  if (error) return { ok: false, error: rpcError(error).message };
  revalidarProdutoAcabado();
  return { ok: true };
}

// Retiradas de um dia (YYYY-MM-DD) no fuso America/Fortaleza.
// Filtra por created_at (instante real) para não depender do fuso do servidor da base.
export async function getRetiradasPorData(dataISO: string): Promise<RetiradasHoje[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) throw new Error("Data inválida.");
  const { inicio, fim } = intervaloDiaFortaleza(dataISO);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produto_retiradas")
    .select("*, produtos_acabados(nome)")
    .gte("created_at", inicio)
    .lt("created_at", fim)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RetiradasHoje[];
}

export async function getRetiradasHoje(): Promise<RetiradasHoje[]> {
  return getRetiradasPorData(hojeFortaleza());
}

// Envases cujo produto de destino é este produto (lotes sem produto_acabado_id ficam de fora).
export async function getHistoricoProduto(
  produto_id: string
): Promise<HistoricoProdutoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("envases")
    .select(
      "id, lote_id, qtd_200ml, qtd_500ml, qtd_1l, qtd_2l, qtd_5l, qtd_20l, rendimento_real, data_envase, user_email, lotes_producao(numero_lote), produtos_acabados(nome)"
    )
    .eq("produto_acabado_id", produto_id)
    .order("data_envase", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HistoricoProdutoItem[];
}
