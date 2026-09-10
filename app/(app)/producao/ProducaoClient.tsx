"use client";

import { useState, useEffect, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getLotesProducao,
  getLoteWithInsumos,
  createLote,
  deleteLote,
  addInsumoToLote,
  removeInsumoFromLote,
  updateInsumoLote,
  updateLoteStatus,
  getFormulasList,
  getFormulaInsumos,
  getInsumosList,
  type LoteWithFormula,
  type LoteWithDetails,
  type LoteInsumoWithInsumo,
  type FormulaBasic,
  type FormulaInsumoPreview,
} from "@/app/actions/producao";

type ModalType =
  | null
  | "addInsumo"
  | "editInsumo"
  | "excluirInsumo"
  | "excluirLote";

type InsumoBasic = { id: string; nome: string; unidade: string };

const INSUMO_UNIDADES = ["KG", "L", "G", "ML", "PCT", "UN"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
        className="bg-white w-full max-w-sm mx-4 md:max-w-md max-h-[90vh] overflow-y-auto"
        style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ backgroundColor: "#1565C0", borderRadius: "12px 12px 0 0" }}
        >
          <h2 className="text-white font-semibold text-lg">{title}</h2>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" style={{ color: "#1A3A6B" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 w-full";

function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{msg}</p>
  );
}

function ModalActions({
  onCancel,
  onSave,
  saveLabel,
  saveColor,
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  saveColor?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2 justify-end">
      <button
        onClick={onCancel}
        className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
      >
        CANCELAR
      </button>
      <button
        onClick={onSave}
        disabled={disabled}
        className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
        style={{ backgroundColor: saveColor ?? "#1565C0" }}
      >
        {saveLabel}
      </button>
    </div>
  );
}

function PinField({
  pin,
  setPin,
  pinError,
}: {
  pin: string;
  setPin: (v: string) => void;
  pinError: string | null;
}) {
  return (
    <Field label="PIN de confirmação">
      <input
        className={inputCls}
        type="password"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
      />
      {pinError && <p className="text-sm text-red-600">{pinError}</p>}
    </Field>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    producao: { label: "produção", bg: "#E0E0E0", color: "#424242" },
    envase: { label: "envase", bg: "#E3F2FD", color: "#1565C0" },
    concluido: { label: "concluído", bg: "#E8F5E9", color: "#2E7D32" },
  };
  const c = map[status] ?? { label: status, bg: "#E0E0E0", color: "#424242" };
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProducaoClient({
  initialLotes,
}: {
  initialLotes: LoteWithFormula[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [lotes, setLotes] = useState<LoteWithFormula[]>(initialLotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LoteWithDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [modal, setModal] = useState<ModalType>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Novo Lote modal state
  const [formulasList, setFormulasList] = useState<FormulaBasic[]>([]);
  const [formulasLoading, setFormulasLoading] = useState(false);
  const [selFormulaId, setSelFormulaId] = useState("");
  const [novoNumeroLote, setNovoNumeroLote] = useState("");
  const [novoData, setNovoData] = useState(todayStr());
  const [formulaInsumosPreview, setFormulaInsumosPreview] = useState<FormulaInsumoPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Adicionar Insumo modal state
  const [insumosList, setInsumosList] = useState<InsumoBasic[]>([]);
  const [insumosLoading, setInsumosLoading] = useState(false);
  const [selInsumoId, setSelInsumoId] = useState("");
  const [insQtd, setInsQtd] = useState("");
  const [insUnidade, setInsUnidade] = useState("KG");

  // Edit / remove insumo modal state
  const [targetInsumo, setTargetInsumo] = useState<LoteInsumoWithInsumo | null>(null);
  const [editInsQtd, setEditInsQtd] = useState("");
  const [editInsUnidade, setEditInsUnidade] = useState("KG");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);

  // ── Helpers ──

  function refresh() {
    startTransition(() => router.refresh());
  }

  function closeModal() {
    setModal(null);
    setModalError(null);
    setSelFormulaId("");
    setNovoNumeroLote("");
    setNovoData(todayStr());
    setFormulaInsumosPreview([]);
    setSelInsumoId("");
    setInsQtd("");
    setInsUnidade("KG");
    setTargetInsumo(null);
    setEditInsQtd("");
    setEditInsUnidade("KG");
    setPin("");
    setPinError(null);
  }

  async function refreshLotes() {
    try {
      const updated = await getLotesProducao();
      setLotes(updated);
    } catch {
      // silently ignore; sidebar may be stale until next hard refresh
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const d = await getLoteWithInsumos(id);
      setDetail(d);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function selectLote(id: string) {
    setSelectedId(id);
    setMobileSidebarOpen(false);
    await loadDetail(id);
  }

  async function reloadDetail() {
    if (selectedId) await loadDetail(selectedId);
  }

  // ── Load formulas on mount for the inline form ──

  useEffect(() => {
    setFormulasLoading(true);
    getFormulasList()
      .then((list) => {
        setFormulasList(list);
        if (list.length > 0) {
          handleFormulaChange(list[0].id, list[0], list);
        }
      })
      .catch(() => {})
      .finally(() => setFormulasLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleNovaProdução() {
    setSelectedId(null);
    setDetail(null);
    setInlineError(null);
    setNovoData(todayStr());
    setMobileSidebarOpen(false);
    if (selFormulaId) {
      const count = lotes.filter((l) => l.formula_id === selFormulaId).length;
      const f = formulasList.find((x) => x.id === selFormulaId);
      if (f) setNovoNumeroLote(`${f.sigla}${String(count + 1).padStart(3, "0")}`);
    }
  }

  // ── Open modals ──

  async function handleFormulaChange(
    formulaId: string,
    formula?: FormulaBasic,
    list?: FormulaBasic[]
  ) {
    setSelFormulaId(formulaId);
    const fList = list ?? formulasList;
    const f = formula ?? fList.find((x) => x.id === formulaId);
    if (f) {
      const count = lotes.filter((l) => l.formula_id === formulaId).length;
      setNovoNumeroLote(`${f.sigla}${String(count + 1).padStart(3, "0")}`);
    }
    setPreviewLoading(true);
    setFormulaInsumosPreview([]);
    try {
      const preview = await getFormulaInsumos(formulaId);
      setFormulaInsumosPreview(preview);
    } catch {
      // preview is optional
    } finally {
      setPreviewLoading(false);
    }
  }

  async function openAddInsumo() {
    setModalError(null);
    setSelInsumoId("");
    setInsQtd("");
    setInsUnidade("KG");
    setModal("addInsumo");
    setInsumosLoading(true);
    try {
      const list = await getInsumosList();
      setInsumosList(list);
      if (list.length > 0) {
        setSelInsumoId(list[0].id);
        setInsUnidade(list[0].unidade);
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao carregar insumos.");
    } finally {
      setInsumosLoading(false);
    }
  }

  function openEditInsumo(li: LoteInsumoWithInsumo) {
    setTargetInsumo(li);
    setEditInsQtd(String(li.quantidade));
    setEditInsUnidade(li.unidade);
    setPin("");
    setPinError(null);
    setModalError(null);
    setModal("editInsumo");
  }

  function openExcluirInsumo(li: LoteInsumoWithInsumo) {
    setTargetInsumo(li);
    setPin("");
    setPinError(null);
    setModalError(null);
    setModal("excluirInsumo");
  }

  function openExcluirLote() {
    setPin("");
    setPinError(null);
    setModalError(null);
    setModal("excluirLote");
  }

  // ── Actions ──

  async function handleIniciarProducao() {
    if (!selFormulaId) return setInlineError("Selecione uma fórmula.");
    if (!novoNumeroLote.trim()) return setInlineError("Número do lote é obrigatório.");
    if (!novoData) return setInlineError("Data é obrigatória.");
    setInlineError(null);
    setInlineSaving(true);
    try {
      const newLote = await createLote(selFormulaId, novoNumeroLote.trim(), novoData);
      await refreshLotes();
      refresh();
      setSelectedId(newLote.id);
      setMobileSidebarOpen(false);
      await loadDetail(newLote.id);
    } catch (e) {
      setInlineError(e instanceof Error ? e.message : "Erro ao criar lote.");
    } finally {
      setInlineSaving(false);
    }
  }

  async function handleAddInsumo() {
    if (!selectedId || !selInsumoId) return setModalError("Selecione um insumo.");
    const qtd = parseFloat(insQtd);
    if (isNaN(qtd) || qtd <= 0) return setModalError("Quantidade deve ser positiva.");
    setModalError(null);
    try {
      await addInsumoToLote(selectedId, selInsumoId, qtd, insUnidade);
      closeModal();
      refresh();
      await reloadDetail();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao adicionar insumo.");
    }
  }

  async function handleEditInsumo() {
    if (!targetInsumo) return;
    if (pin !== "1234") return setPinError("PIN incorreto.");
    const qtd = parseFloat(editInsQtd);
    if (isNaN(qtd) || qtd <= 0) return setModalError("Quantidade deve ser positiva.");
    setPinError(null);
    setModalError(null);
    try {
      await updateInsumoLote(targetInsumo.id, qtd, editInsUnidade);
      closeModal();
      refresh();
      await reloadDetail();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function handleExcluirInsumo() {
    if (!targetInsumo) return;
    if (pin !== "1234") return setPinError("PIN incorreto.");
    setPinError(null);
    setModalError(null);
    try {
      await removeInsumoFromLote(targetInsumo.id);
      closeModal();
      refresh();
      await reloadDetail();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao remover.");
    }
  }

  async function handleExcluirLote() {
    if (!selectedId) return;
    if (pin !== "1234") return setPinError("PIN incorreto.");
    setPinError(null);
    setModalError(null);
    try {
      await deleteLote(selectedId);
      setLotes((prev) => prev.filter((l) => l.id !== selectedId));
      setSelectedId(null);
      setDetail(null);
      closeModal();
      refresh();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  async function handleMoverEnvase() {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await updateLoteStatus(selectedId, "envase");
      setLotes((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, status: "envase" } : l))
      );
      refresh();
      await reloadDetail();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Erro ao atualizar status.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConcluir() {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await updateLoteStatus(selectedId, "concluido");
      setLotes((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, status: "concluido" } : l))
      );
      refresh();
      await reloadDetail();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Erro ao atualizar status.");
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* ── Sidebar ── */}
      <aside
        className={`flex-shrink-0 flex-col border-r border-gray-200 bg-white md:flex ${mobileSidebarOpen ? "flex" : "hidden"}`}
        style={{ width: 220 }}
      >
        <div
          className="flex items-center justify-between px-4 py-4 border-b border-blue-200"
          style={{ backgroundColor: "#1565C0" }}
        >
          <span className="text-white" style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 16, fontWeight: 600 }}>Produção</span>
          <button
            onClick={handleNovaProdução}
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
            title="Novo Lote"
          >
            +
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {lotes.length === 0 && (
            <li className="px-4 py-3 text-gray-400 text-sm">
              Nenhum lote cadastrado.
            </li>
          )}
          {lotes.map((l) => {
            const isActive = l.id === selectedId;
            return (
              <li key={l.id}>
                <button
                  onClick={() => selectLote(l.id)}
                  className="text-left text-sm transition"
                  style={{
                    backgroundColor: isActive ? "#1565C0" : "transparent",
                    color: isActive ? "#ffffff" : "#1A3A6B",
                    borderRadius: 8,
                    padding: "12px 16px",
                    fontWeight: isActive ? 600 : 400,
                    margin: "0 4px",
                    width: "calc(100% - 8px)",
                    display: "block",
                  }}
                >
                  <div className="font-semibold truncate">
                    {l.formulas?.nome ?? "—"}
                  </div>
                  <div
                    className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap"
                    style={{ color: isActive ? "#BBDEFB" : "#607D8B" }}
                  >
                    <span>{l.numero_lote}</span>
                    <span>·</span>
                    <span>{l.data_producao}</span>
                  </div>
                  <div className="mt-1">
                    {isActive ? (
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor:
                            l.status === "producao"
                              ? "rgba(255,255,255,0.25)"
                              : l.status === "envase"
                              ? "rgba(187,222,251,0.5)"
                              : "rgba(200,230,201,0.5)",
                          color: "#fff",
                        }}
                      >
                        {l.status === "producao"
                          ? "produção"
                          : l.status === "envase"
                          ? "envase"
                          : "concluído"}
                      </span>
                    ) : (
                      <StatusBadge status={l.status} />
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ── Main panel ── */}
      <main className={`flex-1 overflow-y-auto bg-white md:block ${!mobileSidebarOpen ? "block" : "hidden"}`} style={{ padding: 24 }}>
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="mb-4 flex items-center gap-1 text-sm font-semibold md:hidden"
          style={{ color: "#1565C0" }}
        >
          ← Produção
        </button>
        {!selectedId && !detailLoading && (
          <div className="flex items-start justify-center min-h-[400px] pt-8">
            <div
              className="bg-white w-full rounded-xl p-8"
              style={{ maxWidth: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-lora), Georgia, serif",
                  fontSize: 24,
                  color: "#1A3A6B",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Nova Produção
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Preencha os dados para iniciar uma produção
              </p>

              {formulasLoading ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  Carregando fórmulas...
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <Field label="Fórmula *">
                    <select
                      className={inputCls}
                      value={selFormulaId}
                      onChange={(e) => handleFormulaChange(e.target.value)}
                    >
                      {formulasList.length === 0 && (
                        <option value="">Nenhuma fórmula cadastrada</option>
                      )}
                      {formulasList.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome} ({f.sigla})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Número do Lote *">
                    <input
                      className={inputCls}
                      value={novoNumeroLote}
                      onChange={(e) => setNovoNumeroLote(e.target.value)}
                      placeholder="Ex: DET001"
                    />
                  </Field>
                  <Field label="Data de Produção *">
                    <input
                      className={inputCls}
                      type="date"
                      value={novoData}
                      onChange={(e) => setNovoData(e.target.value)}
                    />
                  </Field>

                  {previewLoading && (
                    <p className="text-xs text-gray-400">
                      Carregando insumos da fórmula...
                    </p>
                  )}
                  {!previewLoading && formulaInsumosPreview.length > 0 && (
                    <div>
                      <p
                        className="text-xs font-semibold mb-1"
                        style={{ color: "#1A3A6B" }}
                      >
                        Insumos da fórmula:
                      </p>
                      <div className="rounded border border-gray-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ backgroundColor: "#E3F2FD" }}>
                              <th
                                className="text-left px-3 py-2 font-semibold"
                                style={{ color: "#1565C0" }}
                              >
                                Insumo
                              </th>
                              <th
                                className="text-left px-3 py-2 font-semibold"
                                style={{ color: "#1565C0" }}
                              >
                                Qtd
                              </th>
                              <th
                                className="text-left px-3 py-2 font-semibold"
                                style={{ color: "#1565C0" }}
                              >
                                Un.
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {formulaInsumosPreview.map((fi, idx) => (
                              <tr
                                key={fi.id}
                                style={{
                                  backgroundColor:
                                    idx % 2 === 0 ? "#F0F7FF" : "#ffffff",
                                }}
                              >
                                <td className="px-3 py-2 text-gray-700">
                                  {fi.insumos?.nome ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {fi.quantidade}
                                </td>
                                <td className="px-3 py-2 text-gray-600">
                                  {fi.unidade}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {inlineError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                      {inlineError}
                    </p>
                  )}

                  <button
                    onClick={handleIniciarProducao}
                    disabled={inlineSaving || formulasLoading}
                    style={{
                      backgroundColor: "#1565C0",
                      color: "white",
                      fontWeight: 700,
                      height: 48,
                      borderRadius: 8,
                      fontSize: 15,
                      width: "100%",
                      border: "none",
                      cursor: inlineSaving ? "not-allowed" : "pointer",
                      opacity: inlineSaving || formulasLoading ? 0.7 : 1,
                      marginTop: 8,
                    }}
                  >
                    {inlineSaving ? "Salvando..." : "INICIAR PRODUÇÃO"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {detailLoading && (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            <p className="text-gray-400">Carregando...</p>
          </div>
        )}

        {detailError && !detailLoading && (
          <p className="text-sm text-red-600 bg-red-50 rounded px-4 py-3 max-w-lg">
            {detailError}
          </p>
        )}

        {detail && !detailLoading && (
          <div className="max-w-3xl">
            {/* Panel header */}
            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2
                    className="text-2xl font-bold"
                    style={{ color: "#1A3A6B" }}
                  >
                    {detail.formulas?.nome ?? "—"}
                  </h2>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-bold tracking-wider"
                    style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}
                  >
                    {detail.numero_lote}
                  </span>
                  <StatusBadge status={detail.status} />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Data de produção:{" "}
                  <strong>{detail.data_producao}</strong>
                </p>
              </div>
              <div className="flex gap-2 flex-wrap flex-shrink-0">
                {detail.status === "producao" && (
                  <button
                    onClick={handleMoverEnvase}
                    disabled={actionLoading || isPending}
                    className="px-3 py-1.5 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                    style={{ backgroundColor: "#1565C0" }}
                  >
                    {actionLoading ? "Aguarde..." : "Mover para Envase"}
                  </button>
                )}
                {detail.status === "envase" && (
                  <button
                    onClick={handleConcluir}
                    disabled={actionLoading || isPending}
                    className="px-3 py-1.5 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                    style={{ backgroundColor: "#2E7D32" }}
                  >
                    {actionLoading ? "Aguarde..." : "Concluir"}
                  </button>
                )}
                <button
                  onClick={openExcluirLote}
                  className="px-3 py-1.5 rounded border border-red-300 text-sm font-semibold hover:bg-red-50 transition"
                  style={{ color: "#C62828" }}
                >
                  Excluir Lote
                </button>
              </div>
            </div>

            {/* Insumos table */}
            <h3
              className="font-semibold text-base mb-3"
              style={{ color: "#1A3A6B" }}
            >
              Insumos Utilizados
            </h3>

            <div className="overflow-x-auto rounded-lg shadow mb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: "#1565C0" }}>
                    {["Insumo", "Quantidade", "Unidade", "Ações"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-white font-bold px-4 py-4"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lote_insumos.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-8 text-gray-400"
                      >
                        Nenhum insumo adicionado.
                      </td>
                    </tr>
                  )}
                  {detail.lote_insumos.map((li, idx) => (
                    <tr
                      key={li.id}
                      style={{
                        backgroundColor: idx % 2 === 0 ? "#F0F7FF" : "#ffffff",
                      }}
                    >
                      <td className="px-4 py-4 font-medium text-gray-800">
                        {li.insumos?.nome ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {li.quantidade}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{li.unidade}</td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => openEditInsumo(li)}
                            className="px-2 py-1 rounded text-white text-xs font-semibold hover:brightness-110 transition"
                            style={{ backgroundColor: "#1565C0" }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => openExcluirInsumo(li)}
                            title="Remover insumo"
                            style={{
                              width: '32px',
                              height: '32px',
                              minWidth: '32px',
                              minHeight: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#C62828',
                              color: 'white',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0',
                              flexShrink: 0,
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={openAddInsumo}
              className="px-4 py-2 rounded text-white text-sm font-semibold shadow hover:brightness-110 transition"
              style={{ backgroundColor: "#1565C0" }}
            >
              + Adicionar Insumo
            </button>
          </div>
        )}
      </main>

      {/* ── Modal: Adicionar Insumo ── */}
      {modal === "addInsumo" && (
        <Modal title="Adicionar Insumo" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            {insumosLoading ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                Carregando insumos...
              </p>
            ) : (
              <>
                <Field label="Insumo *">
                  <select
                    className={inputCls}
                    value={selInsumoId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelInsumoId(id);
                      const ins = insumosList.find((i) => i.id === id);
                      if (ins) setInsUnidade(ins.unidade);
                    }}
                  >
                    {insumosList.length === 0 && (
                      <option value="">Nenhum insumo cadastrado</option>
                    )}
                    {insumosList.map((ins) => (
                      <option key={ins.id} value={ins.id}>
                        {ins.nome} ({ins.unidade})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantidade *">
                  <input
                    className={inputCls}
                    type="number"
                    min="0.001"
                    step="any"
                    value={insQtd}
                    onChange={(e) => setInsQtd(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="Unidade *">
                  <select
                    className={inputCls}
                    value={insUnidade}
                    onChange={(e) => setInsUnidade(e.target.value)}
                  >
                    {INSUMO_UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleAddInsumo}
              saveLabel={isPending ? "Salvando..." : "SALVAR"}
              disabled={isPending || insumosLoading}
            />
          </div>
        </Modal>
      )}

      {/* ── Modal: Editar Insumo do Lote ── */}
      {modal === "editInsumo" && targetInsumo && (
        <Modal title="Editar Insumo do Lote" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <Field label="Insumo">
              <input
                className={`${inputCls} bg-gray-50 text-gray-500`}
                value={targetInsumo.insumos?.nome ?? "—"}
                disabled
              />
            </Field>
            <Field label="Quantidade *">
              <input
                className={inputCls}
                type="number"
                min="0.001"
                step="any"
                value={editInsQtd}
                onChange={(e) => setEditInsQtd(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Unidade *">
              <select
                className={inputCls}
                value={editInsUnidade}
                onChange={(e) => setEditInsUnidade(e.target.value)}
              >
                {INSUMO_UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <PinField pin={pin} setPin={setPin} pinError={pinError} />
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleEditInsumo}
              saveLabel={isPending ? "Salvando..." : "SALVAR"}
              disabled={isPending}
            />
          </div>
        </Modal>
      )}

      {/* ── Modal: Excluir Insumo do Lote ── */}
      {modal === "excluirInsumo" && targetInsumo && (
        <Modal title="Remover Insumo do Lote" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-700">
              Tem certeza que deseja remover{" "}
              <strong>{targetInsumo.insumos?.nome ?? "este insumo"}</strong> do
              lote?
            </p>
            <PinField pin={pin} setPin={setPin} pinError={pinError} />
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleExcluirInsumo}
              saveLabel={isPending ? "Removendo..." : "REMOVER"}
              saveColor="#C62828"
              disabled={isPending}
            />
          </div>
        </Modal>
      )}

      {/* ── Modal: Excluir Lote ── */}
      {modal === "excluirLote" && detail && (
        <Modal title="Excluir Lote" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl flex-shrink-0 mt-0.5" aria-hidden="true">
                ⚠️
              </span>
              <p className="text-sm text-gray-700">
                Tem certeza que deseja excluir o lote{" "}
                <strong>{detail.numero_lote}</strong>? Esta ação não pode ser
                desfeita.
              </p>
            </div>
            <PinField pin={pin} setPin={setPin} pinError={pinError} />
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleExcluirLote}
              saveLabel={isPending ? "Excluindo..." : "EXCLUIR"}
              saveColor="#C62828"
              disabled={isPending}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
