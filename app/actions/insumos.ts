"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getUserRole, requireAdmin } from "@/app/actions/auth-role";
import { logAtividade } from "@/app/actions/dashboard";
import { rpcError } from "@/lib/supabase/rpc-error";
import { getCustosMap, writeCusto } from "@/lib/custos";
import type { Tables } from "@/types/supabase";

type InsumoSemCusto = Omit<Tables<"insumos">, "custo_unitario" | "custo_unidade">;

export type InsumoWithFlag = InsumoSemCusto & {
  estoque_baixo: boolean;
  custo_unitario: number | null;
  custo_unidade: string | null;
  tipo: "producao" | "material";
};
export type Movimento = Tables<"insumo_movimentos">;

// Colunas de insumos sem os custos (custos vêm de insumo_custos, só para admin)
const INSUMO_COLUNAS =
  "id, created_at, nome, unidade, tipo, categoria, densidade, densidade_confirmada, estoque_atual, estoque_seguranca, estoque_estimado";

async function comCustos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: InsumoSemCusto[]
): Promise<Array<InsumoSemCusto & { custo_unitario: number | null; custo_unidade: string | null }>> {
  const isAdmin = (await getUserRole()) === "admin";
  const custos = isAdmin ? await getCustosMap(supabase) : null;
  return rows.map((row) => ({
    ...row,
    custo_unitario: custos?.get(row.id)?.custo_unitario ?? null,
    custo_unidade: custos?.get(row.id)?.custo_unidade ?? null,
  }));
}

export async function getInsumos(tipo?: "producao" | "material"): Promise<InsumoWithFlag[]> {
  const supabase = await createClient();
  let query = supabase.from("insumos").select(INSUMO_COLUNAS).order("nome");
  if (tipo) query = query.eq("tipo", tipo);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = await comCustos(supabase, (data ?? []) as unknown as InsumoSemCusto[]);
  return rows.map((row) => ({
    ...row,
    tipo: row.tipo as "producao" | "material",
    estoque_baixo: row.estoque_atual <= row.estoque_seguranca,
  }));
}

export async function createInsumo(payload: {
  nome: string;
  unidade: string;
  estoque_atual?: number;
  estoque_inicial?: number;
  estoque_seguranca: number;
  custo_unitario?: number;
  custo_unidade?: string;
  tipo?: "producao" | "material";
  categoria?: string | null;
  densidade?: number | null;
}): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  // Custos só são enviados por administradores; para os demais são ignorados
  const isAdmin = (await getUserRole()) === "admin";
  const { error } = await supabase.rpc("criar_insumo", {
    p_nome: payload.nome,
    p_unidade: payload.unidade,
    p_tipo: payload.tipo ?? "producao",
    p_categoria: payload.categoria ?? null,
    p_densidade: payload.densidade ?? null,
    p_estoque_inicial: payload.estoque_inicial ?? payload.estoque_atual ?? 0,
    p_estoque_seguranca: payload.estoque_seguranca,
    p_custo_unitario: isAdmin ? (payload.custo_unitario ?? null) : null,
    p_custo_unidade: isAdmin ? (payload.custo_unidade ?? null) : null,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);
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
  const { error } = await supabase.rpc("registrar_entrada_insumo", {
    p_insumo_id: insumo_id,
    p_quantidade: quantidade,
    p_unidade: unidade ?? null,
    p_data: data,
    p_obs: obs ?? null,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);
}

export async function atualizarEstoque(
  insumo_id: string,
  quantidade_nova: number,
  data: string,
  obs?: string
): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("registrar_ajuste_insumo", {
    p_insumo_id: insumo_id,
    p_novo_total: quantidade_nova,
    p_data: data,
    p_obs: obs ?? null,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);
}

export async function confirmarDensidade(
  insumo_id: string,
  densidade: number
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("confirmar_densidade", {
    p_insumo_id: insumo_id,
    p_densidade: densidade,
    p_user_id: user?.id ?? null,
    p_user_email: user?.email ?? null,
  });
  if (error) throw rpcError(error);
}

export async function updateCustoInsumo(
  id: string,
  custo_unitario: number,
  custo_unidade: string
): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await writeCusto(supabase, id, custo_unitario, custo_unidade);
}

const CATEGORIAS_VALIDAS = [
  "garrafa_200ml",
  "garrafa_500ml",
  "garrafa_1l",
  "garrafa_2l",
  "garrafa_5l",
  "garrafa_20l",
  "tampa",
  "alca",
];

// categoria e densidade: undefined = não alterar. categoria null = remover.
// densidade só é aplicada por administradores, via confirmarDensidade.
export async function updateInsumo(
  id: string,
  nome: string,
  unidade: string,
  estoque_seguranca: number,
  custo_unitario?: number,
  custo_unidade?: string,
  categoria?: string | null,
  densidade?: number | null
): Promise<void> {
  if (categoria !== undefined && categoria !== null && !CATEGORIAS_VALIDAS.includes(categoria)) {
    throw new Error("Categoria inválida.");
  }
  const supabase = await createClient();
  const user = await getCurrentUser();
  const isAdmin = (await getUserRole()) === "admin";
  if (isAdmin && densidade != null && (!Number.isFinite(densidade) || densidade <= 0)) {
    throw new Error("Densidade inválida: deve ser maior que zero.");
  }
  const { error } = await supabase
    .from("insumos")
    .update({
      nome,
      unidade,
      estoque_seguranca,
      ...(categoria !== undefined ? { categoria } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (isAdmin && densidade != null) {
    const { data: atual, error: atualError } = await supabase
      .from("insumos")
      .select("densidade")
      .eq("id", id)
      .single();
    if (atualError) throw new Error(atualError.message);
    if (atual.densidade !== densidade) await confirmarDensidade(id, densidade);
  }
  // Custos só são gravados por administradores; para os demais são ignorados
  if (custo_unitario !== undefined && (await getUserRole()) === "admin") {
    await writeCusto(supabase, id, custo_unitario, custo_unidade);
  }
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
  const { data, error } = await supabase.from("insumos").select(INSUMO_COLUNAS).order("nome");
  if (error) throw new Error(error.message);
  const baixos = ((data ?? []) as unknown as InsumoSemCusto[]).filter(
    (row) => row.estoque_atual <= row.estoque_seguranca
  );
  const abaixoMinimo = (await comCustos(supabase, baixos)).map((row) => ({
    ...row,
    tipo: row.tipo as "producao" | "material",
    estoque_baixo: true,
  }));
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
