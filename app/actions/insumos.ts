"use server";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export type InsumoWithFlag = Tables<"insumos"> & { estoque_baixo: boolean; custo_unitario: number | null };
export type Movimento = Tables<"insumo_movimentos">;

export async function getInsumos(): Promise<InsumoWithFlag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .select("*")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    estoque_baixo: row.estoque_atual < row.estoque_seguranca,
  }));
}

export async function createInsumo(payload: {
  nome: string;
  unidade: string;
  estoque_atual: number;
  estoque_seguranca: number;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("insumos").insert(payload);
  if (error) throw new Error(error.message);
}

export async function novaEntrada(
  insumo_id: string,
  quantidade: number,
  data: string,
  obs?: string
): Promise<void> {
  const supabase = await createClient();

  const { data: insumo, error: fetchError } = await supabase
    .from("insumos")
    .select("estoque_atual")
    .eq("id", insumo_id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const novoEstoque = insumo.estoque_atual + quantidade;

  const { error: updateError } = await supabase
    .from("insumos")
    .update({ estoque_atual: novoEstoque })
    .eq("id", insumo_id);
  if (updateError) throw new Error(updateError.message);

  const { error: moveError } = await supabase
    .from("insumo_movimentos")
    .insert({ insumo_id, quantidade, data, obs: obs ?? null, tipo: "entrada" });
  if (moveError) throw new Error(moveError.message);
}

export async function atualizarEstoque(
  insumo_id: string,
  quantidade_nova: number,
  data: string,
  obs?: string
): Promise<void> {
  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("insumos")
    .update({ estoque_atual: quantidade_nova })
    .eq("id", insumo_id);
  if (updateError) throw new Error(updateError.message);

  const { error: moveError } = await supabase
    .from("insumo_movimentos")
    .insert({
      insumo_id,
      quantidade: quantidade_nova,
      data,
      obs: obs ?? null,
      tipo: "ajuste",
    });
  if (moveError) throw new Error(moveError.message);
}

export async function updateCustoUnitario(
  id: string,
  custo_unitario: number
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .update({ custo_unitario })
    .eq("id", id);
  if (error) throw new Error(error.message);
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
