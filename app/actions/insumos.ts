"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/app/actions/auth-role";
import { logAtividade } from "@/app/actions/dashboard";
import { convertToBaseUnit } from "@/app/actions/utils";
import type { Tables } from "@/types/supabase";

export type InsumoWithFlag = Tables<"insumos"> & {
  estoque_baixo: boolean;
  custo_unitario: number | null;
  tipo: "producao" | "material";
};
export type Movimento = Tables<"insumo_movimentos">;

export async function getInsumos(tipo?: "producao" | "material"): Promise<InsumoWithFlag[]> {
  const supabase = await createClient();
  let query = supabase.from("insumos").select("*").order("nome");
  if (tipo) query = query.eq("tipo", tipo);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    estoque_baixo: row.estoque_atual <= row.estoque_seguranca,
  }));
}

export async function createInsumo(payload: {
  nome: string;
  unidade: string;
  estoque_atual: number;
  estoque_seguranca: number;
  custo_unitario?: number;
  custo_unidade?: string;
  tipo?: "producao" | "material";
}): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { tipo = "producao", ...rest } = payload;
  const { error } = await supabase.from("insumos").insert({ ...rest, tipo });
  if (error) throw new Error(error.message);
  await logAtividade("Novo insumo", payload.nome, user?.id, user?.email);
}

export async function novaEntrada(
  insumo_id: string,
  quantidade: number,
  data: string,
  obs?: string,
  unidade?: string
): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: insumo, error: fetchError } = await supabase
    .from("insumos")
    .select("estoque_atual, unidade")
    .eq("id", insumo_id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const quantidadeConvertida = unidade
    ? convertToBaseUnit(quantidade, unidade, insumo.unidade)
    : quantidade;

  const novoEstoque = insumo.estoque_atual + quantidadeConvertida;

  const { error: updateError } = await supabase
    .from("insumos")
    .update({ estoque_atual: novoEstoque })
    .eq("id", insumo_id);
  if (updateError) throw new Error(updateError.message);

  const { error: moveError } = await supabase.from("insumo_movimentos").insert({
    insumo_id,
    quantidade: quantidadeConvertida,
    data,
    obs: obs ?? null,
    tipo: "entrada",
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
  });
  if (moveError) throw new Error(moveError.message);

  const { data: insumoInfo } = await supabase
    .from("insumos")
    .select("nome, unidade")
    .eq("id", insumo_id)
    .single();
  await logAtividade(
    "Entrada de insumo",
    `${insumoInfo?.nome ?? "—"} — ${quantidade} ${insumoInfo?.unidade ?? ""}`.trim(),
    user?.id,
    user?.email
  );
}

export async function atualizarEstoque(
  insumo_id: string,
  quantidade_nova: number,
  data: string,
  obs?: string
): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { error: updateError } = await supabase
    .from("insumos")
    .update({ estoque_atual: quantidade_nova })
    .eq("id", insumo_id);
  if (updateError) throw new Error(updateError.message);

  const { error: moveError } = await supabase.from("insumo_movimentos").insert({
    insumo_id,
    quantidade: quantidade_nova,
    data,
    obs: obs ?? null,
    tipo: "ajuste",
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
  });
  if (moveError) throw new Error(moveError.message);

  const { data: insumoInfo } = await supabase
    .from("insumos")
    .select("nome, unidade")
    .eq("id", insumo_id)
    .single();
  await logAtividade(
    "Ajuste de insumo",
    `${insumoInfo?.nome ?? "—"} — ${quantidade_nova} ${insumoInfo?.unidade ?? ""}`.trim(),
    user?.id,
    user?.email
  );
}

export async function updateCustoInsumo(
  id: string,
  custo_unitario: number,
  custo_unidade: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .update({ custo_unitario, custo_unidade })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateInsumo(
  id: string,
  nome: string,
  unidade: string,
  estoque_seguranca: number,
  custo_unitario?: number,
  custo_unidade?: string
): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("insumos")
    .update({ nome, unidade, estoque_seguranca, custo_unitario, custo_unidade })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logAtividade("Edição de insumo", nome, user?.id, user?.email);
}

export async function deleteInsumo(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { count: loteCount, error: loteError } = await supabase
    .from("lote_insumos")
    .select("id", { count: "exact", head: true })
    .eq("insumo_id", id);
  if (loteError) throw new Error(loteError.message);

  const { count: formulaCount, error: formulaError } = await supabase
    .from("formula_insumos")
    .select("id", { count: "exact", head: true })
    .eq("insumo_id", id);
  if (formulaError) throw new Error(formulaError.message);

  if ((loteCount ?? 0) > 0 || (formulaCount ?? 0) > 0) {
    throw new Error(
      "Este insumo está a ser usado em fórmulas ou lotes e não pode ser excluído."
    );
  }

  const { data: insumoInfo } = await supabase
    .from("insumos")
    .select("nome, unidade")
    .eq("id", id)
    .single();
  await logAtividade(
    "Exclusão de insumo",
    `${insumoInfo?.nome ?? "—"} (${insumoInfo?.unidade ?? ""})`,
    user?.id,
    user?.email
  );

  const { error } = await supabase.from("insumos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getInsumosAbaixoMinimo(): Promise<{
  producao: InsumoWithFlag[];
  material: InsumoWithFlag[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("insumos").select("*").order("nome");
  if (error) throw new Error(error.message);
  const abaixoMinimo = (data ?? [])
    .filter((row) => row.estoque_atual <= row.estoque_seguranca)
    .map((row) => ({ ...row, estoque_baixo: true }));
  return {
    producao: abaixoMinimo.filter((row) => row.tipo === "producao"),
    material: abaixoMinimo.filter((row) => row.tipo === "material"),
  };
}

export async function getMovimentos(insumo_id: string): Promise<Movimento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumo_movimentos")
    .select("*")
    .eq("insumo_id", insumo_id)
    .order("data", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
