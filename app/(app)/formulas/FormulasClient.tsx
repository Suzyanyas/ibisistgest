"use client";

import { useState, useTransition } from "react";
import { Trash2, AlertTriangle, FlaskConical, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createFormula,
  updateFormula,
  updateFormulaInsumo,
  deleteFormula,
  duplicarFormula,
  addInsumoToFormula,
  removeInsumoFromFormula,
  getFormulaWithInsumos,
  getInsumosList,
  type FormulaRow,
  type FormulaWithInsumos,
  type FormulaInsumoRow,
  type InsumoBasic,
} from "@/app/actions/formulas";
import { updateCustoInsumo } from "@/app/actions/insumos";

type ModalType = null | "nova" | "editar" | "duplicar" | "addInsumo" | "excluir" | "editInsumo" | "removeInsumo";

type DuplicarInsumoRow = {
  insumo_id: string;
  insumo_nome: string;
  quantidade: string;
  unidade: string;
  isNew?: boolean;
};

const RENDIMENTO_UNIDADES = ["L", "KG", "UN"];
const INSUMO_UNIDADES = ["KG", "L", "G", "ML", "PCT", "UN"];

function getUnidadesCompativeis(insumoUnidade: string): string[] {
  if (insumoUnidade === "KG" || insumoUnidade === "G") return ["KG", "G"];
  if (insumoUnidade === "L" || insumoUnidade === "ML") return ["L", "ML"];
  if (insumoUnidade === "UN") return ["UN"];
  if (insumoUnidade === "PCT") return ["PCT"];
  return INSUMO_UNIDADES;
}

function isFraganciaInsumo(nome: string): boolean {
  const lower = nome.toLowerCase();
  return lower.includes("ess") || lower.includes("essencia") || lower.includes("fragran");
}

function convertToBase(quantidade: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return quantidade;
  if (fromUnit === "G" && toUnit === "KG") return quantidade / 1000;
  if (fromUnit === "KG" && toUnit === "G") return quantidade * 1000;
  if (fromUnit === "ML" && toUnit === "L") return quantidade / 1000;
  if (fromUnit === "L" && toUnit === "ML") return quantidade * 1000;
  console.warn(`convertToBase: unidades incompatíveis (${fromUnit} -> ${toUnit})`);
  return 0;
}

// ─── Shared UI ─────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
  danger,
  contentStyle,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  danger?: boolean;
  contentStyle?: React.CSSProperties;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="bg-white w-full max-w-sm mx-4 md:max-w-md"
        style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", ...contentStyle }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: danger ? "#C62828" : "#1565C0", borderRadius: "12px 12px 0 0" }}
        >
          <h2 className="text-white font-semibold text-lg flex items-center">
            {danger && <AlertTriangle size={20} color="white" style={{ marginRight: 8 }} />}
            {title}
          </h2>
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
        style={{
          backgroundColor: saveColor ?? "#1565C0",
          boxShadow: saveColor === "#C62828" ? "0 4px 16px rgba(198,40,40,0.4)" : undefined,
        }}
      >
        {saveLabel}
      </button>
    </div>
  );
}

// ─── Formula form state helper ─────────────────────────────────────────────────

function emptyFormulaForm() {
  return { nome: "", sigla: "", rendimento: "", rendimento_unidade: "L", obs: "" };
}

function generateSigla(nome: string): string {
  if (!nome.trim()) return "";

  const words = nome.trim().toUpperCase().split(/\s+/);

  if (words.length === 1) {
    // Single word: first letter + first consonants, max 3-4 chars
    const word = words[0];
    const vowels = /[AEIOUÁÉÍÓÚÀÈÌÒÙÃÕÂÊÎÔÛÜ]/;
    let result = word[0]; // always keep first letter
    let i = 1;
    while (result.length < 3 && i < word.length) {
      if (!vowels.test(word[i])) {
        result += word[i];
      }
      i++;
    }
    return result.slice(0, 6);
  } else {
    // Multiple words: first letter of each word, max 6 chars
    return words.map((w) => w[0]).join("").slice(0, 6);
  }
}

function fromFormula(f: FormulaRow) {
  return {
    nome: f.nome,
    sigla: f.sigla,
    rendimento: String(f.rendimento),
    rendimento_unidade: f.rendimento_unidade,
    obs: f.obs ?? "",
  };
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function FormulasClient({
  initialFormulas,
  isAdmin,
}: {
  initialFormulas: FormulaRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formulas, setFormulas] = useState<FormulaRow[]>(initialFormulas);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FormulaWithInsumos | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalType>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Formula form
  const [form, setForm] = useState(emptyFormulaForm());
  const [siglaManuallyEdited, setSiglaManuallyEdited] = useState(false);

  // Duplicar formula form
  const [dupNome, setDupNome] = useState("");
  const [dupSigla, setDupSigla] = useState("");
  const [dupSiglaManuallyEdited, setDupSiglaManuallyEdited] = useState(false);
  const [dupSaving, setDupSaving] = useState(false);
  const [duplicarInsumos, setDuplicarInsumos] = useState<DuplicarInsumoRow[]>([]);

  // Add insumo form
  const [insumosList, setInsumosList] = useState<InsumoBasic[]>([]);
  const [insumosLoading, setInsumosLoading] = useState(false);
  const [selInsumoId, setSelInsumoId] = useState("");
  const [insQtd, setInsQtd] = useState("");
  const [insUnidade, setInsUnidade] = useState("KG");

  // Edit / remove insumo
  const [targetInsumo, setTargetInsumo] = useState<FormulaInsumoRow | null>(null);
  const [editInsQtd, setEditInsQtd] = useState("");
  const [editInsUnidade, setEditInsUnidade] = useState("KG");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Inline custo_unitario editing
  const [editingCustoId, setEditingCustoId] = useState<string | null>(null);
  const [editingCustoValue, setEditingCustoValue] = useState("");
  const [editingCustoUnidade, setEditingCustoUnidade] = useState("KG");
  const [custoSaving, setCustoSaving] = useState(false);
  const [custoError, setCustoError] = useState<string | null>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  // ── Helpers ──

  function refresh() {
    startTransition(() => router.refresh());
  }

  function closeModal() {
    setModal(null);
    setModalError(null);
    setForm(emptyFormulaForm());
    setSiglaManuallyEdited(false);
    setDupNome("");
    setDupSigla("");
    setDupSiglaManuallyEdited(false);
    setDuplicarInsumos([]);
    setSelInsumoId("");
    setInsQtd("");
    setInsUnidade("KG");
    setTargetInsumo(null);
    setEditInsQtd("");
    setEditInsUnidade("KG");
    setPin("");
    setPinError(null);
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const d = await getFormulaWithInsumos(id);
      setDetail(d);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function selectFormula(id: string) {
    setSelectedId(id);
    setMobileSidebarOpen(false);
    await loadDetail(id);
  }

  async function reloadDetail() {
    if (selectedId) await loadDetail(selectedId);
  }

  // ── Open modals ──

  function openNova() {
    setForm(emptyFormulaForm());
    setModalError(null);
    setModal("nova");
  }

  function openEditar() {
    if (!detail) return;
    setForm(fromFormula(detail));
    setModalError(null);
    setModal("editar");
  }

  async function openDuplicar() {
    if (!detail) return;
    const nomeSugerido = `${detail.nome} (cópia)`;
    setDupNome(nomeSugerido);
    setDupSigla(generateSigla(nomeSugerido));
    setDupSiglaManuallyEdited(false);
    setDuplicarInsumos(
      detail.formula_insumos.map((fi) => ({
        insumo_id: fi.insumo_id,
        insumo_nome: fi.insumos?.nome ?? "—",
        quantidade: String(fi.quantidade),
        unidade: fi.unidade,
      }))
    );
    setModalError(null);
    setModal("duplicar");
    setInsumosLoading(true);
    try {
      const list = await getInsumosList();
      setInsumosList(list);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao carregar insumos.");
    } finally {
      setInsumosLoading(false);
    }
  }

  function addDuplicarRow() {
    const first = insumosList[0];
    setDuplicarInsumos((prev) => [
      ...prev,
      {
        insumo_id: first?.id ?? "",
        insumo_nome: first?.nome ?? "",
        quantidade: "",
        unidade: first?.unidade ?? "KG",
        isNew: true,
      },
    ]);
  }

  function removeDuplicarRow(idx: number) {
    setDuplicarInsumos((prev) => prev.filter((_, i) => i !== idx));
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

  function openExcluir() {
    setModalError(null);
    setModal("excluir");
  }

  function openEditInsumo(fi: FormulaInsumoRow) {
    setTargetInsumo(fi);
    setEditInsQtd(String(fi.quantidade));
    setEditInsUnidade(fi.unidade);
    setPin("");
    setPinError(null);
    setModalError(null);
    setModal("editInsumo");
  }

  function openRemoveInsumo(fi: FormulaInsumoRow) {
    setTargetInsumo(fi);
    setPin("");
    setPinError(null);
    setModalError(null);
    setModal("removeInsumo");
  }

  // ── Saves ──

  function validateForm() {
    if (!form.nome.trim()) return "Nome é obrigatório.";
    if (!form.sigla.trim()) return "Sigla é obrigatória.";
    const rend = parseFloat(form.rendimento);
    if (isNaN(rend) || rend <= 0) return "Rendimento deve ser positivo.";
    return null;
  }

  async function handleSaveNova() {
    const err = validateForm();
    if (err) return setModalError(err);
    setModalError(null);
    try {
      const nova = await createFormula({
        nome: form.nome.trim(),
        sigla: form.sigla.trim().toUpperCase(),
        rendimento: parseFloat(form.rendimento),
        rendimento_unidade: form.rendimento_unidade,
        obs: form.obs.trim() || null,
      });
      setFormulas((prev) =>
        [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome))
      );
      closeModal();
      refresh();
      selectFormula(nova.id);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function handleSaveEditar() {
    if (!selectedId) return;
    const err = validateForm();
    if (err) return setModalError(err);
    setModalError(null);
    try {
      await updateFormula(selectedId, {
        nome: form.nome.trim(),
        sigla: form.sigla.trim().toUpperCase(),
        rendimento: parseFloat(form.rendimento),
        rendimento_unidade: form.rendimento_unidade,
        obs: form.obs.trim() || null,
      });
      setFormulas((prev) =>
        prev
          .map((f) =>
            f.id === selectedId
              ? {
                  ...f,
                  nome: form.nome.trim(),
                  sigla: form.sigla.trim().toUpperCase(),
                  rendimento: parseFloat(form.rendimento),
                  rendimento_unidade: form.rendimento_unidade,
                  obs: form.obs.trim() || null,
                }
              : f
          )
          .sort((a, b) => a.nome.localeCompare(b.nome))
      );
      closeModal();
      refresh();
      await reloadDetail();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function handleSaveDuplicar() {
    if (!selectedId) return;
    if (!dupNome.trim()) return setModalError("Nome é obrigatório.");
    if (!dupSigla.trim()) return setModalError("Sigla é obrigatória.");

    const insumoOverrides: Array<{ insumo_id: string; quantidade: number; unidade: string }> = [];
    for (const row of duplicarInsumos) {
      if (!row.insumo_id) {
        return setModalError("Selecione um insumo para todas as linhas adicionadas.");
      }
      const qtd = parseFloat(row.quantidade.replace(",", "."));
      if (isNaN(qtd) || qtd <= 0) {
        return setModalError(`Quantidade inválida para "${row.insumo_nome || "novo insumo"}".`);
      }
      insumoOverrides.push({ insumo_id: row.insumo_id, quantidade: qtd, unidade: row.unidade });
    }

    setModalError(null);
    setDupSaving(true);
    try {
      const nova = await duplicarFormula(
        selectedId,
        dupNome.trim(),
        dupSigla.trim().toUpperCase(),
        insumoOverrides
      );
      setFormulas((prev) =>
        [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome))
      );
      closeModal();
      refresh();
      await selectFormula(nova.id);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao duplicar.");
    } finally {
      setDupSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    setModalError(null);
    try {
      await deleteFormula(selectedId);
      setFormulas((prev) => prev.filter((f) => f.id !== selectedId));
      setSelectedId(null);
      setDetail(null);
      closeModal();
      refresh();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  async function handleAddInsumo() {
    if (!selectedId || !selInsumoId) return setModalError("Selecione um insumo.");
    const qtd = parseFloat(insQtd);
    if (isNaN(qtd) || qtd <= 0) return setModalError("Quantidade deve ser positiva.");
    setModalError(null);
    try {
      await addInsumoToFormula(selectedId, selInsumoId, qtd, insUnidade);
      closeModal();
      refresh();
      await reloadDetail();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao adicionar.");
    }
  }

  async function handleEditInsumo() {
    if (!targetInsumo) return;
    if (pin !== "1234") return setPinError("PIN incorreto");
    const qtd = parseFloat(editInsQtd);
    if (isNaN(qtd) || qtd <= 0) return setModalError("Quantidade deve ser positiva.");
    setPinError(null);
    setModalError(null);
    try {
      await updateFormulaInsumo(targetInsumo.id, qtd, editInsUnidade);
      closeModal();
      refresh();
      await reloadDetail();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function handleRemoveInsumoConfirm() {
    if (!targetInsumo) return;
    if (pin !== "1234") return setPinError("PIN incorreto");
    setPinError(null);
    setModalError(null);
    try {
      await removeInsumoFromFormula(targetInsumo.id);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              formula_insumos: prev.formula_insumos.filter((fi) => fi.id !== targetInsumo.id),
            }
          : prev
      );
      closeModal();
      refresh();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao remover.");
    }
  }

  async function handleSaveCusto(insumoId: string) {
    const val = parseFloat(editingCustoValue.replace(",", "."));
    if (isNaN(val) || val < 0) return setCustoError("Valor inválido.");
    setCustoError(null);
    setCustoSaving(true);
    try {
      await updateCustoInsumo(insumoId, val, editingCustoUnidade);
      await reloadDetail();
      setEditingCustoId(null);
    } catch (e) {
      setCustoError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setCustoSaving(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* ── Sidebar ── */}
      <aside
        className={`flex-shrink-0 flex-col border-r-2 md:flex relative z-10 ${mobileSidebarOpen ? "flex" : "hidden"}`}
        style={{ width: 220, background: "linear-gradient(180deg, #F8FAFF 0%, #EEF4FF 100%)", borderRightColor: "#E0EAFF" }}
      >
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: "1px solid #E0EAFF" }}
        >
          <span style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 18, fontWeight: 700, color: "#1A3A6B" }}>Fórmulas</span>
          <button
            onClick={openNova}
            className="btn-icon"
            style={{
              width: "32px",
              height: "32px",
              minWidth: "32px",
              minHeight: "32px",
              borderRadius: "50%",
              border: "none",
              background: "#1565C0",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: "700",
              cursor: "pointer",
              flexShrink: 0,
              boxShadow: "0 2px 6px rgba(21,101,192,0.3)",
            }}
            title="Nova Fórmula"
          >
            +
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {formulas.length === 0 && (
            <li className="px-4 py-3 text-gray-400 text-sm">
              Nenhuma fórmula cadastrada.
            </li>
          )}
          {formulas.map((f) => {
            const isActive = f.id === selectedId;
            return (
              <li key={f.id}>
                <button
                  onClick={() => selectFormula(f.id)}
                  className="sidebar-item sidebar-nav-premium w-full text-left text-sm transition"
                  style={{
                    background: isActive
                      ? "linear-gradient(90deg, rgba(21,101,192,0.12) 0%, rgba(21,101,192,0.04) 100%)"
                      : "transparent",
                    borderLeft: isActive ? "3px solid #1565C0" : "3px solid transparent",
                    color: isActive ? "#1565C0" : "#1A3A6B",
                    borderRadius: 8,
                    padding: "12px 16px",
                    fontWeight: isActive ? 700 : 400,
                    margin: "0 4px",
                    width: "calc(100% - 8px)",
                    cursor: "pointer",
                  }}
                >
                  {f.nome}
                  {isActive && (
                    <span className="ml-2 text-xs" style={{ color: "#1565C0" }}>{f.sigla}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ── Main panel ── */}
      <main
        className={`flex-1 overflow-y-auto md:block ${!mobileSidebarOpen ? "block" : "hidden"}`}
        style={{ padding: 24, background: "linear-gradient(180deg, #F8FAFF 0%, #FFFFFF 80px)" }}
      >
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="mb-4 flex items-center gap-1 text-sm font-semibold md:hidden hover:bg-gray-100 transition-all active:scale-95"
          style={{ color: "#1565C0", cursor: "pointer" }}
        >
          ← Fórmulas
        </button>
        {!selectedId && !detailLoading && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-2">
            <FlaskConical size={48} color="#E0EAFF" />
            <p style={{ fontSize: 16, color: "#9CA3AF" }}>
              Selecione uma fórmula
            </p>
            <p style={{ fontSize: 13, color: "#C4C4C4" }}>
              ou crie uma nova fórmula
            </p>
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
            <div
              className="flex items-start justify-between gap-4 flex-wrap"
              style={{ paddingBottom: 16, borderBottom: "1px solid #E8F4FF", marginBottom: 20 }}
            >
              <div>
                <div className="flex items-center gap-3">
                  <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1A3A6B", fontFamily: "var(--font-lora), Georgia, serif" }}>
                    {detail.nome}
                  </h2>
                  <span
                    style={{
                      backgroundColor: "#E8F4FF",
                      color: "#1565C0",
                      borderRadius: 8,
                      padding: "3px 10px",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {detail.sigla}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "#6B7A99", marginTop: 4 }}>
                  Rendimento:{" "}
                  <strong>
                    {detail.rendimento} {detail.rendimento_unidade}
                  </strong>
                </p>
                {detail.obs && (
                  <p style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic", marginTop: 4 }}>{detail.obs}</p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={openEditar}
                  className="px-3 py-1.5 rounded border border-blue-300 text-sm font-semibold hover:bg-blue-50 transition"
                  style={{ color: "#1565C0" }}
                >
                  Editar Fórmula
                </button>
                {isAdmin && (
                  <button
                    onClick={openDuplicar}
                    className="px-3 py-1.5 rounded border border-blue-300 text-sm font-semibold hover:bg-blue-50 transition flex items-center gap-1.5"
                    style={{ color: "#1565C0" }}
                  >
                    <Copy size={14} />
                    Duplicar
                  </button>
                )}
                <button
                  onClick={openExcluir}
                  className="px-3 py-1.5 rounded border border-red-300 text-sm font-semibold hover:bg-red-50 transition"
                  style={{ color: "#C62828" }}
                >
                  Excluir Fórmula
                </button>
              </div>
            </div>

            {/* Insumos table */}
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#1A3A6B",
                  borderLeft: "3px solid #00BCD4",
                  paddingLeft: 8,
                }}
              >
                Insumos
              </h3>
            </div>

            <div className="overflow-x-auto rounded-lg shadow mb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr
                    style={{
                      background: "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)",
                      boxShadow: "0 2px 8px rgba(21,101,192,0.2)",
                    }}
                  >
                    <th className="text-left text-white font-bold px-4 py-4" style={{ fontSize: 13 }}>
                      Insumo
                    </th>
                    <th className="text-right text-white font-bold px-4 py-4" style={{ fontSize: 13 }}>
                      Quantidade
                    </th>
                    <th className="text-left text-white font-bold px-4 py-4" style={{ fontSize: 13 }}>
                      Unidade
                    </th>
                    {isAdmin && (
                      <>
                        <th className="text-left text-white font-bold px-4 py-4" style={{ fontSize: 13 }}>
                          <span className="flex items-center gap-1.5">
                            Custo Unit. (R$)
                            <span className="px-1 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: "#C62828" }}>
                              Admin
                            </span>
                          </span>
                        </th>
                        <th className="text-left text-white font-bold px-4 py-4" style={{ fontSize: 13 }}>
                          Custo Total (R$)
                        </th>
                      </>
                    )}
                    <th className="text-left text-white font-bold px-4 py-4" style={{ fontSize: 13 }}>
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.formula_insumos.length === 0 && (
                    <tr className="table-row-hover">
                      <td colSpan={isAdmin ? 6 : 4} className="text-center py-8 text-gray-400">
                        Nenhum insumo adicionado.
                      </td>
                    </tr>
                  )}
                  {detail.formula_insumos.map((fi, idx) => {
                    const custoUnit = Number(fi.insumos?.custo_unitario ?? 0);
                    const custoUnidade = fi.insumos?.custo_unidade ?? null;
                    const qtdConvertida = custoUnidade ? convertToBase(fi.quantidade, fi.unidade, custoUnidade) : 0;
                    const custoTotal = qtdConvertida * custoUnit;
                    const isEditingThis = editingCustoId === fi.id;
                    return (
                      <tr key={fi.id} className="table-row-hover" style={{ backgroundColor: idx % 2 === 0 ? "#F0F7FF" : "#ffffff" }}>
                        <td className="px-4 py-4 font-medium text-gray-800">{fi.insumos?.nome ?? "—"}</td>
                        <td className="px-4 py-4 text-right text-gray-700">{fi.quantidade}</td>
                        <td className="px-4 py-4 text-gray-700">{fi.unidade}</td>
                        {isAdmin && (
                          <>
                            <td className="px-4 py-4 text-gray-700">
                              {isEditingThis ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    className="border border-blue-400 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={editingCustoValue}
                                    onChange={(e) => setEditingCustoValue(e.target.value)}
                                    placeholder="0,00"
                                    autoFocus
                                  />
                                  <select
                                    className="border border-blue-400 rounded px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={editingCustoUnidade}
                                    onChange={(e) => setEditingCustoUnidade(e.target.value)}
                                  >
                                    {INSUMO_UNIDADES.map((u) => (
                                      <option key={u} value={u}>{u}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleSaveCusto(fi.insumo_id)}
                                    disabled={custoSaving}
                                    className="w-6 h-6 flex items-center justify-center rounded text-white text-xs font-bold disabled:opacity-60 hover:scale-110 transition-transform active:scale-95"
                                    style={{ backgroundColor: "#16A34A" }}
                                    title="Salvar"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => { setEditingCustoId(null); setCustoError(null); }}
                                    className="w-6 h-6 flex items-center justify-center rounded text-xs font-bold border border-gray-300 text-gray-600 hover:scale-110 transition-transform active:scale-95"
                                    title="Cancelar"
                                  >
                                    ✗
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span>
                                    R$ {custoUnit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    {custoUnidade ? ` / ${custoUnidade}` : ""}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingCustoId(fi.id);
                                      setEditingCustoValue(String(custoUnit));
                                      setEditingCustoUnidade(custoUnidade ?? fi.unidade);
                                      setCustoError(null);
                                    }}
                                    className="text-blue-400 hover:text-blue-600 transition leading-none"
                                    title="Editar custo unitário"
                                    style={{ fontSize: 14 }}
                                  >
                                    ✎
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-gray-700">
                              {custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-4">
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={() => openEditInsumo(fi)}
                              className="px-2 py-1 rounded text-white text-xs font-semibold hover:brightness-110 transition"
                              style={{ backgroundColor: "#1565C0" }}
                              title="Editar insumo"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => openRemoveInsumo(fi)}
                              title="Remover insumo"
                              className="btn-icon"
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
                    );
                  })}
                  {isAdmin && detail.formula_insumos.length > 0 && (() => {
                    const totalCusto = detail.formula_insumos.reduce((sum, fi) => {
                      const custoUnit = Number(fi.insumos?.custo_unitario ?? 0);
                      const custoUnidade = fi.insumos?.custo_unidade ?? null;
                      const qtdConvertida = custoUnidade ? convertToBase(fi.quantidade, fi.unidade, custoUnidade) : 0;
                      return sum + qtdConvertida * custoUnit;
                    }, 0);
                    return (
                      <tr className="table-row-hover" style={{ backgroundColor: "#E8F4FF", borderTop: "2px solid #1565C0" }}>
                        <td colSpan={4} className="px-4 py-3" style={{ fontWeight: 700, fontSize: 15, color: "#1A3A6B" }}>
                          CUSTO TOTAL DE PRODUÇÃO
                        </td>
                        <td className="px-4 py-3" style={{ fontWeight: 700, fontSize: 15, color: "#1A3A6B" }}>
                          R$ {totalCusto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            {custoError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-3">{custoError}</p>
            )}

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

      {/* ── Modal: Nova Fórmula ── */}
      {modal === "nova" && (
        <Modal title="Nova Fórmula" onClose={closeModal}>
          <FormulaFormFields
            form={form}
            setForm={setForm}
            autoSigla
            siglaManuallyEdited={siglaManuallyEdited}
            setSiglaManuallyEdited={setSiglaManuallyEdited}
          />
          <div className="mt-4 flex flex-col gap-3">
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleSaveNova}
              saveLabel={isPending ? "Salvando..." : "SALVAR"}
              disabled={isPending}
            />
          </div>
        </Modal>
      )}

      {/* ── Modal: Editar Fórmula ── */}
      {modal === "editar" && (
        <Modal title="Editar Fórmula" onClose={closeModal}>
          <FormulaFormFields form={form} setForm={setForm} />
          <div className="mt-4 flex flex-col gap-3">
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleSaveEditar}
              saveLabel={isPending ? "Salvando..." : "SALVAR"}
              disabled={isPending}
            />
          </div>
        </Modal>
      )}

      {/* ── Modal: Duplicar Fórmula ── */}
      {modal === "duplicar" && detail && (
        <Modal
          title="Duplicar Fórmula"
          onClose={closeModal}
          contentStyle={{ maxHeight: "90vh", overflowY: "auto" }}
        >
          <div className="flex flex-col gap-4">
            <p style={{ fontSize: 14, color: "#6B7A99" }}>
              A duplicar: <strong>{detail.nome}</strong>
            </p>
            <Field label="Nome da nova fórmula *">
              <input
                className={inputCls}
                value={dupNome}
                onChange={(e) => {
                  const value = e.target.value;
                  setDupNome(value);
                  if (!dupSiglaManuallyEdited) {
                    setDupSigla(generateSigla(value));
                  }
                }}
                placeholder="Nome da nova fórmula"
              />
            </Field>
            <Field label="Sigla * (máx. 6 caracteres)">
              <input
                className={inputCls}
                value={dupSigla}
                onChange={(e) => {
                  setDupSigla(e.target.value.toUpperCase().slice(0, 6));
                  setDupSiglaManuallyEdited(true);
                }}
                placeholder="Ex: DET01"
                maxLength={6}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "#1A3A6B" }}>
                Insumos
              </label>
              {duplicarInsumos.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: "#F0F7FF" }}>
                        <th className="text-left px-3 py-2" style={{ fontSize: 12, color: "#1A3A6B" }}>
                          Insumo
                        </th>
                        <th className="text-left px-3 py-2" style={{ fontSize: 12, color: "#1A3A6B" }}>
                          Quantidade
                        </th>
                        <th className="text-left px-3 py-2" style={{ fontSize: 12, color: "#1A3A6B" }}>
                          Unidade
                        </th>
                        <th className="text-left px-3 py-2" style={{ fontSize: 12, color: "#1A3A6B" }}>
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicarInsumos.map((row, idx) => {
                        const highlight = isFraganciaInsumo(row.insumo_nome);
                        return (
                          <tr
                            key={row.isNew ? `novo-${idx}` : row.insumo_id}
                            style={{
                              backgroundColor: highlight ? "#E8F0FE" : idx % 2 === 0 ? "#FAFBFF" : "#ffffff",
                            }}
                          >
                            <td
                              className="px-3 py-2"
                              style={{ color: highlight ? "#1565C0" : "#374151", fontWeight: highlight ? 700 : 400 }}
                            >
                              <select
                                className="border border-gray-200 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={row.insumo_id}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  const ins = insumosList.find((i) => i.id === id);
                                  setDuplicarInsumos((prev) =>
                                    prev.map((r, i) =>
                                      i === idx
                                        ? { ...r, insumo_id: id, insumo_nome: ins?.nome ?? "", unidade: ins?.unidade ?? r.unidade }
                                        : r
                                    )
                                  );
                                }}
                              >
                                {row.isNew && <option value="">Selecione...</option>}
                                {insumosList.map((ins) => (
                                  <option key={ins.id} value={ins.id}>
                                    {ins.nome}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                className="border border-gray-200 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={highlight ? { borderColor: "#1565C0" } : undefined}
                                type="text"
                                inputMode="numeric"
                                value={row.quantidade}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDuplicarInsumos((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, quantidade: value } : r))
                                  );
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              <select
                                className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={row.unidade}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDuplicarInsumos((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, unidade: value } : r))
                                  );
                                }}
                              >
                                {getUnidadesCompativeis(
                                  insumosList.find((i) => i.id === row.insumo_id)?.unidade ?? row.unidade
                                ).map((u) => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => removeDuplicarRow(idx)}
                                title="Remover insumo"
                                className="w-6 h-6 flex items-center justify-center rounded text-white hover:scale-110 transition-transform active:scale-95"
                                style={{ backgroundColor: "#C62828" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                onClick={addDuplicarRow}
                disabled={insumosLoading || insumosList.length === 0}
                className="self-start px-3 py-1 rounded border border-blue-300 text-xs font-semibold hover:bg-blue-50 transition disabled:opacity-60"
                style={{ color: "#1565C0" }}
              >
                + Adicionar Insumo
              </button>
            </div>
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleSaveDuplicar}
              saveLabel={dupSaving ? "Duplicando..." : "DUPLICAR"}
              disabled={dupSaving}
            />
          </div>
        </Modal>
      )}

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
                    {getUnidadesCompativeis(
                      insumosList.find((i) => i.id === selInsumoId)?.unidade ?? ""
                    ).map((u) => (
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

      {/* ── Modal: Editar Insumo da Fórmula ── */}
      {modal === "editInsumo" && targetInsumo && (
        <Modal title="Editar Insumo da Fórmula" onClose={closeModal}>
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
                {getUnidadesCompativeis(targetInsumo.insumos?.unidade ?? "").map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="PIN de confirmação">
              <input
                className={inputCls}
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
              />
              {pinError && (
                <p className="text-sm text-red-600">{pinError}</p>
              )}
            </Field>
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleEditInsumo}
              saveLabel="SALVAR"
              disabled={isPending}
            />
          </div>
        </Modal>
      )}

      {/* ── Modal: Remover Insumo da Fórmula ── */}
      {modal === "removeInsumo" && targetInsumo && (
        <Modal title="Remover Insumo da Fórmula" onClose={closeModal} danger>
          <div className="flex flex-col gap-4">
            <p style={{ fontSize: 15, color: "#1A1A1A", fontWeight: 500 }}>
              Tem certeza que deseja remover{" "}
              <strong>{targetInsumo.insumos?.nome ?? "este insumo"}</strong> da
              fórmula?
            </p>
            <Field label="PIN de confirmação">
              <input
                className={inputCls}
                style={{ border: "2px solid #E53935" }}
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
              />
              {pinError && (
                <p className="text-sm text-red-600">{pinError}</p>
              )}
            </Field>
            <ErrorMsg msg={modalError} />
            <ModalActions
              onCancel={closeModal}
              onSave={handleRemoveInsumoConfirm}
              saveLabel="REMOVER"
              saveColor="#C62828"
              disabled={isPending}
            />
          </div>
        </Modal>
      )}

      {/* ── Modal: Confirmar Exclusão ── */}
      {modal === "excluir" && detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={28}
                  color="#C62828"
                  className="flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <h2
                    className="font-bold text-lg mb-1"
                    style={{ color: "#B71C1C" }}
                  >
                    Confirmar Exclusão
                  </h2>
                  <p style={{ fontSize: 15, color: "#1A1A1A", fontWeight: 500 }}>
                    Tem certeza que deseja excluir a fórmula{" "}
                    <strong>{detail.nome}</strong>? Esta ação não pode ser
                    desfeita.
                  </p>
                </div>
              </div>
              <ErrorMsg msg={modalError} />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                  style={{ backgroundColor: "#C62828", boxShadow: "0 4px 16px rgba(198,40,40,0.4)" }}
                >
                  {isPending ? "Excluindo..." : "EXCLUIR"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formula form fields (shared between Nova and Editar) ──────────────────────

type FormState = {
  nome: string;
  sigla: string;
  rendimento: string;
  rendimento_unidade: string;
  obs: string;
};

function FormulaFormFields({
  form,
  setForm,
  autoSigla,
  siglaManuallyEdited,
  setSiglaManuallyEdited,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  autoSigla?: boolean;
  siglaManuallyEdited?: boolean;
  setSiglaManuallyEdited?: (value: boolean) => void;
}) {
  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleNomeChange(value: string) {
    setForm((prev) => {
      const next = { ...prev, nome: value };
      if (autoSigla && !siglaManuallyEdited) {
        next.sigla = generateSigla(value);
      }
      return next;
    });
    if (autoSigla && !value.trim()) {
      setSiglaManuallyEdited?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome *">
        <input
          className={inputCls}
          value={form.nome}
          onChange={(e) => handleNomeChange(e.target.value)}
          placeholder="Nome da fórmula"
        />
      </Field>
      <Field label="Sigla * (máx. 6 caracteres)">
        <input
          className={inputCls}
          value={form.sigla}
          onChange={(e) => {
            set("sigla", e.target.value.toUpperCase().slice(0, 6));
            if (autoSigla) setSiglaManuallyEdited?.(true);
          }}
          placeholder="Ex: DET01"
          maxLength={6}
        />
      </Field>
      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Rendimento *">
            <input
              className={inputCls}
              type="number"
              min="0.001"
              step="any"
              value={form.rendimento}
              onChange={(e) => set("rendimento", e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <div className="w-28">
          <Field label="Unidade *">
            <select
              className={inputCls}
              value={form.rendimento_unidade}
              onChange={(e) => set("rendimento_unidade", e.target.value)}
            >
              {RENDIMENTO_UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <Field label="Observação">
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          value={form.obs}
          onChange={(e) => set("obs", e.target.value)}
          placeholder="Opcional"
        />
      </Field>
    </div>
  );
}
