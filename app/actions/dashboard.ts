"use server";

// SQL needed (run once in Supabase SQL Editor):
// CREATE TABLE log_atividades (
//   id uuid primary key default gen_random_uuid(),
//   action text not null,
//   detail text,
//   user_id uuid references auth.users(id) on delete set null,
//   user_email text,
//   created_at timestamptz default now()
// );
// alter table log_atividades enable row level security;
// create policy "allow_all_log_atividades" on log_atividades for all using (true) with check (true);

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";
import { getUserRole } from "@/app/actions/auth-role";
import { getUnidadesCompativeis } from "@/lib/unidades";

export type AgendaItemWithFormula = Tables<"agenda_producao"> & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
};

export type LoteEnvaseItem = Tables<"lotes_producao"> & {
  formulas: Pick<Tables<"formulas">, "nome" | "sigla"> | null;
};

export type InsumoAbaixo = Pick<
  Tables<"insumos">,
  "id" | "nome" | "estoque_atual" | "unidade" | "estoque_seguranca"
>;

export type ProdutoAbaixo = Pick<
  Tables<"produtos_acabados">,
  "id" | "nome" | "estoque_atual" | "estoque_seguranca"
>;

export async function getAgendaProducao(
  data: string
): Promise<AgendaItemWithFormula[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("agenda_producao")
    .select("*, formulas(nome, sigla)")
    .eq("data_agenda", data)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (rows ?? []) as AgendaItemWithFormula[];
}

export async function getAgendaAtrasada(): Promise<AgendaItemWithFormula[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await supabase
    .from("agenda_producao")
    .select("*, formulas(nome, sigla)")
    .lt("data_agenda", today)
    .eq("concluido", false)
    .order("data_agenda", { ascending: true });
  if (error) throw new Error(error.message);
  return (rows ?? []) as AgendaItemWithFormula[];
}

export async function toggleAgendaItem(
  id: string,
  concluido: boolean
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_producao")
    .update({ concluido })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addAgendaItem(
  formula_id: string,
  data_agenda: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_producao")
    .insert({ formula_id, data_agenda, concluido: false });
  if (error) throw new Error(error.message);
}

export async function deleteAgendaItem(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_producao")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reagendarAgendaItem(
  id: string
): Promise<Tables<"agenda_producao">> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("agenda_producao")
    .update({ data_agenda: today })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getLotesEmEnvase(): Promise<LoteEnvaseItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lotes_producao")
    .select("*, formulas(nome, sigla)")
    .eq("status", "envase")
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) throw new Error(error.message);
  return (data ?? []) as LoteEnvaseItem[];
}

export async function getInsumosAbaixoMinimo(): Promise<InsumoAbaixo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, estoque_atual, unidade, estoque_seguranca")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((i) => i.estoque_atual <= i.estoque_seguranca);
}

export async function getProdutosAbaixoMinimo(): Promise<ProdutoAbaixo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos_acabados")
    .select("id, nome, estoque_atual, estoque_seguranca")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).filter((p) => p.estoque_atual <= p.estoque_seguranca);
}

export type AtividadeItem = {
  action: string;
  detail: string;
  user_email: string | null;
  created_at: string;
};

export async function logAtividade(
  action: string,
  detail: string,
  userId?: string,
  userEmail?: string
): Promise<void> {
  const supabase = await createClient();
  await (supabase as any).from("log_atividades").insert({
    action,
    detail,
    user_id: userId ?? null,
    user_email: userEmail ?? null,
  });
}

export async function getAtividadeRecente(): Promise<AtividadeItem[]> {
  const supabase = await createClient();

  const [lotesRes, movRes, retiradasRes, logRes] = await Promise.all([
    supabase
      .from("lotes_producao")
      .select("numero_lote, user_email, created_at, formulas(nome)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("insumo_movimentos")
      .select("tipo, quantidade, falta, obs, user_email, created_at, insumos(nome, unidade)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("produto_retiradas")
      .select("quantidade, user_email, created_at, produtos_acabados(nome)")
      .order("created_at", { ascending: false })
      .limit(20),
    (supabase as any)
      .from("log_atividades")
      .select("action, detail, user_email, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (lotesRes.error) throw new Error(lotesRes.error.message);
  if (movRes.error) throw new Error(movRes.error.message);
  if (retiradasRes.error) throw new Error(retiradasRes.error.message);
  if (logRes.error) throw new Error(logRes.error.message);

  const lotesAtividade: AtividadeItem[] = (
    (lotesRes.data ?? []) as unknown as Array<{
      numero_lote: string;
      user_email: string | null;
      created_at: string | null;
      formulas: { nome: string } | null;
    }>
  ).map((l) => ({
    action: "Novo lote",
    detail: `${l.numero_lote}: ${l.formulas?.nome ?? "—"}`,
    user_email: l.user_email,
    created_at: l.created_at ?? "",
  }));

  const movAtividade: AtividadeItem[] = (
    (movRes.data ?? []) as unknown as Array<{
      tipo: string;
      quantidade: number;
      falta: number | null;
      obs: string | null;
      user_email: string | null;
      created_at: string | null;
      insumos: { nome: string; unidade: string } | null;
    }>
  ).map((m) => {
    const obs = m.obs ?? "";
    let action: string;
    if (m.tipo === "saida") {
      if (obs.startsWith("Produção lote")) action = "Consumo de produção";
      else if (obs.startsWith("Embalagem envase lote")) action = "Consumo de embalagem";
      else action = "Saída de insumo";
    } else if (m.tipo === "entrada") {
      action = "Entrada de insumo";
    } else if (m.tipo === "ajuste" && obs === "Estoque inicial") {
      action = "Estoque inicial";
    } else {
      action = "Ajuste de insumo";
    }
    const unidade = m.insumos?.unidade ?? "";
    let detail = `${m.insumos?.nome ?? "—"}: ${m.quantidade} ${unidade}`.trim();
    if ((m.falta ?? 0) > 0) detail += ` (faltaram ${m.falta} ${unidade})`.replace(/ +\)/, ")");
    return {
      action,
      detail,
      user_email: m.user_email,
      created_at: m.created_at ?? "",
    };
  });

  const retiradasAtividade: AtividadeItem[] = (
    (retiradasRes.data ?? []) as unknown as Array<{
      quantidade: number;
      user_email: string | null;
      created_at: string | null;
      produtos_acabados: { nome: string } | null;
    }>
  ).map((r) => ({
    action: "Retirada de produto",
    detail: `${r.produtos_acabados?.nome ?? "—"}: ${r.quantidade} UND`,
    user_email: r.user_email,
    created_at: r.created_at ?? "",
  }));

  const logAtividades: AtividadeItem[] = (
    (logRes.data ?? []) as unknown as Array<{
      action: string;
      detail: string | null;
      user_email: string | null;
      created_at: string | null;
    }>
  ).map((l) => ({
    action: l.action,
    detail: l.detail ?? "",
    user_email: l.user_email,
    created_at: l.created_at ?? "",
  }));

  // Evita o mesmo evento duas vezes: o registo de log_atividades prevalece
  // sobre o movimento do mesmo segundo e do mesmo utilizador.
  const chaveLog = new Set(
    logAtividades.map((l) => `${l.created_at.slice(0, 19)}|${l.user_email ?? ""}`)
  );
  const movSemDuplicados = movAtividade.filter(
    (m) => !chaveLog.has(`${m.created_at.slice(0, 19)}|${m.user_email ?? ""}`)
  );

  return [...lotesAtividade, ...movSemDuplicados, ...retiradasAtividade, ...logAtividades]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);
}

// ─── Pendências (apenas admin) ───────────────────────────────────────────────

export type PendenciaItem = {
  id: string;
  nome: string;
  detalhe: string;
  destino: string;
};

export type PendenciaTipo =
  | "densidade_a_confirmar"
  | "estoque_estimado"
  | "faltas_registadas"
  | "unidade_incompativel"
  | "produto_sem_formula"
  | "categoria_em_falta"
  | "tamanho_sem_garrafa";

export type PendenciaGrupo = {
  tipo: PendenciaTipo;
  items: PendenciaItem[];
};

export type Pendencias = { grupos: PendenciaGrupo[] };

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const TAMANHOS_GARRAFA: { label: string; categoria: string }[] = [
  { label: "200ML", categoria: "garrafa_200ml" },
  { label: "500ML", categoria: "garrafa_500ml" },
  { label: "1L", categoria: "garrafa_1l" },
  { label: "2L", categoria: "garrafa_2l" },
  { label: "5L", categoria: "garrafa_5l" },
  { label: "20L", categoria: "garrafa_20l" },
];

export async function getPendencias(): Promise<Pendencias> {
  if ((await getUserRole()) !== "admin") return { grupos: [] };

  const supabase = await createClient();

  const [insRes, movRes, fiRes, paRes] = await Promise.all([
    supabase
      .from("insumos")
      .select("id, nome, unidade, categoria, densidade, densidade_confirmada, estoque_estimado")
      .order("nome"),
    supabase
      .from("insumo_movimentos")
      .select("id, insumo_id, falta, obs, created_at, insumos(nome, unidade)")
      .gt("falta", 0)
      .order("created_at", { ascending: false }),
    supabase
      .from("formula_insumos")
      .select("id, unidade, formulas(nome), insumos(nome, unidade, densidade)"),
    supabase
      .from("produtos_acabados")
      .select("id, nome, formula_id")
      .is("formula_id", null)
      .order("nome"),
  ]);

  if (insRes.error) throw new Error(insRes.error.message);
  if (movRes.error) throw new Error(movRes.error.message);
  if (fiRes.error) throw new Error(fiRes.error.message);
  if (paRes.error) throw new Error(paRes.error.message);

  const insumos = insRes.data ?? [];
  const grupos: PendenciaGrupo[] = [];
  const add = (tipo: PendenciaTipo, items: PendenciaItem[]) => {
    if (items.length > 0) grupos.push({ tipo, items });
  };

  // a. densidade a confirmar
  add(
    "densidade_a_confirmar",
    insumos
      .filter((i) => i.densidade != null && !i.densidade_confirmada)
      .map((i) => ({
        id: i.id,
        nome: i.nome,
        detalhe: `Densidade ${i.densidade}`,
        destino: "/estoque-insumos",
      }))
  );

  // b. estoque estimado
  add(
    "estoque_estimado",
    insumos
      .filter((i) => i.estoque_estimado)
      .map((i) => ({
        id: i.id,
        nome: i.nome,
        detalhe: "Valor estimado, precisa de contagem",
        destino: "/estoque-insumos",
      }))
  );

  // c. faltas registadas sem ajuste posterior
  const faltas = (movRes.data ?? []) as unknown as Array<{
    id: string;
    insumo_id: string;
    falta: number | null;
    obs: string | null;
    created_at: string | null;
    insumos: { nome: string; unidade: string } | null;
  }>;
  if (faltas.length > 0) {
    const ids = Array.from(new Set(faltas.map((f) => f.insumo_id)));
    const ajustesRes = await supabase
      .from("insumo_movimentos")
      .select("insumo_id, created_at")
      .eq("tipo", "ajuste")
      .in("insumo_id", ids);
    if (ajustesRes.error) throw new Error(ajustesRes.error.message);
    const ultimoAjuste = new Map<string, string>();
    for (const a of ajustesRes.data ?? []) {
      const atual = ultimoAjuste.get(a.insumo_id);
      if (a.created_at && (!atual || a.created_at > atual)) {
        ultimoAjuste.set(a.insumo_id, a.created_at);
      }
    }
    add(
      "faltas_registadas",
      faltas
        .filter((f) => {
          const aj = ultimoAjuste.get(f.insumo_id);
          return !(aj && f.created_at && aj > f.created_at);
        })
        .map((f) => {
          const lote = /lote\s+(\S+)/i.exec(f.obs ?? "")?.[1];
          return {
            id: f.id,
            nome: f.insumos?.nome ?? "—",
            detalhe: `Faltaram ${f.falta} ${f.insumos?.unidade ?? ""}${lote ? ` no lote ${lote}` : ""}`.trim(),
            destino: "/estoque-insumos",
          };
        })
    );
  }

  // d. unidade incompatível na fórmula (insumo sem densidade)
  const formulaInsumos = (fiRes.data ?? []) as unknown as Array<{
    id: string;
    unidade: string;
    formulas: { nome: string } | null;
    insumos: { nome: string; unidade: string; densidade: number | null } | null;
  }>;
  add(
    "unidade_incompativel",
    formulaInsumos
      .filter(
        (fi) =>
          fi.insumos != null &&
          fi.insumos.densidade == null &&
          !getUnidadesCompativeis(fi.insumos.unidade, null).includes(fi.unidade.toUpperCase())
      )
      .map((fi) => ({
        id: fi.id,
        nome: `${fi.formulas?.nome ?? "—"}: ${fi.insumos?.nome ?? "—"}`,
        detalhe: `Na fórmula em ${fi.unidade}, no estoque em ${fi.insumos?.unidade ?? ""}`,
        destino: "/formulas",
      }))
  );

  // e. produto sem fórmula
  add(
    "produto_sem_formula",
    (paRes.data ?? []).map((p) => ({
      id: p.id,
      nome: p.nome,
      detalhe: "Sem fórmula associada",
      destino: "/produto-acabado",
    }))
  );

  // f. embalagem sem categoria
  add(
    "categoria_em_falta",
    insumos
      .filter((i) => {
        if (i.categoria != null) return false;
        const n = normalizar(i.nome);
        return n.includes("garrafa") || n.includes("tampa") || n.includes("alca");
      })
      .map((i) => ({
        id: i.id,
        nome: i.nome,
        detalhe: "Sem categoria definida",
        destino: "/estoque-insumos",
      }))
  );

  // g. tamanhos sem garrafa / sem tampa
  const categorias = new Set(insumos.map((i) => i.categoria).filter(Boolean));
  const semEmbalagem: PendenciaItem[] = TAMANHOS_GARRAFA.filter(
    (t) => !categorias.has(t.categoria)
  ).map((t) => ({
    id: `garrafa-${t.categoria}`,
    nome: `Sem garrafa cadastrada para ${t.label}`,
    detalhe: `Cadastre um insumo com a categoria Garrafa ${t.label}`,
    destino: "/estoque-insumos",
  }));
  if (!categorias.has("tampa")) {
    semEmbalagem.push({
      id: "tampa",
      nome: "Sem tampa cadastrada",
      detalhe: "Cadastre um insumo com a categoria Tampa",
      destino: "/estoque-insumos",
    });
  }
  add("tamanho_sem_garrafa", semEmbalagem);

  return { grupos };
}
