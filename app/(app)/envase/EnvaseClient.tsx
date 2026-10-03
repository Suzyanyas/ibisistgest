"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getEnvaseByLote,
  saveEnvase,
  concluirEnvase,
  getHistoricoEnvases,
  getLoteInsumos,
  getEstoqueEmbalagens,
  getEmbalagensDisponiveisEnvase,
  type LoteEnvaseWithFormula,
  type EnvaseRow,
  type HistoricoEnvaseItem,
  type LoteInsumoItem,
  type EstoqueEmbalagemItem,
  type EmbalagensDisponiveisEnvase,
  type EmbalagemSelecoes,
} from "@/app/actions/envase";

const TAMANHOS = ["1L", "2L", "5L", "20L"] as const;

const TAMANHO_PARA_CATEGORIA_GARRAFA: Record<string, keyof EmbalagensDisponiveisEnvase> = {
  "1L": "garrafa_1l",
  "2L": "garrafa_2l",
  "5L": "garrafa_5l",
  "20L": "garrafa_20l",
};

type EmbalagemTamanhoState = {
  garrafa_id: string | null;
  tampa_id: string | null;
  alca_id: string | null;
};

const EMBALAGEM_STATE_VAZIO: EmbalagemTamanhoState = {
  garrafa_id: null,
  tampa_id: null,
  alca_id: null,
};

const selectCls =
  "border border-gray-200 rounded-lg px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-600";

function formatDataEnvase(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function nowStr() {
  return new Date().toISOString().slice(0, 16);
}

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const inputCls =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 w-full";

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

export default function EnvaseClient({
  initialLotes,
  isAdmin,
}: {
  initialLotes: LoteEnvaseWithFormula[];
  isAdmin: boolean;
}) {
  const searchParams = useSearchParams();
  const [lotes, setLotes] = useState<LoteEnvaseWithFormula[]>(initialLotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  const [activeTab, setActiveTab] = useState<"em_curso" | "historico">("em_curso");
  const [historico, setHistorico] = useState<HistoricoEnvaseItem[] | null>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoError, setHistoricoError] = useState<string | null>(null);

  useEffect(() => {
    const loteId = searchParams.get("lote_id");
    if (loteId && initialLotes.some((l) => l.id === loteId)) {
      setSelectedId(loteId);
      setMobileSidebarOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [qtd1l, setQtd1l] = useState(0);
  const [qtd2l, setQtd2l] = useState(0);
  const [qtd5l, setQtd5l] = useState(0);
  const [qtd20l, setQtd20l] = useState(0);
  const [dataEnvase, setDataEnvase] = useState(nowStr());

  const [estoqueEmbalagens, setEstoqueEmbalagens] = useState<Record<string, EstoqueEmbalagemItem>>({});

  const [embalagensDisponiveis, setEmbalagensDisponiveis] = useState<EmbalagensDisponiveisEnvase | null>(null);
  const [embalagemState, setEmbalagemState] = useState<Record<string, EmbalagemTamanhoState>>(() => {
    const initial: Record<string, EmbalagemTamanhoState> = {};
    for (const t of TAMANHOS) initial[t] = { ...EMBALAGEM_STATE_VAZIO };
    return initial;
  });

  useEffect(() => {
    getEmbalagensDisponiveisEnvase()
      .then(setEmbalagensDisponiveis)
      .catch(() => setEmbalagensDisponiveis(null));
  }, []);

  const [insumosOpen, setInsumosOpen] = useState(false);
  const [insumosCache, setInsumosCache] = useState<Record<string, LoteInsumoItem[]>>({});
  const [insumosLoading, setInsumosLoading] = useState(false);

  const [formLoading, setFormLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [concluirLoading, setConcluirLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [showConfirmConcluir, setShowConfirmConcluir] = useState(false);

  const selectedLote = lotes.find((l) => l.id === selectedId) ?? null;

  const resetForm = useCallback(() => {
    setQtd1l(0);
    setQtd2l(0);
    setQtd5l(0);
    setQtd20l(0);
    setDataEnvase(nowStr());
    setSuccessMsg(null);
    setErrorMsg(null);
    setHasSaved(false);
    setEstoqueEmbalagens({});
    setEmbalagemState(() => {
      const initial: Record<string, EmbalagemTamanhoState> = {};
      for (const t of TAMANHOS) initial[t] = { ...EMBALAGEM_STATE_VAZIO };
      return initial;
    });
  }, []);

  const loadEnvase = useCallback(
    async (lote_id: string) => {
      setFormLoading(true);
      resetForm();
      try {
        const [existing, estoque] = await Promise.all([
          getEnvaseByLote(lote_id),
          getEstoqueEmbalagens(),
        ]);
        if (existing) {
          setQtd1l(existing.qtd_1l ?? 0);
          setQtd2l(existing.qtd_2l ?? 0);
          setQtd5l(existing.qtd_5l ?? 0);
          setQtd20l(existing.qtd_20l ?? 0);
          setDataEnvase(existing.data_envase ? existing.data_envase.slice(0, 16) : nowStr());
        }
        const byTamanho: Record<string, EstoqueEmbalagemItem> = {};
        for (const item of estoque) byTamanho[item.tamanho] = item;
        setEstoqueEmbalagens(byTamanho);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Erro ao carregar envase.");
      } finally {
        setFormLoading(false);
      }
    },
    [resetForm]
  );

  useEffect(() => {
    setInsumosOpen(false);
    if (selectedId) {
      loadEnvase(selectedId);
    } else {
      resetForm();
    }
  }, [selectedId, loadEnvase, resetForm]);

  async function handleSave() {
    if (!selectedId) return;
    setErrorMsg(null);
    setSaveLoading(true);
    try {
      await saveEnvase(selectedId, qtd1l, qtd2l, qtd5l, qtd20l, dataEnvase);
      setHasSaved(true);
      setSuccessMsg("Envase salvo!");
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleConcluir() {
    if (!selectedId) return;
    setErrorMsg(null);
    setConcluirLoading(true);
    try {
      await concluirEnvase(selectedId, embalagemState as EmbalagemSelecoes);
      setLotes((prev) => prev.filter((l) => l.id !== selectedId));
      setSelectedId(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao concluir lote.");
    } finally {
      setConcluirLoading(false);
    }
  }

  async function generateEtiquetasPDF() {
    if (!selectedLote) return;
    const { default: jsPDF } = await import("jspdf");
    const JsBarcode = (await import("jsbarcode")).default;

    const produtoNome = selectedLote.formulas?.nome ?? "—";
    const numeroLote = selectedLote.numero_lote;
    const fragancia = selectedLote.fragancia;

    const dataProducao = new Date(selectedLote.data_producao);
    const dataValidade = new Date(dataProducao);
    dataValidade.setMonth(dataValidade.getMonth() + 18);
    const fabStr = formatDateDDMMYYYY(dataProducao);
    const valStr = formatDateDDMMYYYY(dataValidade);

    const tamanhos: { label: string; qtd: number }[] = [
      { label: "1L", qtd: qtd1l },
      { label: "2L", qtd: qtd2l },
      { label: "5L", qtd: qtd5l },
      { label: "20L", qtd: qtd20l },
    ];

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [80, 20] });
    let firstPage = true;

    function truncateToWidth(text: string, maxWidth: number): string {
      if (doc.getTextWidth(text) <= maxWidth) return text;
      let truncated = text;
      while (truncated.length > 0 && doc.getTextWidth(truncated + "...") > maxWidth) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + "...";
    }

    const tamanhoNomeCompleto: Record<string, string> = {
      "1L": "1 LITRO",
      "2L": "2 LITROS",
      "5L": "5 LITROS",
      "20L": "20 LITROS",
    };

    function drawLabel(xOffset: number, tamanho: string) {
      const barcodeValue = `${produtoNome} ${tamanho}`;
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, barcodeValue, { format: "CODE128", displayValue: false });
      const barcodeData = canvas.toDataURL("image/png");
      doc.addImage(barcodeData, "PNG", xOffset + 1, 1, 38, 8);

      const maxWidth = 38;
      let y = 11;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      const linha1 = `${produtoNome} ${tamanhoNomeCompleto[tamanho] ?? tamanho}`.toUpperCase();
      doc.text(truncateToWidth(linha1, maxWidth), xOffset + 1, y);
      y += 2;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.text(`LOTE: ${numeroLote}`.toUpperCase(), xOffset + 1, y);
      y += 2;
      doc.text(`FAB: ${fabStr}  VAL: ${valStr}`, xOffset + 1, y);
      if (fragancia) {
        y += 2;
        doc.text(`FRAGANCIA: ${fragancia}`, xOffset + 1, y);
      }
    }

    for (const { label, qtd } of tamanhos) {
      if (qtd <= 0) continue;
      let remaining = qtd;
      while (remaining > 0) {
        if (!firstPage) doc.addPage([80, 20], "landscape");
        firstPage = false;

        drawLabel(0, label);
        remaining -= 1;
        if (remaining > 0) {
          drawLabel(40, label);
          remaining -= 1;
        }
      }
    }

    doc.save(`etiquetas-${numeroLote}.pdf`);
  }

  function handleConcluirClick() {
    if (!hasSaved) {
      setShowConfirmConcluir(true);
      return;
    }
    handleConcluir();
  }

  function handleConfirmConcluirMesmoAssim() {
    setShowConfirmConcluir(false);
    handleConcluir();
  }

  async function handleToggleInsumos() {
    if (!selectedId) return;
    if (!insumosOpen && !insumosCache[selectedId]) {
      setInsumosLoading(true);
      try {
        const data = await getLoteInsumos(selectedId);
        setInsumosCache((prev) => ({ ...prev, [selectedId]: data }));
      } catch {
        // silently ignore; table may show empty
        setInsumosCache((prev) => ({ ...prev, [selectedId]: [] }));
      } finally {
        setInsumosLoading(false);
      }
    }
    setInsumosOpen((o) => !o);
  }

  const totalUnidades = qtd1l + qtd2l + qtd5l + qtd20l;
  const atLeastOneQtd = qtd1l > 0 || qtd2l > 0 || qtd5l > 0 || qtd20l > 0;
  const rendimentoReal = qtd1l * 1 + qtd2l * 2 + qtd5l * 5 + qtd20l * 20;

  async function handleSelectHistorico() {
    setActiveTab("historico");
    if (historico !== null) return;
    setHistoricoLoading(true);
    setHistoricoError(null);
    try {
      const data = await getHistoricoEnvases();
      setHistorico(data);
    } catch (e) {
      setHistoricoError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
    } finally {
      setHistoricoLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Tab bar */}
      <div
        className="flex border-b border-gray-200 bg-white"
        style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 0 }}
      >
        {(["em_curso", "historico"] as const).map((tab) => {
          const label = tab === "em_curso" ? "Em Curso" : "Histórico";
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => {
                if (tab === "historico") handleSelectHistorico();
                else setActiveTab("em_curso");
              }}
              className={`tab-btn relative px-5 py-3 text-sm font-semibold transition${isActive ? " tab-active-outline" : ""}`}
              style={{
                color: isActive ? "#1565C0" : "#6B7A99",
                borderBottom: isActive ? "3px solid #1565C0" : "3px solid transparent",
                fontWeight: isActive ? 700 : 400,
                background: "transparent",
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Em Curso tab ── */}
      {activeTab === "em_curso" && (
        <div className="flex" style={{ minHeight: "calc(100vh - 64px - 45px)" }}>
          {/* Sidebar */}
          <aside
            className={`flex-shrink-0 flex-col border-r-2 md:flex ${mobileSidebarOpen ? "flex" : "hidden"}`}
            style={{ width: 220, background: "linear-gradient(180deg, #F8FAFF 0%, #EEF4FF 100%)", borderRightColor: "#E0EAFF" }}
          >
            <div
              className="px-4 py-4"
              style={{ borderBottom: "1px solid #E0EAFF" }}
            >
              <span style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 18, fontWeight: 700, color: "#1A3A6B" }}>Envase</span>
            </div>
            <ul className="flex-1 overflow-y-auto py-2">
              {lotes.length === 0 && (
                <li className="px-4 py-3 text-gray-400 text-sm">
                  Nenhum lote em envase.
                </li>
              )}
              {lotes.map((l) => {
                const isActive = l.id === selectedId;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => { setSelectedId(l.id); setMobileSidebarOpen(false); }}
                      className="w-full text-left text-sm transition sidebar-nav-premium"
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
                      <div className="font-semibold truncate">
                        {l.formulas?.nome ?? "—"}
                      </div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: isActive ? "#1565C0" : "#607D8B" }}
                      >
                        <span>{l.numero_lote}</span>
                        <span className="mx-1">·</span>
                        <span>{l.data_producao}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Main panel */}
          <main className={`flex-1 overflow-y-auto md:block ${!mobileSidebarOpen ? "block" : "hidden"}`} style={{ padding: 24, background: "linear-gradient(180deg, #F8FAFF 0%, #FFFFFF 80px)" }}>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="mb-4 flex items-center gap-1 text-sm font-semibold md:hidden hover:bg-gray-100 transition-all active:scale-95"
              style={{ color: "#1565C0", cursor: "pointer" }}
            >
              ← Envase
            </button>
            {!selectedId && (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <p className="text-gray-400 text-base">
                  Selecione um lote para registar o envase
                </p>
              </div>
            )}

            {selectedId && formLoading && (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <p className="text-gray-400">Carregando...</p>
              </div>
            )}

            {selectedId && !formLoading && selectedLote && (
              <div className="max-w-xl">
                {/* Header */}
                <div
                  className="mb-1 flex items-center gap-3 flex-wrap"
                  style={{ paddingBottom: 16, borderBottom: "1px solid #E8F4FF", marginBottom: 16 }}
                >
                  <h2
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "#1A3A6B",
                      fontFamily: "var(--font-lora), Georgia, serif",
                    }}
                  >
                    {selectedLote.formulas?.nome ?? "—"}
                  </h2>
                  <span
                    className="font-bold tracking-wider"
                    style={{ backgroundColor: "#E8F4FF", color: "#1565C0", borderRadius: 8, padding: "3px 10px", fontSize: 13, fontWeight: 700 }}
                  >
                    {selectedLote.numero_lote}
                  </span>
                </div>
                <p className="mb-1" style={{ fontSize: 13, color: "#6B7A99" }}>
                  Data de produção: <strong>{selectedLote.data_producao}</strong>
                </p>
                <p className="text-sm mb-2" style={{ color: "#1A3A6B" }}>
                  Rendimento Total:{" "}
                  <strong>
                    {selectedLote.formulas?.rendimento ?? "—"}{" "}
                    {selectedLote.formulas?.rendimento_unidade ?? "unidade"}
                  </strong>
                </p>

                {/* Insumos do Lote collapsible */}
                <div className="mb-6">
                  <button
                    onClick={handleToggleInsumos}
                    className="text-sm font-semibold"
                    style={{ color: "#1565C0", cursor: "pointer", background: "none", border: "none", padding: 0 }}
                  >
                    {insumosOpen ? "▲ Ocultar insumos" : "▼ Ver insumos do lote"}
                  </button>
                  {insumosOpen && (
                    <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid #BBDEFB" }}>
                      {insumosLoading ? (
                        <p className="text-xs text-gray-400 px-3 py-2">Carregando...</p>
                      ) : (insumosCache[selectedId] ?? []).length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-2">Nenhum insumo registado.</p>
                      ) : (
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ backgroundColor: "#BBDEFB" }}>
                              {["Insumo", "Quantidade", "Unidade"].map((h) => (
                                <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "#1565C0" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(insumosCache[selectedId] ?? []).map((row, i) => (
                              <tr key={i} style={{ backgroundColor: "#E8F4FF" }}>
                                <td className="px-3 py-1.5 text-gray-800">{row.nome}</td>
                                <td className="px-3 py-1.5 text-gray-700">{row.quantidade}</td>
                                <td className="px-3 py-1.5 text-gray-600">{row.unidade}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>

                {/* Quantity grid */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
                  {[
                    { label: "1L", value: qtd1l, set: setQtd1l },
                    { label: "2L", value: qtd2l, set: setQtd2l },
                    { label: "5L", value: qtd5l, set: setQtd5l },
                    { label: "20L", value: qtd20l, set: setQtd20l },
                  ].map(({ label, value, set }) => {
                    const estoque = estoqueEmbalagens[label];
                    const insuficiente = estoque && value > estoque.estoque_atual;
                    return (
                      <div
                        key={label}
                        className="qty-card flex flex-col gap-2 bg-white p-4"
                        style={{ border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 2px 8px rgba(21,101,192,0.08)" }}
                      >
                        <span style={{ fontWeight: 800, fontSize: 20, color: "#1565C0" }}>{label}</span>
                        <input
                          className={inputCls}
                          type="number"
                          min={0}
                          step={1}
                          value={value}
                          onChange={(e) => {
                            set(Math.max(0, Number(e.target.value)));
                            setHasSaved(false);
                          }}
                          style={{ fontSize: 18, fontWeight: 600, textAlign: "center" }}
                        />
                        {!estoque && (
                          <p className="text-xs" style={{ color: "#9E9E9E" }}>
                            Embalagem não configurada
                          </p>
                        )}
                        {insuficiente && (
                          <p style={{ color: "#E65100", fontSize: 11 }}>
                            ⚠ Estoque insuficiente: {estoque.estoque_atual} disponíveis
                            <br />
                            <Link
                              href="/estoque-insumos"
                              className="hover:underline"
                              style={{ color: "#E65100", fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              Atualizar estoque →
                            </Link>
                          </p>
                        )}
                        {value > 0 && embalagensDisponiveis && (
                          <div className="flex flex-col gap-2 mt-1">
                            <div>
                              <div style={{ fontSize: 11, color: "#6B7A99" }}>Garrafa</div>
                              <select
                                className={selectCls}
                                style={{ fontSize: 13 }}
                                value={embalagemState[label]?.garrafa_id ?? ""}
                                onChange={(e) =>
                                  setEmbalagemState((prev) => ({
                                    ...prev,
                                    [label]: { ...prev[label], garrafa_id: e.target.value || null },
                                  }))
                                }
                              >
                                <option value="">- Sem Garrafa -</option>
                                {embalagensDisponiveis[TAMANHO_PARA_CATEGORIA_GARRAFA[label]].map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.nome} ({i.estoque_atual} UN)
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "#6B7A99" }}>Tampa</div>
                              <select
                                className={selectCls}
                                style={{ fontSize: 13 }}
                                value={embalagemState[label]?.tampa_id ?? ""}
                                onChange={(e) =>
                                  setEmbalagemState((prev) => ({
                                    ...prev,
                                    [label]: { ...prev[label], tampa_id: e.target.value || null },
                                  }))
                                }
                              >
                                <option value="">- Sem Tampa -</option>
                                {embalagensDisponiveis.tampa.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.nome} ({i.estoque_atual} UN)
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "#6B7A99" }}>Alça</div>
                              <select
                                className={selectCls}
                                style={{ fontSize: 13 }}
                                value={embalagemState[label]?.alca_id ?? ""}
                                onChange={(e) =>
                                  setEmbalagemState((prev) => ({
                                    ...prev,
                                    [label]: { ...prev[label], alca_id: e.target.value || null },
                                  }))
                                }
                              >
                                <option value="">- Sem Alça -</option>
                                {embalagensDisponiveis.alca.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.nome} ({i.estoque_atual} UN)
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <p className="mb-2" style={{ color: "#1565C0", fontWeight: 700, fontSize: 17 }}>
                  Total de unidades: {totalUnidades}
                </p>

                {/* Rendimento Real */}
                {(() => {
                  const formulaRendimento = selectedLote.formulas?.rendimento ?? 0;
                  const diff = rendimentoReal - formulaRendimento;
                  return (
                    <div className="mb-4">
                      <p style={{ color: "#1565C0", fontWeight: 700, fontSize: 17 }}>
                        Rendimento Real: {rendimentoReal} L
                      </p>
                      {formulaRendimento > 0 && diff > 0 && (
                        <p className="mt-1 text-sm" style={{ color: "#E65100" }}>
                          ⚠ Atenção: rendimento real ({rendimentoReal} L) excede o rendimento da fórmula ({formulaRendimento} L)
                        </p>
                      )}
                      {formulaRendimento > 0 && diff < 0 && (
                        <p className="mt-1 text-sm" style={{ color: "#757575" }}>
                          Diferença: {diff} L em relação ao rendimento da fórmula
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Date */}
                <div className="mb-6 max-w-xs">
                  <Field label="Data do Envase">
                    <input
                      className={`${inputCls} cursor-pointer`}
                      type="datetime-local"
                      value={dataEnvase}
                      onChange={(e) => setDataEnvase(e.target.value)}
                    />
                  </Field>
                </div>

                {/* Feedback */}
                {successMsg && (
                  <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2 mb-4">
                    {successMsg}
                  </p>
                )}
                {errorMsg && (
                  <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-4">
                    {errorMsg}
                  </p>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saveLoading || concluirLoading}
                    className="flex-1 px-5 py-2 rounded-lg text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-60"
                    style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
                  >
                    {saveLoading ? "Salvando..." : "SALVAR"}
                  </button>
                  <button
                    onClick={handleConcluirClick}
                    disabled={!atLeastOneQtd || concluirLoading || saveLoading}
                    className="flex-1 px-5 py-2 rounded-lg text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-60"
                    style={{ backgroundColor: "#2E7D32", cursor: "pointer" }}
                  >
                    {concluirLoading ? "Concluindo..." : "CONCLUIR LOTE"}
                  </button>
                  {atLeastOneQtd && (
                    <button
                      onClick={generateEtiquetasPDF}
                      className="flex-1 px-5 py-2 rounded-lg text-white text-sm font-bold hover:brightness-110 transition-all active:scale-95"
                      style={{ backgroundColor: "#1A3A6B", cursor: "pointer" }}
                    >
                      Imprimir Etiquetas
                    </button>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── Confirm: concluir sem salvar ── */}
      {showConfirmConcluir && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <div
            className="bg-white w-full max-w-sm"
            style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
          >
            <div className="px-6 py-5">
              <p className="text-sm" style={{ color: "#1A3A6B" }}>
                As quantidades não foram salvas. Tens a certeza que queres
                concluir sem salvar?
              </p>
              <div className="flex gap-3 pt-5 justify-end">
                <button
                  onClick={() => setShowConfirmConcluir(false)}
                  className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmConcluirMesmoAssim}
                  className="px-4 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition"
                  style={{ backgroundColor: "#2E7D32" }}
                >
                  Concluir mesmo assim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Histórico tab ── */}
      {activeTab === "historico" && (
        <div style={{ padding: 24 }}>
          {historicoLoading && (
            <p className="text-gray-400 text-sm">Carregando histórico...</p>
          )}
          {historicoError && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
              {historicoError}
            </p>
          )}
          {!historicoLoading && !historicoError && historico !== null && (
            historico.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhum lote concluído ainda.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg shadow">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: "#1565C0" }}>
                      {["Produto", "Lote", "Data Envase", "1L", "2L", "5L", "20L", "Rendimento Real"].map((h) => (
                        <th
                          key={h}
                          className="text-left text-white font-bold px-4 py-3"
                          style={{ fontSize: 13 }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((item, idx) => {
                      const env = item.envases[0];
                      return (
                        <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? "#F0F7FF" : "#ffffff" }}>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.formulas?.nome ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-700">{item.numero_lote}</td>
                          <td className="px-4 py-3 text-gray-700">{formatDataEnvase(env?.data_envase)}</td>
                          <td className="px-4 py-3 text-gray-700">{env?.qtd_1l ?? 0}</td>
                          <td className="px-4 py-3 text-gray-700">{env?.qtd_2l ?? 0}</td>
                          <td className="px-4 py-3 text-gray-700">{env?.qtd_5l ?? 0}</td>
                          <td className="px-4 py-3 text-gray-700">{env?.qtd_20l ?? 0}</td>
                          <td className="px-4 py-3 font-semibold" style={{ color: "#1565C0" }}>
                            {env?.rendimento_real != null ? `${env.rendimento_real} L` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
