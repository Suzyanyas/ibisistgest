"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getUserRole, requireAdmin } from "@/app/actions/auth-role";
import { getCustosMap } from "@/lib/custos";
import { logAtividade } from "@/app/actions/dashboard";
import { calcularCustoLinha } from "@/lib/unidades";
import {
  ErroAcao,
  erroBanco,
  executar,
  type ResultadoAcao,
  type ResultadoDado,
} from "@/lib/acao";
import type { Tables } from "@/types/supabase";

export type FormulaRow = Tables<"formulas">;

export type InsumoBasic = Pick<
  Tables<"insumos">,
  "id" | "nome" | "unidade" | "estoque_atual" | "densidade"
>;

export type FormulaInsumoRow = Tables<"formula_insumos"> & {
  insumos: {
    nome: string;
    unidade: string;
    densidade: number | null;
    custo_unitario: number | null;
    custo_unidade: string | null;
  } | null;
};

export type FormulaWithInsumos = FormulaRow & {
  formula_insumos: FormulaInsumoRow[];
};

export async function getFormulas(): Promise<FormulaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formulas")
    .select("*")
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Leitura (lança em falha inesperada): o cliente mostra uma mensagem genérica.
export async function getFormulaWithInsumos(
  id: string
): Promise<FormulaWithInsumos> {
  const supabase = await createClient();
  // Papel e consulta da fórmula são independentes: rodam juntos
  const [{ data, error }, role] = await Promise.all([
    supabase
      .from("formulas")
      .select("*, formula_insumos(*, insumos(nome, unidade, densidade))")
      .eq("id", id)
      .single(),
    getUserRole(),
  ]);
  if (error) throw new Error(error.message);

  // Custos: só para admin, vindos de insumo_custos; demais recebem null
  const custos = role === "admin" ? await getCustosMap(supabase) : null;
  const formula_insumos = (data.formula_insumos ?? []).map((fi: Tables<"formula_insumos"> & { insumos: unknown }) => {
    const insumo = fi.insumos as { nome: string; unidade: string; densidade: number | null } | null;
    return {
      ...fi,
      insumos: insumo
        ? {
            ...insumo,
            custo_unitario: custos?.get(fi.insumo_id)?.custo_unitario ?? null,
            custo_unidade: custos?.get(fi.insumo_id)?.custo_unidade ?? null,
          }
        : null,
    };
  });
  return { ...data, formula_insumos } as FormulaWithInsumos;
}

export async function createFormula(payload: {
  nome: string;
  sigla: string;
  rendimento: number;
  rendimento_unidade: string;
  obs?: string | null;
}): Promise<ResultadoDado<FormulaRow>> {
  return executar("createFormula", async () => {
    const supabase = await createClient();
    const user = await getCurrentUser();
    const { data, error } = await supabase
      .from("formulas")
      .insert(payload)
      .select()
      .single();
    if (error) erroBanco("createFormula", error);
    await logAtividade("Nova fórmula", payload.nome, user?.id, user?.email);
    return data!;
  });
}

export async function updateFormula(
  id: string,
  payload: {
    nome?: string;
    sigla?: string;
    rendimento?: number;
    rendimento_unidade?: string;
    obs?: string | null;
  }
): Promise<ResultadoAcao> {
  return executar("updateFormula", async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("formulas")
      .update(payload)
      .eq("id", id);
    if (error) erroBanco("updateFormula", error);
  });
}

export async function deleteFormula(id: string): Promise<ResultadoAcao> {
  return executar("deleteFormula", async () => {
    const supabase = await createClient();
    const user = await getCurrentUser();

    // Consultas independentes entre si
    const [loteRes, formulaRes] = await Promise.all([
      supabase
        .from("lotes_producao")
        .select("id", { count: "exact", head: true })
        .eq("formula_id", id),
      supabase.from("formulas").select("nome").eq("id", id).maybeSingle(),
    ]);
    if (loteRes.error) erroBanco("deleteFormula.lotes", loteRes.error);

    if ((loteRes.count ?? 0) > 0) {
      throw new ErroAcao("Esta fórmula já foi usada em lotes e não pode ser excluída.");
    }

    // Apaga os itens primeiro, caso não haja CASCADE
    const { error: childError } = await supabase
      .from("formula_insumos")
      .delete()
      .eq("formula_id", id);
    if (childError) erroBanco("deleteFormula.itens", childError);

    const { error } = await supabase.from("formulas").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        console.error("[db:deleteFormula]", error);
        throw new ErroAcao(
          "Esta fórmula está em uso (lotes ou produtos) e não pode ser excluída."
        );
      }
      erroBanco("deleteFormula", error);
    }

    await logAtividade("Exclusão de fórmula", formulaRes.data?.nome ?? "—", user?.id, user?.email);
    revalidatePath("/");
  });
}

export async function addInsumoToFormula(
  formula_id: string,
  insumo_id: string,
  quantidade: number,
  unidade: string
): Promise<ResultadoAcao> {
  return executar("addInsumoToFormula", async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("formula_insumos")
      .insert({ formula_id, insumo_id, quantidade, unidade });
    if (error) erroBanco("addInsumoToFormula", error);
    revalidatePath("/");
  });
}

export async function updateFormulaInsumo(
  id: string,
  quantidade: number,
  unidade: string
): Promise<ResultadoAcao> {
  return executar("updateFormulaInsumo", async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("formula_insumos")
      .update({ quantidade, unidade })
      .eq("id", id);
    if (error) erroBanco("updateFormulaInsumo", error);
    revalidatePath("/");
  });
}

export async function removeInsumoFromFormula(id: string): Promise<ResultadoAcao> {
  return executar("removeInsumoFromFormula", async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("formula_insumos")
      .delete()
      .eq("id", id);
    if (error) erroBanco("removeInsumoFromFormula", error);
    revalidatePath("/");
  });
}

export type FormulaCustoBreakdown = {
  formula_insumo_id: string;
  insumo_nome: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  custo_total: number;
  // null quando o custo foi calculado; senão o motivo (ex.: "densidade necessária")
  aviso: string | null;
};

export type FormulaCusto = {
  total: number;
  breakdown: FormulaCustoBreakdown[];
};

// Retorna null para não-admins: o custo nunca é calculado para eles.
export async function getFormulaCusto(formula_id: string): Promise<FormulaCusto | null> {
  if ((await getUserRole()) !== "admin") return null;
  const supabase = await createClient();
  const [{ data, error }, custos] = await Promise.all([
    supabase
      .from("formula_insumos")
      .select("id, insumo_id, quantidade, unidade, insumos(nome, densidade)")
      .eq("formula_id", formula_id),
    getCustosMap(supabase),
  ]);
  if (error) throw new Error(error.message);

  const breakdown: FormulaCustoBreakdown[] = (data ?? []).map((row) => {
    const insumo = row.insumos as unknown as { nome: string; densidade: number | null } | null;
    const custo = custos.get(row.insumo_id);
    const linha = calcularCustoLinha(
      row.quantidade,
      row.unidade,
      custo?.custo_unitario,
      custo?.custo_unidade,
      insumo?.densidade
    );
    return {
      formula_insumo_id: row.id,
      insumo_nome: insumo?.nome ?? "—",
      quantidade: row.quantidade,
      unidade: row.unidade,
      custo_unitario: custo?.custo_unitario ?? 0,
      custo_total: linha.custo,
      aviso: linha.aviso,
    };
  });

  return {
    total: breakdown.reduce((sum, r) => sum + r.custo_total, 0),
    breakdown,
  };
}

export async function duplicarFormula(
  formula_id: string,
  novo_nome: string,
  nova_sigla: string,
  insumoOverrides?: Array<{ insumo_id: string; quantidade: number; unidade: string }>
): Promise<ResultadoDado<FormulaWithInsumos>> {
  return executar("duplicarFormula", async () => {
    await requireAdmin();
    const supabase = await createClient();
    const user = await getCurrentUser();

    // Os itens só precisam ser lidos quando não vêm da tela
    const original = insumoOverrides ? null : await getFormulaWithInsumos(formula_id);
    const { data: base, error: baseError } = await supabase
      .from("formulas")
      .select("rendimento, rendimento_unidade, obs")
      .eq("id", formula_id)
      .single();
    if (baseError) erroBanco("duplicarFormula.base", baseError);

    const { data: novaFormula, error } = await supabase
      .from("formulas")
      .insert({
        nome: novo_nome,
        sigla: nova_sigla,
        rendimento: base!.rendimento,
        rendimento_unidade: base!.rendimento_unidade,
        obs: base!.obs,
      })
      .select()
      .single();
    if (error) erroBanco("duplicarFormula", error);

    const insumosFonte = insumoOverrides ?? original!.formula_insumos;

    if (insumosFonte.length > 0) {
      const inserts = insumosFonte.map((fi) => ({
        formula_id: novaFormula!.id,
        insumo_id: fi.insumo_id,
        quantidade: fi.quantidade,
        unidade: fi.unidade,
      }));
      const { error: insError } = await supabase
        .from("formula_insumos")
        .insert(inserts);
      if (insError) erroBanco("duplicarFormula.itens", insError);
    }

    await logAtividade("Fórmula duplicada", novo_nome, user?.id, user?.email);

    return getFormulaWithInsumos(novaFormula!.id);
  });
}

export async function getInsumosList(): Promise<InsumoBasic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, unidade, estoque_atual, densidade")
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}
