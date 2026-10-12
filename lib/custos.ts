import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Custo = {
  custo_unitario: number | null;
  custo_unidade: string | null;
};

// Custos vivem em insumo_custos (RLS só para administradores).
// Chamar apenas quando o usuário for admin.
export async function getCustosMap(supabase: Supabase): Promise<Map<string, Custo>> {
  const { data, error } = await supabase
    .from("insumo_custos")
    .select("insumo_id, custo_unitario, custo_unidade");
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((r) => [
      r.insumo_id as string,
      { custo_unitario: r.custo_unitario, custo_unidade: r.custo_unidade },
    ])
  );
}

// Escreve em insumo_custos e nas colunas antigas de insumos (idênticas até a migração 0003).
// Chamar apenas após requireAdmin().
export async function writeCusto(
  supabase: Supabase,
  insumo_id: string,
  custo_unitario: number,
  custo_unidade?: string
): Promise<void> {
  const { error: upsertError } = await supabase.from("insumo_custos").upsert(
    {
      insumo_id,
      custo_unitario,
      ...(custo_unidade !== undefined ? { custo_unidade } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "insumo_id" }
  );
  if (upsertError) throw new Error(upsertError.message);
  const { error } = await supabase
    .from("insumos")
    .update({
      custo_unitario,
      ...(custo_unidade !== undefined ? { custo_unidade } : {}),
    })
    .eq("id", insumo_id);
  if (error) throw new Error(error.message);
}
