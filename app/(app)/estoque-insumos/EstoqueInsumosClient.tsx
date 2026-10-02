"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  createInsumo,
  novaEntrada,
  atualizarEstoque,
  updateInsumo,
  deleteInsumo,
  getMovimentos,
  getInsumos,
  getInsumosAbaixoMinimo,
  type InsumoWithFlag,
  type Movimento,
} from "@/app/actions/insumos";

type ModalType = null | "novo" | "entrada" | "atualizacao" | "historico" | "editar" | "excluir" | "relatorio";
type TabType = "producao" | "material";

const TABS: { key: TabType; label: string }[] = [
  { key: "producao", label: "Insumos de Produção" },
  { key: "material", label: "Materiais & EPI" },
];

const today = () => new Date().toISOString().split("T")[0];

// ─── Warning icon (inline SVG, no external lib) ──────────────────────────────
function WarnIcon() {
  return (
    <svg
      className="inline-block w-4 h-4 mr-1 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────
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
        className="bg-white w-full max-w-md"
        style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: "#1565C0", borderRadius: "12px 12px 0 0" }}
        >
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-white opacity-70 hover:opacity-100 text-2xl leading-none cursor-pointer"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function EstoqueInsumosClient({
  initialInsumos,
  isAdmin,
}: {
  initialInsumos: InsumoWithFlag[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [insumos, setInsumos] = useState<InsumoWithFlag[]>(initialInsumos);
  const [activeTab, setActiveTab] = useState<TabType>("producao");
  const [loadingTab, setLoadingTab] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [selected, setSelected] = useState<InsumoWithFlag | null>(null);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loadingMovimentos, setLoadingMovimentos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [relatorio, setRelatorio] = useState<{
    producao: InsumoWithFlag[];
    material: InsumoWithFlag[];
  } | null>(null);
  const [relatorioLoading, setRelatorioLoading] = useState(false);
  const [relatorioError, setRelatorioError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handleTabChange(tab: TabType, force = false) {
    if (tab === activeTab && !force) return;
    setActiveTab(tab);
    setLoadingTab(true);
    try {
      const data = await getInsumos(tab);
      setInsumos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar insumos.");
    } finally {
      setLoadingTab(false);
    }
  }

  // ── Form state: Novo Insumo ──
  const [novoNome, setNovoNome] = useState("");
  const [novoUnidade, setNovoUnidade] = useState("KG");
  const [novoEstoqueAtual, setNovoEstoqueAtual] = useState("");
  const [novoEstoqueSeguranca, setNovoEstoqueSeguranca] = useState("");
  const [novoCustoUnitario, setNovoCustoUnitario] = useState("");
  const [novoCustoUnidade, setNovoCustoUnidade] = useState("KG");

  // ── Form state: Entrada ──
  const [entradaQtd, setEntradaQtd] = useState("");
  const [entradaData, setEntradaData] = useState(today());
  const [entradaObs, setEntradaObs] = useState("");

  // ── Form state: Atualização ──
  const [atuQtd, setAtuQtd] = useState("");
  const [atuData, setAtuData] = useState(today());
  const [atuObs, setAtuObs] = useState("");

  // ── Form state: Editar Insumo ──
  const [editNome, setEditNome] = useState("");
  const [editUnidade, setEditUnidade] = useState("KG");
  const [editEstoqueSeguranca, setEditEstoqueSeguranca] = useState("");
  const [editCustoUnitario, setEditCustoUnitario] = useState("");
  const [editCustoUnidade, setEditCustoUnidade] = useState("KG");

  // ── PIN confirmation (Editar / Excluir) ──
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  function closeModal() {
    setModal(null);
    setSelected(null);
    setError(null);
    setNovoNome("");
    setNovoUnidade("KG");
    setNovoEstoqueAtual("");
    setNovoEstoqueSeguranca("");
    setNovoCustoUnitario("");
    setNovoCustoUnidade("KG");
    setEntradaQtd("");
    setEntradaData(today());
    setEntradaObs("");
    setAtuQtd("");
    setAtuData(today());
    setAtuObs("");
    setEditNome("");
    setEditUnidade("KG");
    setEditEstoqueSeguranca("");
    setEditCustoUnitario("");
    setEditCustoUnidade("KG");
    setPin("");
    setPinError(null);
    setMovimentos([]);
    setRelatorio(null);
    setRelatorioError(null);
  }

  function openEntrada(insumo: InsumoWithFlag) {
    setSelected(insumo);
    setEntradaQtd("");
    setEntradaData(today());
    setEntradaObs("");
    setError(null);
    setModal("entrada");
  }

  function openAtualizacao(insumo: InsumoWithFlag) {
    setSelected(insumo);
    setAtuQtd(String(insumo.estoque_atual));
    setAtuData(today());
    setAtuObs("");
    setError(null);
    setModal("atualizacao");
  }

  function openEditar(insumo: InsumoWithFlag) {
    setSelected(insumo);
    setEditNome(insumo.nome);
    setEditUnidade(insumo.unidade);
    setEditEstoqueSeguranca(String(insumo.estoque_seguranca));
    setEditCustoUnitario(insumo.custo_unitario != null ? String(insumo.custo_unitario) : "");
    setEditCustoUnidade(insumo.custo_unidade ?? "KG");
    setPin("");
    setPinError(null);
    setError(null);
    setModal("editar");
  }

  function openExcluir(insumo: InsumoWithFlag) {
    setSelected(insumo);
    setPin("");
    setPinError(null);
    setError(null);
    setModal("excluir");
  }

  async function openHistorico(insumo: InsumoWithFlag) {
    setSelected(insumo);
    setModal("historico");
    setLoadingMovimentos(true);
    setMovimentos([]);
    try {
      const data = await getMovimentos(insumo.id);
      setMovimentos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao buscar histórico.");
    } finally {
      setLoadingMovimentos(false);
    }
  }

  async function openRelatorio() {
    setModal("relatorio");
    setRelatorioLoading(true);
    setRelatorioError(null);
    setRelatorio(null);
    try {
      const data = await getInsumosAbaixoMinimo();
      setRelatorio(data);
    } catch (e) {
      setRelatorioError(e instanceof Error ? e.message : "Erro ao gerar relatório.");
    } finally {
      setRelatorioLoading(false);
    }
  }

  function buildRelatorioLines(items: InsumoWithFlag[]): string[] {
    return items.map(
      (ins) =>
        `${ins.nome}: ${ins.estoque_atual} ${ins.unidade} (mín: ${ins.estoque_seguranca} ${ins.unidade})`
    );
  }

  function buildRelatorioText(): string {
    const header = `ESTOQUE BAIXO — Ibilimp\nData: ${formatDate(today())}`;
    const producaoLines = relatorio ? buildRelatorioLines(relatorio.producao) : [];
    const materialLines = relatorio ? buildRelatorioLines(relatorio.material) : [];
    const producaoBlock =
      producaoLines.length > 0
        ? producaoLines.map((l) => `• ${l}`).join("\n")
        : "Todos em estoque normal ✓";
    const materialBlock =
      materialLines.length > 0
        ? materialLines.map((l) => `• ${l}`).join("\n")
        : "Todos em estoque normal ✓";
    return `${header}\n\nINSUMOS DE PRODUÇÃO:\n${producaoBlock}\n\nMATERIAIS & EPI:\n${materialBlock}`;
  }

  async function handleBaixarRelatorioPdf() {
    if (!relatorio) return;
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.setTextColor(26, 58, 107);
      doc.text("ESTOQUE BAIXO — Ibilimp", 20, 20);

      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.text(`Data: ${formatDate(today())}`, 20, 30);

      doc.setDrawColor(21, 101, 192);
      doc.line(20, 34, 190, 34);

      let y = 44;
      doc.setFontSize(12);
      doc.setTextColor(21, 101, 192);
      doc.text("INSUMOS DE PRODUÇÃO:", 20, y);
      y += 8;

      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      const producaoLines = buildRelatorioLines(relatorio.producao);
      if (producaoLines.length === 0) {
        doc.setTextColor(27, 94, 32);
        doc.text("Todos em estoque normal ✓", 20, y);
        doc.setTextColor(30, 30, 30);
        y += 8;
      } else {
        producaoLines.forEach((line) => {
          doc.text(`• ${line}`, 20, y);
          y += 7;
        });
      }

      y += 6;
      doc.setFontSize(12);
      doc.setTextColor(21, 101, 192);
      doc.text("MATERIAIS & EPI:", 20, y);
      y += 8;

      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      const materialLines = buildRelatorioLines(relatorio.material);
      if (materialLines.length === 0) {
        doc.setTextColor(27, 94, 32);
        doc.text("Todos em estoque normal ✓", 20, y);
        doc.setTextColor(30, 30, 30);
        y += 8;
      } else {
        materialLines.forEach((line) => {
          doc.text(`• ${line}`, 20, y);
          y += 7;
        });
      }

      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text("Ibisist - Sistema de Gestão Ibilimp", 20, pageHeight - 10);

      doc.save(`estoque-baixo-${today()}.pdf`);
    } catch (e) {
      setRelatorioError(e instanceof Error ? e.message : "Erro ao gerar PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  function handleRelatorioWhatsapp() {
    const text = buildRelatorioText();
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  }

  function refreshInsumos() {
    startTransition(() => {
      router.refresh();
    });
  }

  // ── Save: Novo Insumo ──
  async function handleSaveNovo() {
    setError(null);
    if (!novoNome.trim()) return setError("Nome é obrigatório.");
    const atual = parseFloat(novoEstoqueAtual);
    const seg = parseFloat(novoEstoqueSeguranca);
    if (isNaN(atual) || isNaN(seg)) return setError("Estoque deve ser numérico.");
    const custoRaw = novoCustoUnitario.trim().replace(",", ".");
    const custo = custoRaw ? parseFloat(custoRaw) : 0;
    if (isNaN(custo) || custo < 0) return setError("Custo unitário inválido.");
    try {
      await createInsumo({
        nome: novoNome.trim(),
        unidade: novoUnidade,
        estoque_atual: atual,
        estoque_seguranca: seg,
        custo_unitario: custo,
        custo_unidade: novoCustoUnidade,
        tipo: activeTab,
      });
      const novoItem: InsumoWithFlag = {
        id: crypto.randomUUID(),
        created_at: null,
        nome: novoNome.trim(),
        unidade: novoUnidade,
        estoque_atual: atual,
        estoque_seguranca: seg,
        custo_unitario: custo,
        custo_unidade: novoCustoUnidade,
        tipo: activeTab,
        estoque_baixo: atual < seg,
      };
      setInsumos((prev) =>
        [...prev, novoItem].sort((a, b) => a.nome.localeCompare(b.nome))
      );
      closeModal();
      refreshInsumos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  // ── Save: Nova Entrada ──
  async function handleSaveEntrada() {
    setError(null);
    if (!selected) return;
    const qtd = parseFloat(entradaQtd);
    if (isNaN(qtd) || qtd <= 0) return setError("Quantidade deve ser positiva.");
    try {
      await novaEntrada(selected.id, qtd, entradaData, entradaObs || undefined);
      const novoAtual = selected.estoque_atual + qtd;
      setInsumos((prev) =>
        prev.map((ins) =>
          ins.id === selected.id
            ? {
                ...ins,
                estoque_atual: novoAtual,
                estoque_baixo: novoAtual < ins.estoque_seguranca,
              }
            : ins
        )
      );
      closeModal();
      refreshInsumos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  // ── Save: Atualização ──
  async function handleSaveAtualizacao() {
    setError(null);
    if (!selected) return;
    const qtd = parseFloat(atuQtd);
    if (isNaN(qtd) || qtd < 0) return setError("Quantidade deve ser válida.");
    try {
      await atualizarEstoque(selected.id, qtd, atuData, atuObs || undefined);
      setInsumos((prev) =>
        prev.map((ins) =>
          ins.id === selected.id
            ? {
                ...ins,
                estoque_atual: qtd,
                estoque_baixo: qtd < ins.estoque_seguranca,
              }
            : ins
        )
      );
      closeModal();
      refreshInsumos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  // ── Save: Editar Insumo ──
  async function handleSaveEditar() {
    setError(null);
    setPinError(null);
    if (!selected) return;
    if (pin !== "1234") return setPinError("PIN incorreto");
    if (!editNome.trim()) return setError("Nome é obrigatório.");
    const seg = parseFloat(editEstoqueSeguranca);
    if (isNaN(seg)) return setError("Estoque de segurança deve ser numérico.");
    const custoRaw = editCustoUnitario.trim().replace(",", ".");
    const custo = custoRaw ? parseFloat(custoRaw) : undefined;
    if (custoRaw && (custo === undefined || isNaN(custo) || custo < 0)) {
      return setError("Custo unitário inválido.");
    }
    try {
      await updateInsumo(
        selected.id,
        editNome.trim(),
        editUnidade,
        seg,
        custo,
        custo !== undefined ? editCustoUnidade : undefined
      );
      closeModal();
      await handleTabChange(activeTab, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  // ── Confirm: Excluir Insumo ──
  async function handleConfirmExcluir() {
    setError(null);
    setPinError(null);
    if (!selected) return;
    if (pin !== "1234") return setPinError("PIN incorreto");
    try {
      await deleteInsumo(selected.id);
      closeModal();
      await handleTabChange(activeTab, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#1A3A6B" }}>
          Estoque de Insumos
        </h1>
        <div className="flex gap-3">
          <button
            onClick={openRelatorio}
            className="px-4 py-2 rounded-lg text-white text-sm font-bold shadow hover:brightness-110 transition"
            style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
          >
            Relatório de Estoque Baixo
          </button>
          <button
            onClick={() => { setError(null); setModal("novo"); }}
            className="px-4 py-2 rounded-lg text-white text-sm font-bold shadow hover:brightness-110 transition"
            style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
          >
            + Novo Insumo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition"
              style={
                isActive
                  ? { backgroundColor: "#1565C0", color: "#ffffff", cursor: "pointer" }
                  : { border: "1px solid #E5E7EB", color: "#6B7280", cursor: "pointer" }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg shadow">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ backgroundColor: "#1565C0" }}>
              {["Insumo", "Unidade", "Estoque Atual", "Est. Segurança", ...(isAdmin ? ["Custo Unit. (R$)"] : []), "Ações"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left text-white font-bold px-4 py-4"
                    style={{ fontSize: 13 }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {loadingTab && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="text-center py-10 text-gray-400">
                  Carregando...
                </td>
              </tr>
            )}
            {!loadingTab && insumos.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="text-center py-10 text-gray-400">
                  Nenhum insumo cadastrado.
                </td>
              </tr>
            )}
            {!loadingTab &&
              insumos.map((ins, idx) => {
              const rowBg = ins.estoque_baixo
                ? "#FFF3CD"
                : idx % 2 === 0
                ? "#F0F7FF"
                : "#ffffff";
              return (
                <tr key={ins.id} style={{ backgroundColor: rowBg }}>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => openHistorico(ins)}
                      className="font-medium hover:underline text-left"
                      style={{ color: "#1565C0", cursor: "pointer" }}
                    >
                      {ins.estoque_baixo && (
                        <span style={{ color: "#F59E0B" }}>
                          <WarnIcon />
                        </span>
                      )}
                      {ins.nome}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-gray-700">{ins.unidade}</td>
                  <td className="px-4 py-4 font-semibold" style={{ color: ins.estoque_baixo ? "#856404" : "#1A3A6B" }}>
                    {ins.estoque_atual}
                  </td>
                  <td className="px-4 py-4 text-gray-700">{ins.estoque_seguranca}</td>
                  {isAdmin && (
                    <td className="px-4 py-4 text-gray-700">
                      {ins.custo_unitario != null
                        ? `R$ ${ins.custo_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                  )}
                  <td className="px-4 py-4 flex gap-2">
                    <button
                      onClick={() => openEntrada(ins)}
                      className="px-3 py-1 rounded-lg text-white text-xs font-semibold transition"
                      style={{ backgroundColor: "#16A34A", cursor: "pointer" }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#15803D")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#16A34A")}
                    >
                      Entrada
                    </button>
                    <button
                      onClick={() => openAtualizacao(ins)}
                      className="px-3 py-1 rounded-lg text-white text-xs font-semibold transition"
                      style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1248A0")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#1565C0")}
                    >
                      Atualizar
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => openEditar(ins)}
                        className="px-3 py-1 rounded-lg text-white text-xs font-semibold transition"
                        style={{ backgroundColor: "#1976D2", cursor: "pointer" }}
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1259A0")}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#1976D2")}
                      >
                        Editar
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => openExcluir(ins)}
                        title="Excluir insumo"
                        style={{
                          width: "32px",
                          height: "32px",
                          minWidth: "32px",
                          minHeight: "32px",
                          borderRadius: "50%",
                          backgroundColor: "#C62828",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0",
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Novo Insumo ── */}
      {modal === "novo" && (
        <Modal title="Novo Insumo" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <Field label="Nome *">
              <input
                className={inputCls}
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome do insumo"
              />
            </Field>
            <Field label="Unidade *">
              <select
                className={inputCls}
                value={novoUnidade}
                onChange={(e) => {
                  setNovoUnidade(e.target.value);
                  setNovoCustoUnidade(e.target.value);
                }}
              >
                {["KG", "L", "G", "ML", "PCT", "UN"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estoque Atual *">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                value={novoEstoqueAtual}
                onChange={(e) => setNovoEstoqueAtual(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Estoque de Segurança *">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                value={novoEstoqueSeguranca}
                onChange={(e) => setNovoEstoqueSeguranca(e.target.value)}
                placeholder="0"
              />
            </Field>
            {isAdmin && (
              <Field label="Custo Unitário (R$)">
                <input
                  className={inputCls}
                  type="text"
                  inputMode="decimal"
                  value={novoCustoUnitario}
                  onChange={(e) => setNovoCustoUnitario(e.target.value)}
                  placeholder="0,00"
                />
              </Field>
            )}
            {isAdmin && (
              <Field label="Unidade do Custo">
                <select
                  className={inputCls}
                  value={novoCustoUnidade}
                  onChange={(e) => setNovoCustoUnidade(e.target.value)}
                >
                  {["KG", "L", "G", "ML", "UN", "PCT"].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveNovo}
                disabled={isPending}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
              >
                {isPending ? "Salvando..." : "SALVAR"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Nova Entrada ── */}
      {modal === "entrada" && selected && (
        <Modal title="Nova Entrada" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <div
              className="rounded px-4 py-3 text-sm"
              style={{ backgroundColor: "#E8F4FF" }}
            >
              <p className="font-semibold" style={{ color: "#1A3A6B" }}>
                {selected.nome}
              </p>
              <p className="text-gray-600 mt-0.5">
                Estoque atual:{" "}
                <span className="font-medium">{selected.estoque_atual} {selected.unidade}</span>
              </p>
            </div>
            <Field label="Quantidade *">
              <input
                className={inputCls}
                type="number"
                min="0.001"
                step="any"
                value={entradaQtd}
                onChange={(e) => setEntradaQtd(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Data *">
              <input
                className={inputCls}
                type="date"
                value={entradaData}
                onChange={(e) => setEntradaData(e.target.value)}
              />
            </Field>
            <Field label="Observação">
              <input
                className={inputCls}
                value={entradaObs}
                onChange={(e) => setEntradaObs(e.target.value)}
                placeholder="Opcional"
              />
            </Field>
            {entradaQtd && !isNaN(parseFloat(entradaQtd)) && (
              <div
                className="rounded px-4 py-2 text-sm"
                style={{ backgroundColor: "#E8F5E9" }}
              >
                <span style={{ color: "#1B5E20" }}>
                  Novo total:{" "}
                  <strong>
                    {(selected.estoque_atual + parseFloat(entradaQtd)).toFixed(
                      2
                    )}{" "}
                    {selected.unidade}
                  </strong>
                </span>
              </div>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveEntrada}
                disabled={isPending}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#2E7D32", cursor: "pointer" }}
              >
                {isPending ? "Salvando..." : "SALVAR"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Atualização ── */}
      {modal === "atualizacao" && selected && (
        <Modal title="Atualização de Estoque" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <div
              className="rounded px-4 py-3 text-sm"
              style={{ backgroundColor: "#E8F4FF" }}
            >
              <p className="font-semibold" style={{ color: "#1A3A6B" }}>
                {selected.nome}
              </p>
              <p className="text-gray-600 mt-0.5">
                Estoque atual:{" "}
                <span className="font-medium">{selected.estoque_atual} {selected.unidade}</span>
              </p>
            </div>
            <Field label="Quantidade Nova *">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                value={atuQtd}
                onChange={(e) => setAtuQtd(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Data *">
              <input
                className={inputCls}
                type="date"
                value={atuData}
                onChange={(e) => setAtuData(e.target.value)}
              />
            </Field>
            <Field label="Observação">
              <input
                className={inputCls}
                value={atuObs}
                onChange={(e) => setAtuObs(e.target.value)}
                placeholder="Opcional"
              />
            </Field>
            {atuQtd && !isNaN(parseFloat(atuQtd)) && (
              <div
                className="rounded px-4 py-2 text-sm"
                style={{ backgroundColor: "#FFF8E1" }}
              >
                <span style={{ color: "#E65100" }}>
                  Estoque será atualizado para{" "}
                  <strong>
                    {parseFloat(atuQtd).toFixed(2)} {selected.unidade}
                  </strong>
                </span>
              </div>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveAtualizacao}
                disabled={isPending}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
              >
                {isPending ? "Salvando..." : "SALVAR"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Editar Insumo ── */}
      {modal === "editar" && selected && (
        <Modal title="Editar Insumo" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <Field label="Nome *">
              <input
                className={inputCls}
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                placeholder="Nome do insumo"
              />
            </Field>
            <Field label="Unidade *">
              <select
                className={inputCls}
                value={editUnidade}
                onChange={(e) => setEditUnidade(e.target.value)}
              >
                {["KG", "L", "G", "ML", "PCT", "UN"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estoque de Segurança *">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="any"
                value={editEstoqueSeguranca}
                onChange={(e) => setEditEstoqueSeguranca(e.target.value)}
                placeholder="0"
              />
            </Field>
            {isAdmin && (
              <Field label="Custo Unitário (R$)">
                <input
                  className={inputCls}
                  type="text"
                  inputMode="decimal"
                  value={editCustoUnitario}
                  onChange={(e) => setEditCustoUnitario(e.target.value)}
                  placeholder="0,00"
                />
              </Field>
            )}
            {isAdmin && (
              <Field label="Unidade do Custo">
                <select
                  className={inputCls}
                  value={editCustoUnidade}
                  onChange={(e) => setEditCustoUnidade(e.target.value)}
                >
                  {["KG", "L", "G", "ML", "UN", "PCT"].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>
            )}
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
                <p className="text-sm text-red-600 mt-1">{pinError}</p>
              )}
            </Field>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveEditar}
                disabled={isPending}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
              >
                {isPending ? "Salvando..." : "SALVAR"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Excluir Insumo ── */}
      {modal === "excluir" && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl flex-shrink-0 mt-0.5" aria-hidden="true">
                  ⚠️
                </span>
                <div>
                  <h2 className="font-bold text-lg mb-1" style={{ color: "#B71C1C" }}>
                    Excluir Insumo
                  </h2>
                  <p className="text-sm text-gray-700">
                    Tem certeza que deseja excluir{" "}
                    <strong>{selected.nome}</strong>? Esta ação não pode ser
                    desfeita.
                  </p>
                </div>
              </div>
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
                  <p className="text-sm text-red-600 mt-1">{pinError}</p>
                )}
              </Field>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-2 justify-end">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleConfirmExcluir}
                  disabled={isPending}
                  className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                  style={{ backgroundColor: "#C62828", cursor: "pointer" }}
                >
                  {isPending ? "Excluindo..." : "EXCLUIR"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Histórico ── */}
      {modal === "historico" && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <div
            className="bg-white w-full max-w-lg flex flex-col max-h-[80vh]"
            style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ backgroundColor: "#1565C0", borderRadius: "12px 12px 0 0" }}
            >
              <h2 className="text-white font-semibold text-lg">
                Histórico — {selected.nome}
              </h2>
              <button
                onClick={closeModal}
                className="text-white opacity-70 hover:opacity-100 text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {loadingMovimentos && (
                <p className="text-center text-gray-400 py-8">Carregando...</p>
              )}
              {!loadingMovimentos && movimentos.length === 0 && (
                <p className="text-center text-gray-400 py-8">
                  Nenhum movimento registrado.
                </p>
              )}
              {!loadingMovimentos && movimentos.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {movimentos.map((mov) => (
                    <li
                      key={mov.id}
                      className="flex items-start gap-3 border-b border-gray-100 pb-3"
                    >
                      <TipoBadge tipo={mov.tipo} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {mov.quantidade} {selected.unidade}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(mov.data)}
                        </p>
                        {mov.obs && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {mov.obs}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mt-2">
                  {error}
                </p>
              )}
            </div>
            <div className="px-6 py-4 flex justify-end border-t border-gray-100 flex-shrink-0">
              <button
                onClick={closeModal}
                className="px-5 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Relatório de Estoque Baixo ── */}
      {modal === "relatorio" && (
        <Modal title="Relatório de Estoque Baixo" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            {relatorioLoading && (
              <p className="text-center text-gray-400 py-8">Carregando...</p>
            )}
            {relatorioError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {relatorioError}
              </p>
            )}
            {!relatorioLoading && relatorio && (
              <>
                <p className="text-sm text-gray-500">
                  Data: <strong>{formatDate(today())}</strong>
                </p>

                <div>
                  <p className="font-semibold text-sm mb-1" style={{ color: "#1A3A6B" }}>
                    Insumos de Produção:
                  </p>
                  {relatorio.producao.length === 0 ? (
                    <p className="text-sm font-medium" style={{ color: "#1B5E20" }}>
                      Todos em estoque normal ✓
                    </p>
                  ) : (
                    <ul className="text-sm text-gray-700 flex flex-col gap-1">
                      {relatorio.producao.map((ins) => (
                        <li key={ins.id}>
                          • {ins.nome}: {ins.estoque_atual} {ins.unidade} (mín: {ins.estoque_seguranca} {ins.unidade})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="font-semibold text-sm mb-1" style={{ color: "#1A3A6B" }}>
                    Materiais & EPI:
                  </p>
                  {relatorio.material.length === 0 ? (
                    <p className="text-sm font-medium" style={{ color: "#1B5E20" }}>
                      Todos em estoque normal ✓
                    </p>
                  ) : (
                    <ul className="text-sm text-gray-700 flex flex-col gap-1">
                      {relatorio.material.map((ins) => (
                        <li key={ins.id}>
                          • {ins.nome}: {ins.estoque_atual} {ins.unidade} (mín: {ins.estoque_seguranca} {ins.unidade})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-3 pt-2 justify-end flex-wrap">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition cursor-pointer"
              >
                FECHAR
              </button>
              <button
                onClick={handleRelatorioWhatsapp}
                disabled={!relatorio}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#25D366", cursor: "pointer" }}
              >
                WHATSAPP
              </button>
              <button
                onClick={handleBaixarRelatorioPdf}
                disabled={!relatorio || pdfLoading}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
              >
                {pdfLoading ? "Gerando..." : "BAIXAR PDF"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    entrada: { bg: "#E8F5E9", text: "#1B5E20", label: "Entrada" },
    ajuste: { bg: "#E3F2FD", text: "#0D47A1", label: "Ajuste" },
    saida: { bg: "#FFEBEE", text: "#B71C1C", label: "Saída" },
  };
  const s = styles[tipo] ?? { bg: "#F5F5F5", text: "#424242", label: tipo };
  return (
    <span
      className="mt-0.5 inline-block px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
