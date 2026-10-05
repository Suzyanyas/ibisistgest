"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Package, CheckCircle } from "lucide-react";
import {
  getAgendaProducao,
  getAgendaAtrasada,
  getLotesEmEnvase,
  getInsumosAbaixoMinimo,
  getProdutosAbaixoMinimo,
  getAtividadeRecente,
  toggleAgendaItem,
  addAgendaItem,
  deleteAgendaItem,
  reagendarAgendaItem,
  type AgendaItemWithFormula,
  type LoteEnvaseItem,
  type InsumoAbaixo,
  type ProdutoAbaixo,
  type AtividadeItem,
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

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} ${diffH === 1 ? "hora" : "horas"}`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD} ${diffD === 1 ? "dia" : "dias"}`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function activityDotColor(action: string): string {
  if (action.includes("Novo lote")) return "#1565C0";
  if (action.includes("Entrada de insumo")) return "#16A34A";
  if (action.includes("Ajuste de insumo")) return "#F59E0B";
  if (action.includes("Retirada de produto")) return "#E53935";
  return "#9CA3AF";
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
            className="modal-close text-white text-2xl leading-none"
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
  style,
}: {
  children: React.ReactNode;
  bg?: string;
  gradient?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`flex flex-col h-full ${className}`}
      style={{
        background: gradient ?? bg,
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(21,101,192,0.28)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function KpiBadge({
  count,
  variant,
}: {
  count: number;
  variant: "white" | "amber";
}) {
  if (count === 0) {
    const zeroStyle =
      variant === "white"
        ? { background: "rgba(255,255,255,0.2)", color: "#A5D6A7" }
        : { background: "rgba(245,158,11,0.15)", color: "#16A34A" };
    return (
      <span
        aria-hidden="true"
        style={{
          ...zeroStyle,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 99,
          fontSize: 16,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        ✓
      </span>
    );
  }
  const badgeStyle =
    variant === "white"
      ? {
          background: "rgba(255,255,255,0.2)",
          color: "#ffffff",
        }
      : {
          background: "rgba(245,158,11,0.15)",
          color: "#92400E",
        };
  return (
    <span
      style={{
        ...badgeStyle,
        borderRadius: 99,
        padding: "2px 10px",
        fontSize: 22,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {count}
    </span>
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
  initialAtividadeRecente,
  isAdmin,
}: {
  today: string;
  initialAgendaHoje: AgendaItemWithFormula[];
  initialAgendaAtrasada: AgendaItemWithFormula[];
  initialLotesEnvase: LoteEnvaseItem[];
  initialInsumosAbaixo: InsumoAbaixo[];
  initialProdutosAbaixo: ProdutoAbaixo[];
  formulas: FormulaRow[];
  initialAtividadeRecente: AtividadeItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();

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
  const [atividadeRecente, setAtividadeRecente] =
    useState<AtividadeItem[]>(initialAtividadeRecente);
  const [showAllEstoque, setShowAllEstoque] = useState(false);

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

  // Reagendar atrasado item
  const [isReagendando, startReagendar] = useTransition();
  const [reagendandoId, setReagendandoId] = useState<string | null>(null);

  // Atividade recente: show 5 by default, expand on "Ver mais"
  const [showAllAtividade, setShowAllAtividade] = useState(false);

  // ── Refresh ──

  const refresh = useCallback(async () => {
    const day = todayStr();
    const [ah, aa, le, ia, pa, at] = await Promise.all([
      getAgendaProducao(day),
      getAgendaAtrasada(),
      getLotesEmEnvase(),
      getInsumosAbaixoMinimo(),
      getProdutosAbaixoMinimo(),
      isAdmin ? getAtividadeRecente() : Promise.resolve(null),
    ]);
    setAgendaHoje(ah);
    setAgendaAtrasada(aa);
    setLotesEnvase(le);
    setInsumosAbaixo(ia);
    setProdutosAbaixo(pa);
    if (at) setAtividadeRecente(at);
  }, [isAdmin]);

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

  function handleReagendar(id: string) {
    setReagendandoId(id);
    startReagendar(async () => {
      try {
        await reagendarAgendaItem(id);
        await refresh();
      } finally {
        setReagendandoId(null);
      }
    });
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

  const atrasados = agendaAtrasada.filter(
    (a) => !agendaHoje.some((h) => h.id === a.id)
  );
  const hoje = agendaHoje;

  const agendaGradient = "linear-gradient(135deg, #1A3A6B 0%, #1565C0 100%)";
  const envaseGradient = "linear-gradient(135deg, #1565C0 0%, #0288D1 100%)";
  const produtoGradient = "linear-gradient(135deg, #1565C0 0%, #00897B 100%)";

  return (
    <div className="px-6 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">

        {/* ── Card 1: Agenda ── */}
        <Card gradient={agendaGradient} style={{ borderTop: "3px solid #00BCD4" }}>
          <div
            className="flex items-start justify-between gap-2"
            style={{ padding: "20px 20px 12px 20px" }}
          >
            <div>
              <p
                className="text-white tracking-widest flex items-center"
                style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", gap: 8 }}
              >
                <Calendar size={16} color="rgba(255,255,255,0.7)" />
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
              className="btn-icon"
              style={{
                width: "32px",
                height: "32px",
                minWidth: "32px",
                minHeight: "32px",
                border: "none",
                background: "white",
                color: "#1565C0",
                fontSize: "20px",
                fontWeight: "700",
                flexShrink: 0,
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}
              title="Adicionar à agenda"
            >
              +
            </button>
          </div>

          <ul className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto max-h-96">
            {atrasados.length === 0 && hoje.length === 0 && (
              <li
                className="py-2"
                style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}
              >
                Nenhum item na agenda.
              </li>
            )}

            {atrasados.length > 0 && (
              <>
                <li className="pt-1 pb-1">
                  <span
                    style={{
                      color: "#FB8C00",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 4,
                      display: "block",
                    }}
                  >
                    Em Atraso
                  </span>
                </li>
                {atrasados.map((item) => {
                  const isLoading = toggling.has(item.id);
                  const isReagendandoThis =
                    isReagendando && reagendandoId === item.id;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 group"
                      style={{
                        borderLeft: "3px solid #FB8C00",
                        background: "rgba(251,140,0,0.12)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        marginBottom: 4,
                      }}
                    >
                      <button
                        onClick={() => handleToggle(item)}
                        disabled={isLoading}
                        className="flex-shrink-0 flex items-center justify-center transition disabled:opacity-50"
                        style={{
                          width: "20px",
                          height: "20px",
                          minWidth: "20px",
                          minHeight: "20px",
                          borderRadius: 4,
                          border: "2px solid rgba(255,255,255,0.6)",
                          backgroundColor: item.concluido
                            ? "rgba(255,255,255,0.3)"
                            : "transparent",
                          cursor: "pointer",
                        }}
                        title="Marcar como concluído"
                      >
                        {item.concluido && (
                          <span style={{ color: "white", fontSize: 10, lineHeight: 1 }}>✓</span>
                        )}
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/producao?formula_id=${item.formula_id}&formula_nome=${encodeURIComponent(item.formulas?.nome ?? "")}`
                          )
                        }
                        disabled={isLoading}
                        className="flex-1 text-left py-1 transition disabled:opacity-50 hover:underline"
                      >
                        <span
                          className="block"
                          style={{
                            fontSize: 15,
                            color: item.concluido ? "rgba(255,255,255,0.4)" : "#FFE0B2",
                            textDecoration: item.concluido ? "line-through" : "none",
                          }}
                        >
                          {item.formulas?.nome ?? "—"}
                        </span>
                        <span
                          className="block"
                          style={{ color: "#FFCC80", fontSize: 11 }}
                        >
                          {item.data_agenda}
                        </span>
                      </button>
                      <button
                        onClick={() => handleReagendar(item.id)}
                        disabled={isLoading || isReagendandoThis}
                        className="flex-shrink-0 transition disabled:opacity-50"
                        style={{
                          fontSize: 10,
                          color: "#FB8C00",
                          border: "1px solid #FB8C00",
                          borderRadius: 4,
                          padding: "2px 6px",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        title="Reagendar para hoje"
                      >
                        {isReagendandoThis ? "..." : "Reagendar"}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isLoading}
                        className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white/90 text-base leading-none transition disabled:opacity-30 transition-all duration-150 active:scale-95"
                        title="Remover"
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </>
            )}

            {hoje.length > 0 && (
              <>
                <li className="pt-3 pb-1">
                  <span
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Hoje
                  </span>
                </li>
                {hoje.map((item, idx) => {
                  const isLoading = toggling.has(item.id);
                  const isLast =
                    idx === hoje.length - 1 && produtosAbaixo.length === 0;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 group"
                      style={{
                        padding: "8px 0",
                        borderBottom: isLast
                          ? "none"
                          : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <button
                        onClick={() => handleToggle(item)}
                        disabled={isLoading}
                        className="flex-shrink-0 flex items-center justify-center transition disabled:opacity-50"
                        style={{
                          width: "20px",
                          height: "20px",
                          minWidth: "20px",
                          minHeight: "20px",
                          borderRadius: 4,
                          border: "2px solid rgba(255,255,255,0.6)",
                          backgroundColor: item.concluido
                            ? "rgba(255,255,255,0.3)"
                            : "transparent",
                          cursor: "pointer",
                        }}
                        title="Marcar como concluído"
                      >
                        {item.concluido && (
                          <span style={{ color: "white", fontSize: 10, lineHeight: 1 }}>✓</span>
                        )}
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/producao?formula_id=${item.formula_id}&formula_nome=${encodeURIComponent(item.formulas?.nome ?? "")}`
                          )
                        }
                        disabled={isLoading}
                        className="flex-1 text-left py-1 transition disabled:opacity-50 hover:underline"
                        style={{
                          fontSize: 15,
                          color: item.concluido ? "rgba(255,255,255,0.4)" : "#ffffff",
                          textDecoration: item.concluido ? "line-through" : "none",
                        }}
                      >
                        {item.formulas?.nome ?? "—"}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isLoading}
                        className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white/90 text-base leading-none transition disabled:opacity-30 transition-all duration-150 active:scale-95"
                        title="Remover"
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </>
            )}

            {produtosAbaixo.length > 0 && (
              <>
                <li className="pt-3 pb-1">
                  <span
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Necessidade de Produção
                  </span>
                </li>
                {produtosAbaixo.map((p) => (
                  <li
                    key={`low-${p.id}`}
                    className="flex items-center gap-2 py-1.5 border-b border-white/10 last:border-0"
                  >
                    <button
                      onClick={() =>
                        router.push(
                          `/producao?formula_nome=${encodeURIComponent(p.nome)}`
                        )
                      }
                      className="flex-1 text-left transition hover:opacity-80"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textDecoration: "none",
                      }}
                    >
                      <span
                        className="block"
                        style={{ fontSize: 14, color: "#FFFFFF" }}
                      >
                        ⚠️ {p.nome}
                      </span>
                      <span
                        className="block"
                        style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}
                      >
                        Estoque baixo: {p.estoque_atual} / mín.{" "}
                        {p.estoque_seguranca}
                      </span>
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
        </Card>

        {/* ── Card 2: Envase ── */}
        <Card gradient={envaseGradient} style={{ borderTop: "3px solid #4FC3F7" }}>
          <div
            className="flex items-start justify-between gap-2"
            style={{ padding: "20px 20px 12px 20px" }}
          >
            <p
              className="text-white tracking-widest flex items-center"
              style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", gap: 8 }}
            >
              <Package size={16} color="rgba(255,255,255,0.7)" />
              ENVASE
            </p>
            <KpiBadge count={lotesEnvase.length} variant="white" />
          </div>
          <ul className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto max-h-96">
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
                className="flex items-center gap-2 text-white border-b border-white/10 last:border-0"
                style={{ fontSize: 15, padding: "8px 0" }}
              >
                <span
                  className="w-4 h-4 rounded border-2 border-white/60 flex-shrink-0"
                  aria-hidden="true"
                />
                <button
                  onClick={() => router.push(`/envase?lote_id=${l.id}`)}
                  className="text-left hover:underline transition"
                  style={{ color: "inherit", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                >
                  {l.formulas?.nome ?? "—"}
                  <span
                    className="ml-1.5 text-xs"
                    style={{ color: "rgba(255,255,255,0.65)" }}
                  >
                    {l.numero_lote}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Card 3: Produto Acabado ── */}
        <Card gradient={produtoGradient} style={{ borderTop: "3px solid #4DB6AC" }}>
          <div
            className="flex items-start justify-between gap-2"
            style={{ padding: "20px 20px 12px 20px" }}
          >
            <div>
              <p
                className="text-white tracking-widest flex items-center"
                style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", gap: 8 }}
              >
                <CheckCircle size={16} color="rgba(255,255,255,0.7)" />
                PRODUTO ACABADO
              </p>
              <p
                className="mt-0.5"
                style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}
              >
                Abaixo do mínimo
              </p>
            </div>
            <KpiBadge count={produtosAbaixo.length} variant="white" />
          </div>
          <ul className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto max-h-96">
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
                  className="border-b border-white/10 last:border-0"
                >
                  <button
                    onClick={() => router.push("/produto-acabado")}
                    className="w-full flex items-center justify-between text-white transition-opacity hover:opacity-80"
                    style={{ fontSize: 15, padding: "8px 0", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <span className="truncate">{p.nome}</span>
                    <span
                      className="ml-2 flex-shrink-0 font-semibold"
                      style={{ color: "#FFCDD2" }}
                    >
                      {p.estoque_atual} UND
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Card>

        {/* ── Card 4: Estoque Baixo Insumos ── */}
        <Card
          gradient="linear-gradient(135deg, #FFF8E1 0%, #FFF3CD 100%)"
          style={{ borderTop: "3px solid #F59E0B", boxShadow: "0 8px 32px rgba(245,158,11,0.2)" }}
        >
          <div
            className="flex items-start justify-between gap-2"
            style={{ padding: "20px 20px 12px 20px" }}
          >
            <div>
              <p
                className="tracking-widest flex items-center"
                style={{ fontFamily: "var(--font-lora), Georgia, serif", color: "#1A3A6B", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", gap: 8 }}
              >
                <span aria-hidden="true" style={{ fontSize: 20, color: "#F59E0B", lineHeight: 1 }}>⚠</span> ESTOQUE BAIXO
              </p>
              <p className="mt-0.5 text-gray-600" style={{ fontSize: 14 }}>Insumos</p>
            </div>
            <KpiBadge count={insumosAbaixo.length} variant="amber" />
          </div>
          <ul
            className={`flex-1 px-4 pb-4 flex flex-col ${
              showAllEstoque ? "overflow-y-auto max-h-96" : ""
            }`}
          >
            {insumosAbaixo.length === 0 ? (
              <li className="flex items-center gap-2 py-1.5" style={{ fontSize: 14 }}>
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-gray-700">Estoque OK</span>
              </li>
            ) : (
              (showAllEstoque ? insumosAbaixo : insumosAbaixo.slice(0, 5)).map((ins) => (
                <li
                  key={ins.id}
                  className="border-b border-gray-200 last:border-0"
                >
                  <button
                    onClick={() => router.push("/estoque-insumos")}
                    className="w-full flex items-center justify-between transition-opacity hover:opacity-80"
                    style={{ fontSize: 15, padding: "8px 0", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <span className="text-gray-800 truncate">{ins.nome}</span>
                    <span
                      className="ml-2 flex-shrink-0 font-semibold"
                      style={{ color: "#C62828" }}
                    >
                      {ins.estoque_atual} {ins.unidade}
                    </span>
                  </button>
                </li>
              ))
            )}
            {insumosAbaixo.length > 5 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAllEstoque((v) => !v)}
                  className="text-xs font-semibold text-amber-700 underline cursor-pointer mt-2"
                >
                  {showAllEstoque ? "Ver menos" : `Ver todos (${insumosAbaixo.length})`}
                </button>
              </li>
            )}
          </ul>
        </Card>
      </div>

      {/* ── Card 5: Atividade Recente ── */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
          <Card
            bg="#ffffff"
            className="border"
            style={{
              borderColor: "#E8F4FF",
              borderLeft: "3px solid #1565C0",
              boxShadow: "0 4px 20px rgba(21,101,192,0.08)",
            }}
          >
            <div style={{ padding: "20px 20px 12px 20px" }}>
              <p
                className="tracking-widest"
                style={{
                  fontFamily: "var(--font-lora), Georgia, serif",
                  color: "#1A3A6B",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                }}
              >
                ATIVIDADE RECENTE
              </p>
            </div>
            <ul
              className={`px-4 flex flex-col overflow-y-auto max-h-96 ${
                showAllAtividade ? "pb-2" : "pb-0"
              }`}
            >
              {atividadeRecente.length === 0 && (
                <li className="py-2 text-gray-500" style={{ fontSize: 13 }}>
                  Nenhuma atividade registada.
                </li>
              )}
              {(showAllAtividade
                ? atividadeRecente
                : atividadeRecente.slice(0, 5)
              ).map((item, idx) => (
                <li
                  key={`${item.created_at}-${idx}`}
                  className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        marginRight: 8,
                        flexShrink: 0,
                        backgroundColor: activityDotColor(item.action),
                      }}
                    />
                    <span className="font-semibold text-gray-800" style={{ fontSize: 12.5 }}>
                      {item.action}
                    </span>
                  </div>
                  {item.detail && (
                    <span
                      className="text-gray-500 line-clamp-2"
                      style={{
                        fontSize: 12.5,
                        whiteSpace: "normal",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        paddingLeft: 16,
                      }}
                    >
                      {item.detail}
                    </span>
                  )}
                  <div className="flex items-center justify-between" style={{ paddingLeft: 16 }}>
                    {item.user_email && (
                      <span style={{ fontSize: 11, color: "#00ACC1" }}>
                        {item.user_email?.split("@")[0] ?? ""}
                      </span>
                    )}
                    <span
                      className="flex-shrink-0 text-gray-400 ml-auto"
                      style={{ fontSize: 11 }}
                    >
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {atividadeRecente.length > 5 && (
              <div className="px-4 pb-3 pt-1">
                <button
                  onClick={() => setShowAllAtividade((v) => !v)}
                  className="text-xs font-semibold hover:underline transition-all duration-150 hover:underline hover:text-blue-700"
                  style={{ color: "#1565C0" }}
                >
                  {showAllAtividade ? "Ver menos" : "Ver mais"}
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

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
