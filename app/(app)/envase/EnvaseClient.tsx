"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getEnvaseByLote,
  saveEnvase,
  concluirEnvase,
  type LoteEnvaseWithFormula,
  type EnvaseRow,
} from "@/app/actions/envase";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
}: {
  initialLotes: LoteEnvaseWithFormula[];
}) {
  const [lotes, setLotes] = useState<LoteEnvaseWithFormula[]>(initialLotes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  const [qtd1l, setQtd1l] = useState(0);
  const [qtd2l, setQtd2l] = useState(0);
  const [qtd5l, setQtd5l] = useState(0);
  const [qtd20l, setQtd20l] = useState(0);
  const [dataEnvase, setDataEnvase] = useState(todayStr());

  const [formLoading, setFormLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [concluirLoading, setConcluirLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedLote = lotes.find((l) => l.id === selectedId) ?? null;

  const resetForm = useCallback(() => {
    setQtd1l(0);
    setQtd2l(0);
    setQtd5l(0);
    setQtd20l(0);
    setDataEnvase(todayStr());
    setSuccessMsg(null);
    setErrorMsg(null);
  }, []);

  const loadEnvase = useCallback(
    async (lote_id: string) => {
      setFormLoading(true);
      resetForm();
      try {
        const existing: EnvaseRow | null = await getEnvaseByLote(lote_id);
        if (existing) {
          setQtd1l(existing.qtd_1l ?? 0);
          setQtd2l(existing.qtd_2l ?? 0);
          setQtd5l(existing.qtd_5l ?? 0);
          setQtd20l(existing.qtd_20l ?? 0);
          setDataEnvase(existing.data_envase ?? todayStr());
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

  const totalUnidades = qtd1l + qtd2l + qtd5l + qtd20l;
  const atLeastOneQtd = qtd1l > 0 || qtd2l > 0 || qtd5l > 0 || qtd20l > 0;

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 64px)" }}>
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
          style={{ color: "#1565C0" }}
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
            <p className="text-sm mb-6" style={{ color: "#1A3A6B" }}>
              Rendimento Total:{" "}
              <strong>
                {selectedLote.formulas?.rendimento ?? "—"}{" "}
                {selectedLote.formulas?.rendimento_unidade ?? "unidade"}
              </strong>
            </p>

            {/* Quantity grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
              {[
                { label: "1L", value: qtd1l, set: setQtd1l },
                { label: "2L", value: qtd2l, set: setQtd2l },
                { label: "5L", value: qtd5l, set: setQtd5l },
                { label: "20L", value: qtd20l, set: setQtd20l },
              ].map(({ label, value, set }) => (
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
                    onChange={(e) => set(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              ))}
            </div>

            {/* Summary */}
            <p className="mb-4" style={{ color: "#1565C0", fontWeight: 700, fontSize: 18 }}>
              Total de unidades: {totalUnidades}
            </p>

            {/* Date */}
            <div className="mb-6 max-w-xs">
              <Field label="Data do Envase">
                <input
                  className={inputCls}
                  type="date"
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
                style={{ backgroundColor: "#1565C0" }}
              >
                {saveLoading ? "Salvando..." : "SALVAR"}
              </button>
              <button
                onClick={handleConcluir}
                disabled={!atLeastOneQtd || concluirLoading || saveLoading}
                className="flex-1 px-5 py-2 rounded-lg text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#2E7D32" }}
              >
                {concluirLoading ? "Concluindo..." : "CONCLUIR LOTE"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
