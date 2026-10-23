"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/app/actions/auth-role";
import { revalidatePath } from "next/cache";
import { rpcError } from "@/lib/supabase/rpc-error";
import { falha } from "@/lib/acao";
import type { FaltaItem } from "@/types/rpc";
import type { Tables } from "@/types/supabase";

export type EnvaseRow = Tables<"envases">;

export type LoteEnvaseWithFormula = Tables<"lotes_producao"> & {
  formulas: Pick<
    Tables<"formulas">,
    "nome" | "sigla" | "rendimento" | "rendimento_unidade"
  > | null;
};

export type HistoricoEnvaseItem = Tables<"lotes_producao"> & {
  formulas: Pick<
    Tables<"formulas">,
    "nome" | "sigla" | "rendimento" | "rendimento_unidade"
  > | null;
  envases: (Pick<
    Tables<"envases">,
    | "qtd_200ml"
    | "qtd_500ml"
    | "qtd_1l"
    | "qtd_2l"
    | "qtd_5l"
    | "qtd_20l"
    | "rendimento_real"
    | "data_envase"
    | "produto_acabado_id"
  > & {
    produtos_acabados: { nome: string } | null;
  })[];
};

export async function getHistoricoEnvases(): Promise<HistoricoEnvaseItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select(
      "*, formulas(nome, sigla, rendimento, rendimento_unidade), envases(qtd_200ml, qtd_500ml, qtd_1l, qtd_2l, qtd_5l, qtd_20l, rendimento_real, data_envase, produto_acabado_id, produtos_acabados(nome))"
    )
    .eq("status", "concluido")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const withEnvase = ((data ?? []) as unknown as HistoricoEnvaseItem[]).filter(
    (l) => l.envases && l.envases.length > 0
  );
  withEnvase.sort((a, b) => {
    const da = a.envases[0]?.data_envase ?? "";
    const db = b.envases[0]?.data_envase ?? "";
    return db.localeCompare(da);
  });
  return withEnvase;
}

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

// Rascunho: grava as quantidades de um lote que ainda está em envase.
async function saveEnvaseInterno(
  lote_id: string,
  qtd_200ml: number,
  qtd_500ml: number,
  qtd_1l: number,
  qtd_2l: number,
  qtd_5l: number,
  qtd_20l: number,
  data_envase: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: lote, error: loteError } = await supabase
    .from("lotes_producao")
    .select("status, numero_lote")
    .eq("id", lote_id)
    .maybeSingle();
  if (loteError) throw new Error(loteError.message);
  if (!lote) return { ok: false, error: "Lote não encontrado." };
  if (lote.status !== "envase") {
    return {
      ok: false,
      error: `O lote ${lote.numero_lote} não está em envase e não pode ser alterado.`,
    };
  }

  // datetime-local returns "YYYY-MM-DDTHH:mm" without timezone; treat as local and convert to ISO
  const data = new Date(data_envase);
  if (Number.isNaN(data.getTime())) {
    return { ok: false, error: "Data do envase inválida." };
  }
  const data_envase_iso = data.toISOString();
  const rendimento_real =
    qtd_200ml * 0.2 + qtd_500ml * 0.5 + qtd_1l * 1 + qtd_2l * 2 + qtd_5l * 5 + qtd_20l * 20;
  const existing = await getEnvaseByLote(lote_id);
  if (existing) {
    const { error } = await supabase
      .from("envases")
      .update({
        qtd_200ml,
        qtd_500ml,
        qtd_1l,
        qtd_2l,
        qtd_5l,
        qtd_20l,
        data_envase: data_envase_iso,
        rendimento_real,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("envases").insert({
      lote_id,
      qtd_200ml,
      qtd_500ml,
      qtd_1l,
      qtd_2l,
      qtd_5l,
      qtd_20l,
      data_envase: data_envase_iso,
      rendimento_real,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    });
    if (error) throw new Error(error.message);
  }
  return { ok: true };
}

export async function saveEnvase(
  ...args: Parameters<typeof saveEnvaseInterno>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await saveEnvaseInterno(...args);
  } catch (e) {
    return falha("saveEnvase", e);
  }
}

export type LoteInsumoItem = {
  nome: string;
  quantidade: number;
  unidade: string;
};

export async function getLoteInsumos(lote_id: string): Promise<LoteInsumoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lote_insumos")
    .select("quantidade, unidade, insumos(nome)")
    .eq("lote_id", lote_id);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{ quantidade: number; unidade: string | null; insumos: { nome: string } | null }>).map((row) => ({
    nome: row.insumos?.nome ?? "—",
    quantidade: row.quantidade,
    unidade: row.unidade ?? "",
  }));
}

export type TamanhoEnvase = "200ML" | "500ML" | "1L" | "2L" | "5L" | "20L";

export type EmbalagemEnvaseInput = {
  tamanho: TamanhoEnvase;
  garrafa_id: string | null;
  tampa_id: string | null;
  alca_id: string | null;
};

export type ConcluirEnvaseInput = {
  lote_id: string;
  qtd_200ml: number;
  qtd_500ml: number;
  qtd_1l: number;
  qtd_2l: number;
  qtd_5l: number;
  qtd_20l: number;
  data_envase: string;
  produto_acabado_id: string | null;
  novo_produto_nome: string | null;
  embalagens: EmbalagemEnvaseInput[];
  confirmar_falta: boolean;
};

export type ConcluirEnvaseResultado =
  | { ok: true }
  | { ok: false; faltas: FaltaItem[] }
  | { ok: false; error: string };

// Salva e conclui o envase numa única transação da base (função concluir_envase).
async function concluirEnvaseInterno(
  input: ConcluirEnvaseInput
): Promise<ConcluirEnvaseResultado> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const data = new Date(input.data_envase);
  if (Number.isNaN(data.getTime())) {
    return { ok: false, error: "Data do envase inválida." };
  }

  const { data: result, error } = await supabase.rpc("concluir_envase", {
    p_lote_id: input.lote_id,
    p_qtd_200ml: input.qtd_200ml,
    p_qtd_500ml: input.qtd_500ml,
    p_qtd_1l: input.qtd_1l,
    p_qtd_2l: input.qtd_2l,
    p_qtd_5l: input.qtd_5l,
    p_qtd_20l: input.qtd_20l,
    p_data_envase: data.toISOString(),
    p_produto_acabado_id: input.produto_acabado_id,
    p_novo_produto_nome: input.novo_produto_nome,
    p_embalagens: input.embalagens,
    p_confirmar_falta: input.confirmar_falta,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) return { ok: false, error: rpcError(error).message };

  const r = result as { ok?: boolean; faltas?: FaltaItem[] } | null;
  if (r?.ok === true) {
    // /envase fica de fora: a tela recarrega os lotes por conta própria
    for (const path of ["/", "/producao", "/produto-acabado", "/estoque-insumos"]) {
      revalidatePath(path);
    }
    return { ok: true };
  }
  if (r?.faltas && r.faltas.length > 0) return { ok: false, faltas: r.faltas };
  return { ok: false, error: "Resposta inesperada ao concluir o envase." };
}

export async function concluirEnvaseV2(
  input: ConcluirEnvaseInput
): Promise<ConcluirEnvaseResultado> {
  try {
    return await concluirEnvaseInterno(input);
  } catch (e) {
    return falha("concluirEnvaseV2", e);
  }
}

export type EmbalagemDisponivel = {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  estoque_atual: number;
};

const CATEGORIAS_EMBALAGEM = [
  "garrafa_200ml",
  "garrafa_500ml",
  "garrafa_1l",
  "garrafa_2l",
  "garrafa_5l",
  "garrafa_20l",
  "tampa",
  "alca",
];

export async function getEmbalagensDisponiveis(): Promise<EmbalagemDisponivel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, categoria, unidade, estoque_atual")
    .in("categoria", CATEGORIAS_EMBALAGEM)
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({
    id: i.id,
    nome: i.nome,
    categoria: i.categoria ?? "",
    unidade: i.unidade,
    estoque_atual: i.estoque_atual,
  }));
}

export type ProdutoDestino = {
  id: string;
  nome: string;
  formula_id: string | null;
};

// Produtos da mesma fórmula do lote, mais os ainda sem fórmula.
export async function getProdutosDestino(lote_id: string): Promise<ProdutoDestino[]> {
  const supabase = await createClient();
  const { data: lote, error: loteError } = await supabase
    .from("lotes_producao")
    .select("formula_id")
    .eq("id", lote_id)
    .single();
  if (loteError) throw new Error(loteError.message);

  const { data, error } = await supabase
    .from("produtos_acabados")
    .select("id, nome, formula_id")
    .eq("ativo", true)
    .or(`formula_id.eq.${lote.formula_id},formula_id.is.null`)
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}
