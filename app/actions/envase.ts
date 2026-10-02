"use server";

import { createClient } from "@/lib/supabase/server";
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
  envases: Pick<
    Tables<"envases">,
    "qtd_1l" | "qtd_2l" | "qtd_5l" | "qtd_20l" | "rendimento_real" | "data_envase"
  >[];
};

export async function getHistoricoEnvases(): Promise<HistoricoEnvaseItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select(
      "*, formulas(nome, sigla, rendimento, rendimento_unidade), envases(qtd_1l, qtd_2l, qtd_5l, qtd_20l, rendimento_real, data_envase)"
    )
    .eq("status", "concluido")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const withEnvase = ((data ?? []) as HistoricoEnvaseItem[]).filter(
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

export async function saveEnvase(
  lote_id: string,
  qtd_1l: number,
  qtd_2l: number,
  qtd_5l: number,
  qtd_20l: number,
  data_envase: string
): Promise<void> {
  const supabase = await createClient();
  // datetime-local returns "YYYY-MM-DDTHH:mm" without timezone; treat as local and convert to ISO
  const data_envase_iso = new Date(data_envase).toISOString();
  const rendimento_real = qtd_1l * 1 + qtd_2l * 2 + qtd_5l * 5 + qtd_20l * 20;
  const existing = await getEnvaseByLote(lote_id);
  if (existing) {
    const { error } = await supabase
      .from("envases")
      .update({ qtd_1l, qtd_2l, qtd_5l, qtd_20l, data_envase: data_envase_iso, rendimento_real })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("envases")
      .insert({ lote_id, qtd_1l, qtd_2l, qtd_5l, qtd_20l, data_envase: data_envase_iso, rendimento_real });
    if (error) throw new Error(error.message);
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

export type EmbalagemConfigItem = {
  tamanho: string;
  insumo_id: string | null;
  insumos: { nome: string; unidade: string } | null;
};

export async function getEmbalagemConfig(): Promise<EmbalagemConfigItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("embalagem_config")
    .select("tamanho, insumo_id, insumos(nome, unidade)")
    .order("tamanho");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EmbalagemConfigItem[];
}

export type EstoqueEmbalagemItem = {
  tamanho: string;
  estoque_atual: number;
  insumo_nome: string;
};

export async function getEstoqueEmbalagens(): Promise<EstoqueEmbalagemItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("embalagem_config")
    .select("tamanho, insumo_id, insumos(nome, estoque_atual)")
    .order("tamanho");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{
    tamanho: string;
    insumo_id: string | null;
    insumos: { nome: string; estoque_atual: number } | null;
  }>)
    .filter((row) => row.insumo_id && row.insumos)
    .map((row) => ({
      tamanho: row.tamanho,
      estoque_atual: row.insumos?.estoque_atual ?? 0,
      insumo_nome: row.insumos?.nome ?? "—",
    }));
}

export async function saveEmbalagemConfig(
  tamanho: string,
  insumo_id: string
): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("embalagem_config")
    .select("id")
    .eq("tamanho", tamanho)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { error } = await supabase
      .from("embalagem_config")
      .update({ insumo_id })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("embalagem_config")
      .insert({ tamanho, insumo_id });
    if (error) throw new Error(error.message);
  }
}

export async function concluirEnvase(lote_id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("lotes_producao")
    .update({ status: "concluido" })
    .eq("id", lote_id);
  if (error) throw new Error(error.message);

  const { data: envase, error: envaseError } = await supabase
    .from("envases")
    .select("qtd_1l, qtd_2l, qtd_5l, qtd_20l")
    .eq("lote_id", lote_id)
    .maybeSingle();
  if (envaseError) throw new Error(envaseError.message);
  if (!envase) return;

  const { data: lote, error: loteError } = await supabase
    .from("lotes_producao")
    .select("numero_lote, formula_id")
    .eq("id", lote_id)
    .single();
  if (loteError) throw new Error(loteError.message);

  const embalagemConfig = await getEmbalagemConfig();
  const qtdPorTamanho: Record<string, number> = {
    "1L": envase.qtd_1l ?? 0,
    "2L": envase.qtd_2l ?? 0,
    "5L": envase.qtd_5l ?? 0,
    "20L": envase.qtd_20l ?? 0,
  };

  for (const config of embalagemConfig) {
    const qtd = qtdPorTamanho[config.tamanho] ?? 0;
    if (qtd <= 0 || !config.insumo_id) continue;

    const { data: insumo, error: insumoError } = await supabase
      .from("insumos")
      .select("estoque_atual")
      .eq("id", config.insumo_id)
      .single();
    if (insumoError) throw new Error(insumoError.message);

    const novoEstoque = Math.max(0, (insumo.estoque_atual ?? 0) - qtd);
    const { error: updateEstoqueError } = await supabase
      .from("insumos")
      .update({ estoque_atual: novoEstoque })
      .eq("id", config.insumo_id);
    if (updateEstoqueError) throw new Error(updateEstoqueError.message);

    const { error: movError } = await supabase.from("insumo_movimentos").insert({
      insumo_id: config.insumo_id,
      tipo: "saida",
      quantidade: qtd,
      data: new Date().toISOString().slice(0, 10),
      obs: `Envase lote ${lote.numero_lote}`,
    });
    if (movError) throw new Error(movError.message);
  }

  const total =
    (envase.qtd_1l ?? 0) +
    (envase.qtd_2l ?? 0) +
    (envase.qtd_5l ?? 0) +
    (envase.qtd_20l ?? 0);
  if (total === 0) return;

  const { data: formula, error: formulaError } = await supabase
    .from("formulas")
    .select("nome")
    .eq("id", lote.formula_id)
    .single();
  if (formulaError) throw new Error(formulaError.message);

  const { data: existing, error: paError } = await supabase
    .from("produtos_acabados")
    .select("id, estoque_atual, estoque_1l, estoque_2l, estoque_5l, estoque_20l")
    .eq("nome", formula.nome)
    .maybeSingle();
  if (paError) throw new Error(paError.message);

  if (existing) {
    const { error: updateError } = await supabase
      .from("produtos_acabados")
      .update({
        estoque_atual: existing.estoque_atual + total,
        estoque_1l: (existing.estoque_1l ?? 0) + (envase.qtd_1l ?? 0),
        estoque_2l: (existing.estoque_2l ?? 0) + (envase.qtd_2l ?? 0),
        estoque_5l: (existing.estoque_5l ?? 0) + (envase.qtd_5l ?? 0),
        estoque_20l: (existing.estoque_20l ?? 0) + (envase.qtd_20l ?? 0),
      })
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { error: insertError } = await supabase
      .from("produtos_acabados")
      .insert({
        nome: formula.nome,
        lote_id,
        estoque_atual: total,
        estoque_seguranca: 0,
        estoque_1l: envase.qtd_1l ?? 0,
        estoque_2l: envase.qtd_2l ?? 0,
        estoque_5l: envase.qtd_5l ?? 0,
        estoque_20l: envase.qtd_20l ?? 0,
      });
    if (insertError) throw new Error(insertError.message);
  }
}
