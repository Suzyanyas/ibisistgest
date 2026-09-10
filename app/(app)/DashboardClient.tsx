"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAgendaProducao,
  getAgendaAtrasada,
  getLotesEmEnvase,
  getInsumosAbaixoMinimo,
  getProdutosAbaixoMinimo,
  toggleAgendaItem,
  addAgendaItem,
  deleteAgendaItem,
  type AgendaItemWithFormula,
  type LoteEnvaseItem,
  type InsumoAbaixo,
  type ProdutoAbaixo,
} from "@/app/actions/dashboard";
import type { FormulaRow } from "@/app/actions/formulas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDatePtBR(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date
    .toLocaleDateString("pt-BR", { weekday: "long" })
    .toUpperCase();
  const dateStr = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return `${weekday} ${dateStr}`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="bg-white w-full max-w-sm"
        style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: "#1565C0", borderRadius: "12px 12px 0 0" }}
        >
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-white opacity-70 hover:opacity-100 text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 w-full";

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({
  children,
  bg,
  gradient,
  className = "",
}: {
  children: React.ReactNode;
  bg?: string;
  gradient?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col h-full ${className}`}
      style={{
        background: gradient ?? bg,
        borderRadius: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardClient({
  today,
  initialAgendaHoje,
  initialAgendaAtrasada,
  initialLotesEnvase,
  initialInsumosAbaixo,
  initialProdutosAbaixo,
  formulas,
}: {
  today: string;
  initialAgendaHoje: AgendaItemWithFormula[];
  initialAgendaAtrasada: AgendaItemWithFormula[];
  initialLotesEnvase: LoteEnvaseItem[];
  initialInsumosAbaixo: InsumoAbaixo[];
  initialProdutosAbaixo: ProdutoAbaixo[];
  formulas: FormulaRow[];
}) {
  const [agendaHoje, setAgendaHoje] =
    useState<AgendaItemWithFormula[]>(initialAgendaHoje);
  const [agendaAtrasada, setAgendaAtrasada] =
    useState<AgendaItemWithFormula[]>(initialAgendaAtrasada);
  const [lotesEnvase, setLotesEnvase] =
    useState<LoteEnvaseItem[]>(initialLotesEnvase);
  const [insumosAbaixo, setInsumosAbaixo] =
    useState<InsumoAbaixo[]>(initialInsumosAbaixo);
  const [produtosAbaixo, setProdutosAbaixo] =
    useState<ProdutoAbaixo[]>(initialProdutosAbaixo);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selFormulaId, setSelFormulaId] = useState(
    formulas.length > 0 ? formulas[0].id : ""
  );
  const [selData, setSelData] = useState(todayStr());
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Per-item toggle loading set
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  // ── Refresh ──

  const refresh = useCallback(async () => {
    const day = todayStr();
    const [ah, aa, le, ia, pa] = await Promise.all([
      getAgendaProducao(day),
      getAgendaAtrasada(),
      getLotesEmEnvase(),
      getInsumosAbaixoMinimo(),
      getProdutosAbaixoMinimo(),
    ]);
    setAgendaHoje(ah);
    setAgendaAtrasada(aa);
    setLotesEnvase(le);
    setInsumosAbaixo(ia);
    setProdutosAbaixo(pa);
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // ── Agenda actions ──

  async function handleToggle(item: AgendaItemWithFormula) {
    setToggling((s) => new Set(s).add(item.id));
    try {
      await toggleAgendaItem(item.id, !item.concluido);
      setAgendaHoje((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, concluido: !i.concluido } : i
        )
      );
      setAgendaAtrasada((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, concluido: !i.concluido } : i
        )
      );
    } catch {
      // silently ignore — stale state will self-correct on next refresh
    } finally {
      setToggling((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleDelete(id: string) {
    setToggling((s) => new Set(s).add(id));
    try {
      await deleteAgendaItem(id);
      setAgendaHoje((prev) => prev.filter((i) => i.id !== id));
      setAgendaAtrasada((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // silently ignore
    } finally {
      setToggling((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  function openModal() {
    setSelFormulaId(formulas.length > 0 ? formulas[0].id : "");
    setSelData(todayStr());
    setModalError(null);
    setShowModal(true);
  }

  async function handleSaveAgenda() {
    if (!selFormulaId) return setModalError("Selecione uma fórmula.");
    if (!selData) return setModalError("Data é obrigatória.");
    setModalError(null);
    setModalLoading(true);
    try {
      await addAgendaItem(selFormulaId, selData);
      setShowModal(false);
      await refresh();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setModalLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const allAgenda = [
    ...agendaAtrasada.filter(
      (a) => !agendaHoje.some((h) => h.id === a.id)
    ),
    ...agendaHoje,
  ];

  const blueGradient = "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)";

  return (
    <div className="px-6 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">

        {/* ── Card 1: Agenda ── */}
        <Card gradient={blueGradient}>
          <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-white tracking-widest" style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 16, fontWeight: 700, letterSpacing: "0.08em" }}>
                AGENDA DE PRODUÇÃO
              </p>
              <p
                className="mt-0.5"
                style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}
              >
                {formatDatePtBR(today)}
              </p>
            </div>
            <button
              onClick={openModal}
              style={{
                width: "32px",
                height: "32px",
                minWidth: "32px",
                minHeight: "32px",
                borderRadius: "50%",
                border: "none",
                background: "white",
                color: "#1565C0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontWeight: "700",
                cursor: "pointer",
                flexShrink: 0,
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}
              title="Adicionar à agenda"
            >
              +
            </button>
          </div>

          <ul className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto">
            {allAgenda.length === 0 && (
              <li
                className="py-2"
                style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}
              >
                Nenhum item na agenda.
              </li>
            )}
            {allAgenda.map((item) => {
              const isAtrasado =
                !item.concluido && item.data_agenda < today;
              const isLoading = toggling.has(item.id);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 group py-1.5 border-b border-white/10 last:border-0"
                >
                  <button
                    onClick={() => handleToggle(item)}
                    disabled={isLoading}
                    className="flex-1 text-left py-1 transition disabled:opacity-50"
                    style={{
                      fontSize: 15,
                      color: item.concluido
                        ? "rgba(255,255,255,0.4)"
                        : isAtrasado
                        ? "#FFCDD2"
                        : "#ffffff",
                      textDecoration: item.concluido
                        ? "line-through"
                        : "none",
                    }}
                  >
                    {item.formulas?.nome ?? "—"}
                    {isAtrasado && (
                      <span
                        className="ml-1 text-xs"
                        style={{ color: "#EF9A9A" }}
                      >
                        ({item.data_agenda})
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={isLoading}
                    className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white/90 text-base leading-none transition disabled:opacity-30"
                    title="Remover"
                  >
                    &times;
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ── Card 2: Envase ── */}
        <Card gradient={blueGradient}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-white tracking-widest" style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 16, fontWeight: 700, letterSpacing: "0.08em" }}>
              ENVASE
            </p>
          </div>
          <ul className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto">
            {lotesEnvase.length === 0 && (
              <li
                className="py-2"
                style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}
              >
                Nenhum lote em envase.
              </li>
            )}
            {lotesEnvase.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-2 text-white py-1.5 border-b border-white/10 last:border-0"
                style={{ fontSize: 15 }}
              >
                <span
                  className="w-4 h-4 rounded border-2 border-white/60 flex-shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {l.formulas?.nome ?? "—"}
                  <span
                    className="ml-1.5 text-xs"
                    style={{ color: "rgba(255,255,255,0.65)" }}
                  >
                    {l.numero_lote}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Card 3: Produto Acabado ── */}
        <Card gradient={blueGradient}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-white tracking-widest" style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 16, fontWeight: 700, letterSpacing: "0.08em" }}>
              PRODUTO ACABADO
            </p>
            <p
              className="mt-0.5"
              style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}
            >
              Abaixo do mínimo
            </p>
          </div>
          <ul className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto">
            {produtosAbaixo.length === 0 ? (
              <li className="flex items-center gap-2 py-2" style={{ fontSize: 14 }}>
                <span className="text-green-300 text-lg">✓</span>
                <span style={{ color: "rgba(255,255,255,0.85)" }}>
                  Estoque OK
                </span>
              </li>
            ) : (
              produtosAbaixo.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-white py-1.5 border-b border-white/10 last:border-0"
                  style={{ fontSize: 15 }}
                >
                  <span className="truncate">{p.nome}</span>
                  <span
                    className="ml-2 flex-shrink-0 font-semibold"
                    style={{ color: "#FFCDD2" }}
                  >
                    {p.estoque_atual} UND
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>

        {/* ── Card 4: Estoque Baixo Insumos ── */}
        <Card bg="#FFF9C4">
          <div className="px-4 pt-4 pb-2">
            <p
              className="tracking-widest flex items-center gap-1.5"
              style={{ fontFamily: "var(--font-lora), Georgia, serif", color: "#1A3A6B", fontSize: 16, fontWeight: 700, letterSpacing: "0.08em" }}
            >
              <span aria-hidden="true" style={{ fontSize: 18, color: "#F59E0B", lineHeight: 1 }}>⚠</span> ESTOQUE BAIXO
            </p>
            <p className="mt-0.5 text-gray-600" style={{ fontSize: 14 }}>Insumos</p>
          </div>
          <ul className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto">
            {insumosAbaixo.length === 0 ? (
              <li className="flex items-center gap-2 py-1.5" style={{ fontSize: 14 }}>
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-gray-700">Estoque OK</span>
              </li>
            ) : (
              insumosAbaixo.map((ins) => (
                <li
                  key={ins.id}
                  className="flex items-center justify-between py-1.5 border-b border-gray-200 last:border-0"
                  style={{ fontSize: 15 }}
                >
                  <span className="text-gray-800 truncate">{ins.nome}</span>
                  <span
                    className="ml-2 flex-shrink-0 font-semibold"
                    style={{ color: "#C62828" }}
                  >
                    {ins.estoque_atual} {ins.unidade}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {/* ── Modal: Adicionar à Agenda ── */}
      {showModal && (
        <Modal title="Adicionar à Agenda" onClose={() => setShowModal(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label
                className="text-sm font-medium"
                style={{ color: "#1A3A6B" }}
              >
                Fórmula *
              </label>
              <select
                className={inputCls}
                value={selFormulaId}
                onChange={(e) => setSelFormulaId(e.target.value)}
              >
                {formulas.length === 0 && (
                  <option value="">Nenhuma fórmula cadastrada</option>
                )}
                {formulas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} ({f.sigla})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="text-sm font-medium"
                style={{ color: "#1A3A6B" }}
              >
                Data *
              </label>
              <input
                className={inputCls}
                type="date"
                value={selData}
                onChange={(e) => setSelData(e.target.value)}
              />
            </div>

            {modalError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {modalError}
              </p>
            )}

            <div className="flex gap-3 pt-1 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveAgenda}
                disabled={modalLoading}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0" }}
              >
                {modalLoading ? "Salvando..." : "SALVAR"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
