"use client";

import { useState, useEffect, useTransition } from "react";
import { Trash2, Pencil } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getLotesProducao,
  getLoteWithInsumos,
  createLote,
  deleteLote,
  addInsumoToLote,
  removeInsumoFromLote,
  updateInsumoLote,
  updateLoteStatus,
  updateLote,
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

type EditableInsumo = { insumo_id: string; nome: string; quantidade: number; unidade: string };

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
  isAdmin,
}: {
  initialLotes: LoteWithFormula[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [novoFragrancia, setNovoFragrancia] = useState("");
  const [formulaInsumosPreview, setFormulaInsumosPreview] = useState<FormulaInsumoPreview[]>([]);
  const [editableInsumos, setEditableInsumos] = useState<EditableInsumo[]>([]);
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

  // Lote header inline edit state
  const [editingLoteHeader, setEditingLoteHeader] = useState(false);
  const [editNumeroLote, setEditNumeroLote] = useState("");
  const [editDataProducao, setEditDataProducao] = useState("");
  const [editFragrancia, setEditFragrancia] = useState("");
  const [loteEditSaving, setLoteEditSaving] = useState(false);
  const [loteEditError, setLoteEditError] = useState<string | null>(null);

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
    setNovoFragrancia("");
    setFormulaInsumosPreview([]);
    setEditableInsumos([]);
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
    setEditingLoteHeader(false);
    setLoteEditError(null);
    await loadDetail(id);
  }

  async function reloadDetail() {
    if (selectedId) await loadDetail(selectedId);
  }

  // ── Load formulas on mount for the inline form ──

  useEffect(() => {
    const formulaIdParam = searchParams.get("formula_id");
    setFormulasLoading(true);
    getFormulasList()
      .then((list) => {
        setFormulasList(list);
        if (list.length > 0) {
          const target = formulaIdParam
            ? (list.find((f) => f.id === formulaIdParam) ?? list[0])
            : list[0];
          handleFormulaChange(target.id, target, list);
        }
      })
      .catch((err) => {
        console.error("[ProducaoClient] getFormulasList error:", err);
      })
      .finally(() => setFormulasLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleNovaProdução() {
    setSelectedId(null);
    setDetail(null);
    setInlineError(null);
    setNovoData(todayStr());
    setNovoFragrancia("");
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
    setEditableInsumos([]);
    try {
      const preview = await getFormulaInsumos(formulaId);
      setFormulaInsumosPreview(preview);
      setEditableInsumos(preview.map((fi) => ({
        insumo_id: fi.insumo_id,
        nome: fi.insumos?.nome ?? "—",
        quantidade: fi.quantidade,
        unidade: fi.unidade,
      })));
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
      const overrides = isAdmin && editableInsumos.length > 0 ? editableInsumos : undefined;
      const newLote = await createLote(selFormulaId, novoNumeroLote.trim(), novoData, overrides, novoFragrancia.trim() || undefined);
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
      router.push(`/envase?lote_id=${selectedId}`);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Erro ao atualizar status.");
      setActionLoading(false);
    }
  }

  async function handleSaveLoteHeader() {
    if (!selectedId) return;
    if (!editNumeroLote.trim()) return setLoteEditError("Número do lote é obrigatório.");
    if (!editDataProducao) return setLoteEditError("Data é obrigatória.");
    setLoteEditError(null);
    setLoteEditSaving(true);
    try {
      const updated = await updateLote(selectedId, editNumeroLote.trim(), editDataProducao, editFragrancia.trim() || undefined);
      setLotes((prev) =>
        prev.map((l) =>
          l.id === selectedId
            ? { ...l, numero_lote: updated.numero_lote, data_producao: updated.data_producao }
            : l
        )
      );
      refresh();
      await reloadDetail();
      setEditingLoteHeader(false);
    } catch (e) {
      setLoteEditError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setLoteEditSaving(false);
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
    <div className="flex overflow-hidden" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* ── Sidebar ── */}
      <aside
        className={`flex-shrink-0 flex-col border-r border-gray-200 bg-white md:flex relative z-10 ${mobileSidebarOpen ? "flex" : "hidden"}`}
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
                    cursor: "pointer",
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
      <main className={`flex-1 min-w-0 overflow-y-auto bg-white md:block ${!mobileSidebarOpen ? "block" : "hidden"}`} style={{ padding: 24 }}>
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="mb-4 flex items-center gap-1 text-sm font-semibold md:hidden"
          style={{ color: "#1565C0", cursor: "pointer" }}
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
                  <Field label="Fragrância (opcional)">
                    <input
                      className={inputCls}
                      value={novoFragrancia}
                      onChange={(e) => setNovoFragrancia(e.target.value)}
                      placeholder="Ex: Lavanda"
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
                              <th className="text-left px-3 py-2 font-semibold" style={{ color: "#1565C0" }}>Insumo</th>
                              <th className="text-left px-3 py-2 font-semibold" style={{ color: "#1565C0" }}>Qtd</th>
                              <th className="text-left px-3 py-2 font-semibold" style={{ color: "#1565C0" }}>Un.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {isAdmin
                              ? editableInsumos.map((item, idx) => (
                                  <tr key={item.insumo_id} style={{ backgroundColor: idx % 2 === 0 ? "#F0F7FF" : "#ffffff" }}>
                                    <td className="px-3 py-2 text-gray-700">{item.nome}</td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={item.quantidade}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setEditableInsumos((prev) =>
                                            prev.map((ei, i) =>
                                              i === idx ? { ...ei, quantidade: parseFloat(val) || 0 } : ei
                                            )
                                          );
                                        }}
                                        className="border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                        style={{ maxWidth: 100 }}
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <select
                                        value={item.unidade}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setEditableInsumos((prev) =>
                                            prev.map((ei, i) =>
                                              i === idx ? { ...ei, unidade: val } : ei
                                            )
                                          );
                                        }}
                                        className="border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                      >
                                        {INSUMO_UNIDADES.map((u) => (
                                          <option key={u} value={u}>{u}</option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                ))
                              : formulaInsumosPreview.map((fi, idx) => (
                                  <tr key={fi.id} style={{ backgroundColor: idx % 2 === 0 ? "#F0F7FF" : "#ffffff" }}>
                                    <td className="px-3 py-2 text-gray-700">{fi.insumos?.nome ?? "—"}</td>
                                    <td className="px-3 py-2 text-gray-600">{fi.quantidade}</td>
                                    <td className="px-3 py-2 text-gray-600">{fi.unidade}</td>
                                  </tr>
                                ))
                            }
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
                  {editingLoteHeader ? (
                    <input
                      className="border border-blue-300 rounded px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                      style={{ color: "#1565C0", maxWidth: 160 }}
                      maxLength={10}
                      value={editNumeroLote}
                      onChange={(e) => setEditNumeroLote(e.target.value)}
                    />
                  ) : (
                    <>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-bold tracking-wider"
                        style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}
                      >
                        {detail.numero_lote}
                      </span>
                      <StatusBadge status={detail.status} />
                      {isAdmin && detail.status === "producao" && (
                        <button
                          onClick={() => {
                            setEditNumeroLote(detail.numero_lote);
                            setEditDataProducao(detail.data_producao);
                            setEditFragrancia(detail.fragancia ?? "");
                            setLoteEditError(null);
                            setEditingLoteHeader(true);
                          }}
                          className="p-1 rounded hover:bg-blue-50 transition"
                          style={{ color: "#1565C0" }}
                          title="Editar lote"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
                {editingLoteHeader ? (
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-500">Data:</label>
                      <input
                        type="date"
                        className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        value={editDataProducao}
                        onChange={(e) => setEditDataProducao(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-500">Fragrância:</label>
                      <input
                        className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        value={editFragrancia}
                        onChange={(e) => setEditFragrancia(e.target.value)}
                        placeholder="Opcional"
                        style={{ maxWidth: 160 }}
                      />
                    </div>
                    {loteEditError && (
                      <span className="text-xs text-red-600">{loteEditError}</span>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveLoteHeader}
                        disabled={loteEditSaving}
                        className="px-3 py-1 rounded text-white text-xs font-semibold hover:brightness-110 transition disabled:opacity-60"
                        style={{ backgroundColor: "#2E7D32" }}
                      >
                        {loteEditSaving ? "Salvando..." : "✓ Salvar"}
                      </button>
                      <button
                        onClick={() => { setEditingLoteHeader(false); setLoteEditError(null); }}
                        className="px-3 py-1 rounded text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
                      >
                        ✗ Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 mt-1">
                    <p>
                      Data de produção:{" "}
                      <strong>{detail.data_producao}</strong>
                    </p>
                    {detail.fragancia && (
                      <p>
                        Fragrância:{" "}
                        <strong>{detail.fragancia}</strong>
                      </p>
                    )}
                  </div>
                )}
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
                <button
                  onClick={openExcluirLote}
                  className="px-3 py-1.5 rounded border border-red-300 text-sm font-semibold hover:bg-red-50 transition"
                  style={{ color: "#C62828" }}
                >
                  Excluir Lote
                </button>
              </div>
            </div>

            {/* Status info banners */}
            {detail.status === "envase" && (
              <div
                className="flex items-center gap-3 rounded-lg px-4 py-3 mb-5 text-sm"
                style={{ backgroundColor: "#E3F2FD", color: "#1565C0", border: "1px solid #BBDEFB" }}
              >
                <span style={{ fontSize: 18 }}>ℹ️</span>
                <span>Este lote está em envase. Aceda ao módulo Envase para concluir.</span>
              </div>
            )}
            {detail.status === "concluido" && (
              <div
                className="flex items-center gap-3 rounded-lg px-4 py-3 mb-5 text-sm"
                style={{ backgroundColor: "#E8F5E9", color: "#2E7D32", border: "1px solid #C8E6C9" }}
              >
                <span style={{ fontSize: 18 }}>✓</span>
                <span>Lote concluído.</span>
              </div>
            )}

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
                    {(detail.status === "producao"
                      ? ["Insumo", "Quantidade", "Unidade", "Ações"]
                      : ["Insumo", "Quantidade", "Unidade"]
                    ).map((h) => (
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
                        colSpan={detail.status === "producao" ? 4 : 3}
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
                      {detail.status === "producao" && (
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
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.status === "producao" && (
              <button
                onClick={openAddInsumo}
                className="px-4 py-2 rounded text-white text-sm font-semibold shadow hover:brightness-110 transition"
                style={{ backgroundColor: "#1565C0" }}
              >
                + Adicionar Insumo
              </button>
            )}
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
