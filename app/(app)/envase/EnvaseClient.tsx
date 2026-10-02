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
  getEmbalagemConfig,
  saveEmbalagemConfig,
  getEstoqueEmbalagens,
  type LoteEnvaseWithFormula,
  type EnvaseRow,
  type HistoricoEnvaseItem,
  type LoteInsumoItem,
  type EmbalagemConfigItem,
  type EstoqueEmbalagemItem,
} from "@/app/actions/envase";
import { getInsumosList } from "@/app/actions/producao";

const TAMANHOS = ["1L", "2L", "5L", "20L"] as const;

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

  const [activeTab, setActiveTab] = useState<"em_curso" | "historico" | "embalagens">("em_curso");
  const [historico, setHistorico] = useState<HistoricoEnvaseItem[] | null>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoError, setHistoricoError] = useState<string | null>(null);

  const [embalagemConfig, setEmbalagemConfig] = useState<EmbalagemConfigItem[] | null>(null);
  const [embalagemInsumos, setEmbalagemInsumos] = useState<{ id: string; nome: string; unidade: string }[]>([]);
  const [embalagemSelecionado, setEmbalagemSelecionado] = useState<Record<string, string>>({});
  const [embalagemLoading, setEmbalagemLoading] = useState(false);
  const [embalagemError, setEmbalagemError] = useState<string | null>(null);
  const [embalagemSaving, setEmbalagemSaving] = useState<string | null>(null);
  const [embalagemSuccess, setEmbalagemSuccess] = useState<string | null>(null);

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
      await concluirEnvase(selectedId);
      setLotes((prev) => prev.filter((l) => l.id !== selectedId));
      setSelectedId(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao concluir lote.");
    } finally {
      setConcluirLoading(false);
    }
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

  async function handleSelectEmbalagens() {
    setActiveTab("embalagens");
    if (embalagemConfig !== null) return;
    setEmbalagemLoading(true);
    setEmbalagemError(null);
    try {
      const [config, insumos] = await Promise.all([
        getEmbalagemConfig(),
        getInsumosList("producao"),
      ]);
      setEmbalagemConfig(config);
      setEmbalagemInsumos(insumos);
      const initial: Record<string, string> = {};
      for (const tamanho of TAMANHOS) {
        const existing = config.find((c) => c.tamanho === tamanho);
        initial[tamanho] = existing?.insumo_id ?? "";
      }
      setEmbalagemSelecionado(initial);
    } catch (e) {
      setEmbalagemError(e instanceof Error ? e.message : "Erro ao carregar configuração.");
    } finally {
      setEmbalagemLoading(false);
    }
  }

  async function handleSaveEmbalagem(tamanho: string) {
    const insumo_id = embalagemSelecionado[tamanho];
    if (!insumo_id) return;
    setEmbalagemSaving(tamanho);
    setEmbalagemError(null);
    try {
      await saveEmbalagemConfig(tamanho, insumo_id);
      setEmbalagemSuccess("Configuração salva!");
      setTimeout(() => setEmbalagemSuccess(null), 2000);
    } catch (e) {
      setEmbalagemError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setEmbalagemSaving(null);
    }
  }

  return (
    <div style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Tab bar */}
      <div
        className="flex border-b border-gray-200 bg-white"
        style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 0 }}
      >
        {(isAdmin ? (["em_curso", "historico", "embalagens"] as const) : (["em_curso", "historico"] as const)).map((tab) => {
          const label = tab === "em_curso" ? "Em Curso" : tab === "historico" ? "Histórico" : "Embalagens";
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => {
                if (tab === "historico") handleSelectHistorico();
                else if (tab === "embalagens") handleSelectEmbalagens();
                else setActiveTab("em_curso");
              }}
              className="relative px-5 py-3 text-sm font-semibold transition"
              style={{
                color: isActive ? "#1565C0" : "#607D8B",
                borderBottom: isActive ? "2px solid #1565C0" : "2px solid transparent",
                background: "none",
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
            className={`flex-shrink-0 flex-col border-r border-gray-200 bg-white md:flex ${mobileSidebarOpen ? "flex" : "hidden"}`}
            style={{ width: 220 }}
          >
            <div
              className="px-4 py-4 border-b border-blue-200"
              style={{ backgroundColor: "#1565C0" }}
            >
              <span className="text-white font-semibold" style={{ fontFamily: "var(--font-lora), Georgia, serif", fontSize: 16, fontWeight: 600 }}>Envase</span>
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
                      className="w-full text-left text-sm transition"
                      style={{
                        backgroundColor: isActive ? "#1565C0" : "transparent",
                        color: isActive ? "#ffffff" : "#1A3A6B",
                        borderRadius: 8,
                        padding: "12px 16px",
                        fontWeight: isActive ? 600 : 400,
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
                        style={{ color: isActive ? "#BBDEFB" : "#607D8B" }}
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
          <main className={`flex-1 overflow-y-auto bg-white md:block ${!mobileSidebarOpen ? "block" : "hidden"}`} style={{ padding: 24 }}>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="mb-4 flex items-center gap-1 text-sm font-semibold md:hidden"
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
                <div className="mb-1 flex items-center gap-3 flex-wrap">
                  <h2
                    className="text-2xl font-bold"
                    style={{ color: "#1A3A6B" }}
                  >
                    {selectedLote.formulas?.nome ?? "—"}
                  </h2>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-bold tracking-wider"
                    style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}
                  >
                    {selectedLote.numero_lote}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-1">
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
                        className="flex flex-col gap-2 bg-white shadow-sm p-4"
                        style={{ border: "1px solid #e5e7eb", borderRadius: 12 }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 18, color: "#1565C0" }}>{label}</span>
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
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <p className="mb-2" style={{ color: "#1565C0", fontWeight: 700, fontSize: 18 }}>
                  Total de unidades: {totalUnidades}
                </p>

                {/* Rendimento Real */}
                {(() => {
                  const formulaRendimento = selectedLote.formulas?.rendimento ?? 0;
                  const diff = rendimentoReal - formulaRendimento;
                  return (
                    <div className="mb-4">
                      <p style={{ color: "#1565C0", fontWeight: 700, fontSize: 15 }}>
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

      {/* ── Embalagens tab ── */}
      {activeTab === "embalagens" && isAdmin && (
        <div style={{ padding: 24 }}>
          {embalagemLoading && (
            <p className="text-gray-400 text-sm">Carregando configuração...</p>
          )}
          {embalagemError && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-4">
              {embalagemError}
            </p>
          )}
          {embalagemSuccess && (
            <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2 mb-4">
              {embalagemSuccess}
            </p>
          )}
          {!embalagemLoading && embalagemConfig !== null && (
            <div className="overflow-x-auto rounded-lg shadow max-w-2xl">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: "#1565C0" }}>
                    {["Tamanho", "Insumo associado", ""].map((h) => (
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
                  {TAMANHOS.map((tamanho, idx) => (
                    <tr key={tamanho} style={{ backgroundColor: idx % 2 === 0 ? "#F0F7FF" : "#ffffff" }}>
                      <td className="px-4 py-3 font-medium text-gray-800">{tamanho}</td>
                      <td className="px-4 py-3">
                        <select
                          className={inputCls}
                          value={embalagemSelecionado[tamanho] ?? ""}
                          onChange={(e) =>
                            setEmbalagemSelecionado((prev) => ({ ...prev, [tamanho]: e.target.value }))
                          }
                        >
                          <option value="">— Selecione —</option>
                          {embalagemInsumos.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nome} ({i.unidade})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleSaveEmbalagem(tamanho)}
                          disabled={!embalagemSelecionado[tamanho] || embalagemSaving === tamanho}
                          className="px-3 py-1.5 rounded text-white text-xs font-bold hover:brightness-110 transition disabled:opacity-60"
                          style={{ backgroundColor: "#1565C0", cursor: "pointer" }}
                        >
                          {embalagemSaving === tamanho ? "Salvando..." : "Salvar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
