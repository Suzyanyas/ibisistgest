"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/app/actions/auth-role";
import { logAtividade } from "@/app/actions/dashboard";
import { convertToBaseUnit } from "@/app/actions/utils";
import type { Tables } from "@/types/supabase";

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
  const { data, error } = await supabase
    .from("lotes_producao")
    .insert({
      formula_id,
      numero_lote,
      data_producao,
      status: "producao",
      fragancia: fragancia || null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const lote = data;

  let inserts: Array<{ lote_id: string; insumo_id: string; quantidade: number; unidade: string }>;

  if (insumoOverrides && insumoOverrides.length > 0) {
    inserts = insumoOverrides.map((o) => ({
      lote_id: lote.id,
      insumo_id: o.insumo_id,
      quantidade: o.quantidade,
      unidade: o.unidade,
    }));
  } else {
    const { data: formulaInsumos, error: fiError } = await supabase
      .from("formula_insumos")
      .select("insumo_id, quantidade, unidade")
      .eq("formula_id", formula_id);
    if (fiError) throw new Error(fiError.message);
    inserts = (formulaInsumos ?? []).map((fi) => ({
      lote_id: lote.id,
      insumo_id: fi.insumo_id,
      quantidade: fi.quantidade,
      unidade: fi.unidade,
    }));
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("lote_insumos")
      .insert(inserts);
    if (insertError) throw new Error(insertError.message);
  }

  const { data: formula } = await supabase
    .from("formulas")
    .select("nome")
    .eq("id", formula_id)
    .single();
  await logAtividade(
    "Novo lote",
    `${numero_lote} — ${formula?.nome ?? "—"}`,
    user?.id,
    user?.email
  );

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

export async function updateLoteStatus(
  id: string,
  status: "producao" | "envase" | "concluido"
): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("lotes_producao")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (status === "envase") {
    const { data: lote, error: loteError } = await supabase
      .from("lotes_producao")
      .select("numero_lote")
      .eq("id", id)
      .single();
    if (loteError) throw new Error(loteError.message);

    await logAtividade("Lote para envase", lote.numero_lote, user?.id, user?.email);

    const { data: loteInsumos, error: liError } = await supabase
      .from("lote_insumos")
      .select("insumo_id, quantidade, unidade")
      .eq("lote_id", id);
    if (liError) throw new Error(liError.message);

    if (loteInsumos && loteInsumos.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const obs = `Produção lote ${lote.numero_lote}`;

      for (const li of loteInsumos) {
        const { data: insumo, error: insumoError } = await supabase
          .from("insumos")
          .select("estoque_atual, unidade")
          .eq("id", li.insumo_id)
          .single();
        if (insumoError) throw new Error(insumoError.message);

        const qtdConvertida = convertToBaseUnit(
          li.quantidade,
          li.unidade,
          insumo.unidade
        );

        const novoEstoque = Math.max(0, (insumo.estoque_atual ?? 0) - qtdConvertida);

        const { error: updateError } = await supabase
          .from("insumos")
          .update({ estoque_atual: novoEstoque })
          .eq("id", li.insumo_id);
        if (updateError) throw new Error(updateError.message);

        const { error: movError } = await supabase
          .from("insumo_movimentos")
          .insert({
            insumo_id: li.insumo_id,
            tipo: "saida",
            quantidade: qtdConvertida,
            data: today,
            obs,
          });
        if (movError) throw new Error(movError.message);
      }
    }
  } else if (status === "concluido") {
    const { data: lote, error: loteError } = await supabase
      .from("lotes_producao")
      .select("numero_lote")
      .eq("id", id)
      .single();
    if (loteError) throw new Error(loteError.message);

    await logAtividade("Lote concluído", lote.numero_lote, user?.id, user?.email);
  }
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
