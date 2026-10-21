"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getEnvaseByLote,
  saveEnvase,
  concluirEnvaseV2,
  getHistoricoEnvases,
  getLoteInsumos,
  getLotesEnvase,
  getEmbalagensDisponiveis,
  getProdutosDestino,
  type LoteEnvaseWithFormula,
  type HistoricoEnvaseItem,
  type LoteInsumoItem,
  type EmbalagemDisponivel,
  type ProdutoDestino,
  type TamanhoEnvase,
} from "@/app/actions/envase";
import type { FaltaItem } from "@/types/rpc";

const TAMANHOS: {
  key: TamanhoEnvase;
  label: string;
  nomeCompleto: string;
  litros: number;
  categoria: string;
}[] = [
  { key: "200ML", label: "200 ML", nomeCompleto: "200 ML", litros: 0.2, categoria: "garrafa_200ml" },
  { key: "500ML", label: "500 ML", nomeCompleto: "500 ML", litros: 0.5, categoria: "garrafa_500ml" },
  { key: "1L", label: "1L", nomeCompleto: "1 LITRO", litros: 1, categoria: "garrafa_1l" },
  { key: "2L", label: "2L", nomeCompleto: "2 LITROS", litros: 2, categoria: "garrafa_2l" },
  { key: "5L", label: "5L", nomeCompleto: "5 LITROS", litros: 5, categoria: "garrafa_5l" },
  { key: "20L", label: "20L", nomeCompleto: "20 LITROS", litros: 20, categoria: "garrafa_20l" },
];

const NOVO_PRODUTO = "__novo__";

type Quantidades = Record<TamanhoEnvase, number>;

type EmbalagemTamanhoState = {
  garrafa_id: string | null;
  tampa_id: string | null;
  alca_id: string | null;
};

const QTD_VAZIA: Quantidades = { "200ML": 0, "500ML": 0, "1L": 0, "2L": 0, "5L": 0, "20L": 0 };

function embalagemVazia(): Record<TamanhoEnvase, EmbalagemTamanhoState> {
  const initial = {} as Record<TamanhoEnvase, EmbalagemTamanhoState>;
  for (const t of TAMANHOS) initial[t.key] = { garrafa_id: null, tampa_id: null, alca_id: null };
  return initial;
}

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

  const [qtds, setQtds] = useState<Quantidades>({ ...QTD_VAZIA });
  const [dataEnvase, setDataEnvase] = useState(nowStr());

  const [embalagens, setEmbalagens] = useState<EmbalagemDisponivel[]>([]);
  const [embalagemState, setEmbalagemState] = useState(embalagemVazia);
  const [produtos, setProdutos] = useState<ProdutoDestino[]>([]);
  const [produtoDestino, setProdutoDestino] = useState("");
  const [novoProdutoNome, setNovoProdutoNome] = useState("");
  const [faltas, setFaltas] = useState<FaltaItem[] | null>(null);

  useEffect(() => {
    getEmbalagensDisponiveis()
      .then(setEmbalagens)
      .catch(() => setEmbalagens([]));
  }, []);

  const [insumosOpen, setInsumosOpen] = useState(false);
  const [insumosCache, setInsumosCache] = useState<Record<string, LoteInsumoItem[]>>({});
  const [insumosLoading, setInsumosLoading] = useState(false);

  const [formLoading, setFormLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedLote = lotes.find((l) => l.id === selectedId) ?? null;

  const resetForm = useCallback(() => {
    setQtds({ ...QTD_VAZIA });
    setDataEnvase(nowStr());
    setSuccessMsg(null);
    setErrorMsg(null);
    setEmbalagemState(embalagemVazia());
    setProdutos([]);
    setProdutoDestino("");
    setNovoProdutoNome("");
    setFaltas(null);
  }, []);

  const loadEnvase = useCallback(
    async (lote_id: string) => {
      setFormLoading(true);
      resetForm();
      try {
        const [existing, destinos] = await Promise.all([
          getEnvaseByLote(lote_id),
          getProdutosDestino(lote_id),
        ]);
        setProdutos(destinos);
        if (existing) {
          setQtds({
            "200ML": existing.qtd_200ml ?? 0,
            "500ML": existing.qtd_500ml ?? 0,
            "1L": existing.qtd_1l ?? 0,
            "2L": existing.qtd_2l ?? 0,
            "5L": existing.qtd_5l ?? 0,
            "20L": existing.qtd_20l ?? 0,
          });
          setDataEnvase(existing.data_envase ? existing.data_envase.slice(0, 16) : nowStr());
          if (existing.produto_acabado_id && destinos.some((d) => d.id === existing.produto_acabado_id)) {
            setProdutoDestino(existing.produto_acabado_id);
          }
        }
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

  async function recarregarLotes() {
    try {
      const atualizados = await getLotesEnvase();
      setLotes(atualizados);
      if (selectedId && !atualizados.some((l) => l.id === selectedId)) {
        setSelectedId(null);
      }
    } catch {
      // mantém a lista atual se a recarga falhar
    }
  }

  async function handleSave() {
    if (!selectedId) return;
    setErrorMsg(null);
    setPending(true);
    try {
      const r = await saveEnvase(
        selectedId,
        qtds["200ML"],
        qtds["500ML"],
        qtds["1L"],
        qtds["2L"],
        qtds["5L"],
        qtds["20L"],
        dataEnvase
      );
      if (r.ok) {
        setSuccessMsg("Envase salvo!");
        setTimeout(() => setSuccessMsg(null), 2000);
      } else {
        setErrorMsg(r.error);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setPending(false);
      await recarregarLotes();
    }
  }

  async function handleConcluir(confirmar_falta: boolean) {
    if (!selectedId) return;
    setErrorMsg(null);

    const novo = produtoDestino === NOVO_PRODUTO;
    if (!produtoDestino) {
      setErrorMsg("Selecione o produto de destino.");
      return;
    }
    if (novo && !novoProdutoNome.trim()) {
      setErrorMsg("Informe o nome do novo produto.");
      return;
    }
    for (const t of TAMANHOS) {
      if (qtds[t.key] <= 0) continue;
      const sel = embalagemState[t.key];
      if (!sel.garrafa_id) {
        setErrorMsg(`Selecione a garrafa para ${t.label}.`);
        return;
      }
      if (!sel.tampa_id) {
        setErrorMsg(`Selecione a tampa para ${t.label}.`);
        return;
      }
    }

    setPending(true);
    try {
      const r = await concluirEnvaseV2({
        lote_id: selectedId,
        qtd_200ml: qtds["200ML"],
        qtd_500ml: qtds["500ML"],
        qtd_1l: qtds["1L"],
        qtd_2l: qtds["2L"],
        qtd_5l: qtds["5L"],
        qtd_20l: qtds["20L"],
        data_envase: dataEnvase,
        produto_acabado_id: novo ? null : produtoDestino,
        novo_produto_nome: novo ? novoProdutoNome.trim() : null,
        embalagens: TAMANHOS.filter((t) => qtds[t.key] > 0).map((t) => ({
          tamanho: t.key,
          garrafa_id: embalagemState[t.key].garrafa_id,
          tampa_id: embalagemState[t.key].tampa_id,
          alca_id: embalagemState[t.key].alca_id,
        })),
        confirmar_falta,
      });
      if (r.ok) {
        setFaltas(null);
        setSelectedId(null);
      } else if ("faltas" in r) {
        setFaltas(r.faltas);
      } else {
        setFaltas(null);
        setErrorMsg(r.error);
      }
    } catch (e) {
      setFaltas(null);
      setErrorMsg(e instanceof Error ? e.message : "Erro ao concluir lote.");
    } finally {
      setPending(false);
      await recarregarLotes();
    }
  }

  function nomeProdutoDestino(): string {
    if (produtoDestino === NOVO_PRODUTO) return novoProdutoNome.trim() || "—";
    return produtos.find((p) => p.id === produtoDestino)?.nome ?? "—";
  }

  async function generateEtiquetasPDF() {
    if (!selectedLote) return;
    const { default: jsPDF } = await import("jspdf");
    const JsBarcode = (await import("jsbarcode")).default;

    const produtoNome = nomeProdutoDestino();
    const numeroLote = selectedLote.numero_lote;
    const fragancia = selectedLote.fragancia;

    const dataProducao = new Date(selectedLote.data_producao);
    const fabStr = formatDateDDMMYYYY(dataProducao);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [80, 20] });
    let firstPage = true;

    const LABEL_TEXT_WIDTH = 38;
    const FONT_BASE = 5;
    const FONT_NOME = FONT_BASE * 1.2;
    const FONT_DEMAIS = FONT_BASE * 1.3;
    const FONT_MIN = 3;

    // Reduz apenas o necessario para a linha caber em uma unica linha.
    function drawFitted(text: string, x: number, y: number, size: number) {
      doc.setFontSize(size);
      while (size > FONT_MIN && doc.getTextWidth(text) > LABEL_TEXT_WIDTH) {
        size = Math.round((size - 0.1) * 10) / 10;
        doc.setFontSize(size);
      }
      doc.text(text, x, y);
    }

    function drawLabel(xOffset: number, tamanho: { label: string; nomeCompleto: string }) {
      const barcodeValue = `${produtoNome} ${tamanho.label}`;
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, barcodeValue, { format: "CODE128", displayValue: false });
      const barcodeData = canvas.toDataURL("image/png");
      doc.addImage(barcodeData, "PNG", xOffset + 1, 0, 38, 8);

      const x = xOffset + 1;
      let y = 10.4;
      const passo = 2.6;

      doc.setFont("helvetica", "bold");
      const linha1 = `${produtoNome} ${tamanho.nomeCompleto}`.toUpperCase();
      drawFitted(linha1, x, y, FONT_NOME);
      y += passo;

      doc.setFont("helvetica", "normal");
      drawFitted(`LOTE: ${numeroLote}`.toUpperCase(), x, y, FONT_DEMAIS);
      y += passo;
      drawFitted(`FAB: ${fabStr}  VAL: 180 DIAS`, x, y, FONT_DEMAIS);
      if (fragancia) {
        y += passo;
        drawFitted(`FRAGANCIA: ${fragancia}`, x, y, FONT_DEMAIS);
      }
    }

    for (const tamanho of TAMANHOS) {
      const qtd = qtds[tamanho.key];
      if (qtd <= 0) continue;
      let remaining = qtd;
      while (remaining > 0) {
        if (!firstPage) doc.addPage([80, 20], "landscape");
        firstPage = false;

        drawLabel(0, tamanho);
        remaining -= 1;
        if (remaining > 0) {
          drawLabel(40, tamanho);
          remaining -= 1;
        }
      }
    }

    doc.save(`etiquetas-${numeroLote}.pdf`);
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

  const totalUnidades = TAMANHOS.reduce((acc, t) => acc + qtds[t.key], 0);
  const atLeastOneQtd = totalUnidades > 0;
  const rendimentoReal =
    Math.round(TAMANHOS.reduce((acc, t) => acc + qtds[t.key] * t.litros, 0) * 1000) / 1000;

  // Quantidade necessária por embalagem somando todos os tamanhos (a mesma tampa pode servir vários)
  const necessarioPorInsumo: Record<string, number> = {};
  for (const t of TAMANHOS) {
    if (qtds[t.key] <= 0) continue;
    const sel = embalagemState[t.key];
    for (const id of [sel.garrafa_id, sel.tampa_id, sel.alca_id]) {
      if (id) necessarioPorInsumo[id] = (necessarioPorInsumo[id] ?? 0) + qtds[t.key];
    }
  }

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
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-4">
                  {TAMANHOS.map((t) => {
                    const value = qtds[t.key];
                    const sel = embalagemState[t.key];
                    const garrafas = embalagens.filter((i) => i.categoria === t.categoria);
                    const tampas = embalagens.filter((i) => i.categoria === "tampa");
                    const alcas = embalagens.filter((i) => i.categoria === "alca");
                    const escolhidos = [sel.garrafa_id, sel.tampa_id, sel.alca_id]
                      .filter((id): id is string => !!id)
                      .map((id) => embalagens.find((i) => i.id === id))
                      .filter((i): i is EmbalagemDisponivel => !!i)
                      .filter((i) => (necessarioPorInsumo[i.id] ?? 0) > i.estoque_atual);
                    const setSel = (campo: keyof EmbalagemTamanhoState, id: string) =>
                      setEmbalagemState((prev) => ({
                        ...prev,
                        [t.key]: { ...prev[t.key], [campo]: id || null },
                      }));
                    const optionLabel = (i: EmbalagemDisponivel) => `${i.nome} (${i.estoque_atual} ${i.unidade})`;
                    return (
                      <div
                        key={t.key}
                        className="qty-card flex flex-col gap-2 bg-white p-4"
                        style={{ border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 2px 8px rgba(21,101,192,0.08)" }}
                      >
                        <span style={{ fontWeight: 800, fontSize: 20, color: "#1565C0" }}>{t.label}</span>
                        <input
                          className={inputCls}
                          type="number"
                          min={0}
                          step={1}
                          value={value}
                          onChange={(e) =>
                            setQtds((prev) => ({
                              ...prev,
                              [t.key]: Math.max(0, Math.floor(Number(e.target.value)) || 0),
                            }))
                          }
                          style={{ fontSize: 18, fontWeight: 600, textAlign: "center" }}
                        />
                        {value > 0 && (
                          <div className="flex flex-col gap-2 mt-1">
                            <div>
                              <div style={{ fontSize: 11, color: "#6B7A99" }}>Garrafa *</div>
                              {garrafas.length === 0 ? (
                                <p style={{ fontSize: 11, color: "#E65100" }}>
                                  Cadastre a garrafa de {t.label} no Estoque (categoria Garrafa {t.label}){" "}
                                  <Link href="/estoque-insumos" className="hover:underline" style={{ fontWeight: 600 }}>
                                    Ir para o Estoque →
                                  </Link>
                                </p>
                              ) : (
                                <select
                                  className={selectCls}
                                  style={{ fontSize: 13 }}
                                  required
                                  value={sel.garrafa_id ?? ""}
                                  onChange={(e) => setSel("garrafa_id", e.target.value)}
                                >
                                  <option value="">- Selecione -</option>
                                  {garrafas.map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {optionLabel(i)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "#6B7A99" }}>Tampa *</div>
                              {tampas.length === 0 ? (
                                <p style={{ fontSize: 11, color: "#E65100" }}>
                                  Cadastre a tampa no Estoque (categoria Tampa){" "}
                                  <Link href="/estoque-insumos" className="hover:underline" style={{ fontWeight: 600 }}>
                                    Ir para o Estoque →
                                  </Link>
                                </p>
                              ) : (
                                <select
                                  className={selectCls}
                                  style={{ fontSize: 13 }}
                                  required
                                  value={sel.tampa_id ?? ""}
                                  onChange={(e) => setSel("tampa_id", e.target.value)}
                                >
                                  <option value="">- Selecione -</option>
                                  {tampas.map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {optionLabel(i)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "#6B7A99" }}>Alça (opcional)</div>
                              <select
                                className={selectCls}
                                style={{ fontSize: 13 }}
                                value={sel.alca_id ?? ""}
                                onChange={(e) => setSel("alca_id", e.target.value)}
                              >
                                <option value="">- Sem Alça -</option>
                                {alcas.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {optionLabel(i)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {escolhidos.map((i) => (
                              <p key={i.id} style={{ color: "#B45309", fontSize: 11 }}>
                                ⚠ {i.nome}: necessário {necessarioPorInsumo[i.id]}, disponível {i.estoque_atual}{" "}
                                {i.unidade}
                              </p>
                            ))}
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
                  const diff = Math.round((rendimentoReal - formulaRendimento) * 1000) / 1000;
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

                {/* Produto de destino */}
                <div className="mb-6 max-w-xs flex flex-col gap-3">
                  <Field label="Produto de destino *">
                    <select
                      className={inputCls}
                      required
                      value={produtoDestino}
                      onChange={(e) => setProdutoDestino(e.target.value)}
                    >
                      <option value="">- Selecione -</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                      <option value={NOVO_PRODUTO}>Criar novo produto</option>
                    </select>
                  </Field>
                  {produtoDestino === NOVO_PRODUTO && (
                    <Field label="Nome do novo produto *">
                      <input
                        className={inputCls}
                        type="text"
                        value={novoProdutoNome}
                        onChange={(e) => setNovoProdutoNome(e.target.value)}
                      />
                    </Field>
                  )}
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
                  {selectedLote.status === "envase" && (
                    <button
                      onClick={handleSave}
                      disabled={pending}
                      className="flex-1 px-5 py-2 rounded-lg text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-60"
                      style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
                    >
                      {pending ? "Aguarde..." : "SALVAR"}
                    </button>
                  )}
                  <button
                    onClick={() => handleConcluir(false)}
                    disabled={!atLeastOneQtd || pending}
                    className="flex-1 px-5 py-2 rounded-lg text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-60"
                    style={{ backgroundColor: "#2E7D32", cursor: "pointer" }}
                  >
                    {pending ? "Aguarde..." : "CONCLUIR LOTE"}
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

      {/* ── Modal: estoque insuficiente ── */}
      {faltas && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <div
            className="bg-white w-full max-w-md"
            style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
          >
            <div className="px-6 py-5">
              <h3 className="text-base font-bold mb-3" style={{ color: "#1A3A6B" }}>
                Estoque insuficiente
              </h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ color: "#6B7A99" }}>
                    <th className="text-left py-1">Insumo</th>
                    <th className="text-right py-1">Necessário</th>
                    <th className="text-right py-1">Disponível</th>
                    <th className="text-left py-1 pl-2">Un.</th>
                  </tr>
                </thead>
                <tbody>
                  {faltas.map((f) => (
                    <tr key={f.insumo_id}>
                      <td className="py-1">{f.nome}</td>
                      <td className="py-1 text-right">{f.necessario}</td>
                      <td className="py-1 text-right">{f.disponivel}</td>
                      <td className="py-1 pl-2">{f.unidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-3 pt-5 justify-end flex-wrap">
                <Link
                  href="/estoque-insumos"
                  className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
                >
                  Atualizar estoque
                </Link>
                <button
                  onClick={() => handleConcluir(true)}
                  disabled={pending}
                  className="px-4 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                  style={{ backgroundColor: "#2E7D32" }}
                >
                  {pending ? "Aguarde..." : "Continuar mesmo assim"}
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
                      {["Produto", "Lote", "Data Envase", "200 ML", "500 ML", "1L", "2L", "5L", "20L", "Rendimento Real"].map((h) => (
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
                          <td className="px-4 py-3 font-medium text-gray-800">{env?.produtos_acabados?.nome ?? item.formulas?.nome ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-700">{item.numero_lote}</td>
                          <td className="px-4 py-3 text-gray-700">{formatDataEnvase(env?.data_envase)}</td>
                          <td className="px-4 py-3 text-gray-700">{env?.qtd_200ml ?? 0}</td>
                          <td className="px-4 py-3 text-gray-700">{env?.qtd_500ml ?? 0}</td>
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
