"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getUserRole, requireAdmin } from "@/app/actions/auth-role";
import { logAtividade } from "@/app/actions/dashboard";
import { rpcError } from "@/lib/supabase/rpc-error";
import { hojeFortaleza, intervaloDiaFortaleza } from "@/lib/fortaleza";
import type { Tables } from "@/types/supabase";
import type { RpcResultadoMesclar, RpcResultadoOk } from "@/types/rpc";

export type ProdutoAcabadoRow = Tables<"produtos_acabados">;
export type RetiradasRow = Tables<"produto_retiradas">;

export type ProdutoAcabadoWithFlag = ProdutoAcabadoRow & {
  estoque_baixo: boolean;
  formula_nome: string | null;
  envases_count: number;
  retiradas_count: number;
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

type ContagemEmbutida = { count: number }[] | null;

function contar(c: ContagemEmbutida): number {
  return c?.[0]?.count ?? 0;
}

// Nome da fórmula por id, em uma única consulta
async function nomesDeFormulas(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter((id): id is string => !!id)));
  const nomes = new Map<string, string>();
  if (unicos.length === 0) return nomes;
  const supabase = await createClient();
  const { data, error } = await supabase.from("formulas").select("id, nome").in("id", unicos);
  if (error) throw new Error(error.message);
  for (const f of data ?? []) nomes.set(f.id, f.nome);
  return nomes;
}

// Produtos arquivados ficam ocultos para todos; só administradores podem pedi-los.
export async function getProdutosAcabados(
  incluirArquivados: boolean = false
): Promise<ProdutoAcabadoWithFlag[]> {
  const mostrarArquivados = incluirArquivados && (await getUserRole()) === "admin";
  const supabase = await createClient();
  let query = supabase
    .from("produtos_acabados")
    .select("*, envases(count), produto_retiradas(count)")
    .order("nome");
  if (!mostrarArquivados) query = query.eq("ativo", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const linhas = data ?? [];
  const nomes = await nomesDeFormulas(linhas.map((p) => p.formula_id));
  return linhas.map(({ envases, produto_retiradas, ...p }) => ({
    ...p,
    estoque_baixo: p.ativo && p.estoque_atual <= p.estoque_seguranca,
    formula_nome: p.formula_id ? (nomes.get(p.formula_id) ?? null) : null,
    envases_count: contar(envases as ContagemEmbutida),
    retiradas_count: contar(produto_retiradas as ContagemEmbutida),
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

// ─── Gestão de produtos (somente administradores) ────────────────────────────

function revalidarGestaoProdutos() {
  revalidatePath("/");
  revalidatePath("/produto-acabado");
  revalidatePath("/envase");
}

export type ProdutoGestaoInfo = {
  id: string;
  nome: string;
  ativo: boolean;
  estoque_seguranca: number;
  formula: { id: string; nome: string } | null;
  estoque_200ml: number;
  estoque_500ml: number;
  estoque_1l: number;
  estoque_2l: number;
  estoque_5l: number;
  estoque_20l: number;
  envases_count: number;
  retiradas_count: number;
};

// Dados do modal Gerir para um ou dois produtos: uma consulta com as contagens agrupadas
// (envases e retiradas embutidos) e outra para os nomes das fórmulas.
export async function getProdutosParaGestao(
  ids: string[]
): Promise<{ ok: true; produtos: ProdutoGestaoInfo[] } | { ok: false; error: string }> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: mensagemErro(e, "Apenas administradores.") };
  }
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (unicos.length === 0) return { ok: true, produtos: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos_acabados")
    .select(
      "id, nome, ativo, estoque_seguranca, formula_id, estoque_200ml, estoque_500ml, estoque_1l, estoque_2l, estoque_5l, estoque_20l, envases(count), produto_retiradas(count)"
    )
    .in("id", unicos);
  if (error) return { ok: false, error: rpcError(error).message };

  const linhas = data ?? [];
  let nomes: Map<string, string>;
  try {
    nomes = await nomesDeFormulas(linhas.map((p) => p.formula_id));
  } catch (e) {
    return { ok: false, error: mensagemErro(e, "Erro ao carregar as fórmulas.") };
  }
  return {
    ok: true,
    produtos: linhas.map(({ envases, produto_retiradas, formula_id, ...p }) => ({
      ...p,
      formula: formula_id ? { id: formula_id, nome: nomes.get(formula_id) ?? "—" } : null,
      envases_count: contar(envases as ContagemEmbutida),
      retiradas_count: contar(produto_retiradas as ContagemEmbutida),
    })),
  };
}

export type EditarProdutoInput = {
  id: string;
  nome: string;
  estoque_seguranca: number;
  formula_id: string | null;
  obs?: string;
};

export async function editarProduto(input: EditarProdutoInput): Promise<ResultadoAcao> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: mensagemErro(e, "Apenas administradores.") };
  }
  const nome = input.nome.trim();
  if (!nome) return { ok: false, error: "O nome do produto é obrigatório." };
  if (!Number.isInteger(input.estoque_seguranca) || input.estoque_seguranca < 0) {
    return {
      ok: false,
      error: "O estoque mínimo deve ser um número inteiro maior ou igual a zero.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("editar_produto_acabado", {
    p_id: input.id,
    p_nome: nome,
    p_estoque_seguranca: input.estoque_seguranca,
    p_formula_id: input.formula_id || null,
    p_obs: input.obs?.trim() || null,
  });
  if (error) return { ok: false, error: rpcError(error).message };
  if ((data as RpcResultadoOk | null)?.ok !== true) {
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
  revalidarGestaoProdutos();
  return { ok: true };
}

export async function arquivarProduto(
  id: string,
  arquivar: boolean,
  obs?: string
): Promise<ResultadoAcao> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: mensagemErro(e, "Apenas administradores.") };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("arquivar_produto_acabado", {
    p_id: id,
    p_arquivar: arquivar,
    p_obs: obs?.trim() || null,
  });
  if (error) return { ok: false, error: rpcError(error).message };
  if ((data as RpcResultadoOk | null)?.ok !== true) {
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
  revalidarGestaoProdutos();
  return { ok: true };
}

export async function excluirProduto(id: string, obs?: string): Promise<ResultadoAcao> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: mensagemErro(e, "Apenas administradores.") };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("excluir_produto_acabado", {
    p_id: id,
    p_obs: obs?.trim() || null,
  });
  if (error) return { ok: false, error: rpcError(error).message };
  if ((data as RpcResultadoOk | null)?.ok !== true) {
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
  revalidarGestaoProdutos();
  return { ok: true };
}

export type ModoMesclagem = "somar" | "manter_destino";

export async function mesclarProdutos(
  origem_id: string,
  destino_id: string,
  modo: ModoMesclagem,
  obs?: string
): Promise<ResultadoAcao> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: mensagemErro(e, "Apenas administradores.") };
  }
  if (!origem_id || !destino_id) {
    return { ok: false, error: "Selecione o produto a remover e o produto que fica." };
  }
  if (origem_id === destino_id) {
    return { ok: false, error: "Escolha dois produtos diferentes para mesclar." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mesclar_produtos", {
    p_origem_id: origem_id,
    p_destino_id: destino_id,
    p_modo: modo,
    p_obs: obs?.trim() || null,
  });
  if (error) return { ok: false, error: rpcError(error).message };
  if ((data as RpcResultadoMesclar | null)?.ok !== true) {
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
  revalidarGestaoProdutos();
  return { ok: true };
}
