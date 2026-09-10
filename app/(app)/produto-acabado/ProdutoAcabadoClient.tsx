"use client";

import { useState } from "react";
import {
  getProdutosAcabados,
  createProdutoAcabado,
  registrarRetirada,
  getRetiradasHoje,
  getLotesConcluidos,
  type ProdutoAcabadoWithFlag,
  type RetiradasHoje,
  type LoteConcluidoWithFormula,
} from "@/app/actions/produto-acabado";

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
        className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto"
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
        <div className="px-6 py-5">{children}</div>
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

// ─── Main component ───────────────────────────────────────────────────────────

type ModalType = null | "novoProduto" | "retirada" | "relatorio";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function todayDisplay() {
  return new Date().toLocaleDateString("pt-BR");
}

export default function ProdutoAcabadoClient({
  initialProdutos,
  initialRetiradasHoje,
}: {
  initialProdutos: ProdutoAcabadoWithFlag[];
  initialRetiradasHoje: RetiradasHoje[];
}) {
  const [produtos, setProdutos] =
    useState<ProdutoAcabadoWithFlag[]>(initialProdutos);
  const [retiradasHoje, setRetiradasHoje] =
    useState<RetiradasHoje[]>(initialRetiradasHoje);

  const [modal, setModal] = useState<ModalType>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Novo produto state
  const [novoProdutoNome, setNovoProdutoNome] = useState("");
  const [novoProdutoLoteId, setNovoProdutoLoteId] = useState("");
  const [novoProdutoEstoqueInicial, setNovoProdutoEstoqueInicial] = useState("0");
  const [novoProdutoEstoqueSeg, setNovoProdutoEstoqueSeg] = useState("0");
  const [lotesConcluidos, setLotesConcluidos] = useState<
    LoteConcluidoWithFormula[]
  >([]);
  const [lotesLoading, setLotesLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Retirada state
  const [retiradaProduto, setRetiradaProduto] =
    useState<ProdutoAcabadoWithFlag | null>(null);
  const [retiradaQtd, setRetiradaQtd] = useState("1");
  const [retiradaLoading, setRetiradaLoading] = useState(false);

  // PDF / share loading
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // ── Refresh helpers ──

  async function refreshData() {
    const [ps, rs] = await Promise.all([
      getProdutosAcabados(),
      getRetiradasHoje(),
    ]);
    setProdutos(ps);
    setRetiradasHoje(rs);
  }

  // ── Retiradas lookup ──
  // Map produto_id → total qty retirada today
  const retiradasMap = retiradasHoje.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.produto_id] = (acc[r.produto_id] ?? 0) + r.quantidade;
      return acc;
    },
    {}
  );

  // ── Open modals ──

  async function openNovoProduto() {
    setNovoProdutoNome("");
    setNovoProdutoLoteId("");
    setNovoProdutoEstoqueInicial("0");
    setNovoProdutoEstoqueSeg("0");
    setModalError(null);
    setModal("novoProduto");
    setLotesLoading(true);
    try {
      const lotes = await getLotesConcluidos();
      setLotesConcluidos(lotes);
    } catch {
      // non-fatal — lote field stays empty
    } finally {
      setLotesLoading(false);
    }
  }

  function openRetirada(produto: ProdutoAcabadoWithFlag) {
    setRetiradaProduto(produto);
    setRetiradaQtd("1");
    setModalError(null);
    setModal("retirada");
  }

  function openRelatorio() {
    setModalError(null);
    setModal("relatorio");
  }

  function closeModal() {
    setModal(null);
    setModalError(null);
  }

  // ── Actions ──

  async function handleSaveNovoProduto() {
    if (!novoProdutoNome.trim())
      return setModalError("Nome é obrigatório.");
    const estoqueInicialNum = parseInt(novoProdutoEstoqueInicial, 10);
    const estoqueSegNum = parseInt(novoProdutoEstoqueSeg, 10);
    if (isNaN(estoqueInicialNum) || estoqueInicialNum < 0)
      return setModalError("Estoque inicial deve ser um número inteiro positivo.");
    if (isNaN(estoqueSegNum) || estoqueSegNum < 0)
      return setModalError("Estoque de segurança deve ser um número inteiro positivo.");
    setModalError(null);
    setSaveLoading(true);
    try {
      await createProdutoAcabado(
        novoProdutoNome.trim(),
        novoProdutoLoteId || null,
        estoqueInicialNum,
        estoqueSegNum
      );
      closeModal();
      await refreshData();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao criar produto.");
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleConfirmarRetirada() {
    if (!retiradaProduto) return;
    const qtdNum = parseInt(retiradaQtd, 10);
    if (isNaN(qtdNum) || qtdNum <= 0)
      return setModalError("Quantidade deve ser maior que zero.");
    if (qtdNum > retiradaProduto.estoque_atual)
      return setModalError("Quantidade maior que o estoque disponível.");
    setModalError(null);
    setRetiradaLoading(true);
    try {
      await registrarRetirada(retiradaProduto.id, qtdNum);
      closeModal();
      await refreshData();
    } catch (e) {
      setModalError(
        e instanceof Error ? e.message : "Erro ao registrar retirada."
      );
    } finally {
      setRetiradaLoading(false);
    }
  }

  // ── Report helpers ──

  function buildReportLines(): string[] {
    if (retiradasHoje.length === 0) return [];
    return retiradasHoje.map(
      (r) =>
        `${r.produtos_acabados?.nome ?? "—"}: ${r.quantidade} UND`
    );
  }

  function buildReportText(): string {
    const lines = buildReportLines();
    const header = `Relatório de Transferência - ${todayDisplay()}`;
    const footer = "Ibisist - Sistema de Gestão Ibilimp";
    if (lines.length === 0)
      return `${header}\n\nNenhuma retirada registada hoje.\n\n${footer}`;
    return `${header}\n\n${lines.join("\n")}\n\n${footer}`;
  }

  async function handleBaixarPdf() {
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      const today = todayDisplay();
      const lines = buildReportLines();

      doc.setFontSize(16);
      doc.setTextColor(26, 58, 107);
      doc.text("Relatório de Transferência", 20, 20);

      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.text(`Data: ${today}`, 20, 30);

      doc.setDrawColor(21, 101, 192);
      doc.line(20, 34, 190, 34);

      doc.setFontSize(12);
      doc.setTextColor(30, 30, 30);

      if (lines.length === 0) {
        doc.text("Nenhuma retirada registada hoje.", 20, 44);
      } else {
        let y = 44;
        lines.forEach((line) => {
          doc.text(line, 20, y);
          y += 8;
        });
      }

      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(
        "Ibisist - Sistema de Gestão Ibilimp",
        20,
        pageHeight - 10
      );

      doc.save(`relatorio-transferencia-${todayStr()}.pdf`);
    } catch (e) {
      setModalError(
        e instanceof Error ? e.message : "Erro ao gerar PDF."
      );
    } finally {
      setPdfLoading(false);
    }
  }

  async function handlePartilhar() {
    setShareLoading(true);
    try {
      const text = buildReportText();
      if (navigator.share) {
        await navigator.share({
          title: "Relatório de Transferência",
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Texto copiado para a área de transferência.");
      }
    } catch {
      // user cancelled share or clipboard failed — silently ignore
    } finally {
      setShareLoading(false);
    }
  }

  function handleWhatsapp() {
    const text = buildReportText();
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ color: "#1A3A6B" }}>
          Produto Acabado
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={openRelatorio}
            className="px-4 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition"
            style={{ backgroundColor: "#1565C0" }}
          >
            Relatório de Transferência
          </button>
          <button
            onClick={openNovoProduto}
            className="px-4 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition"
            style={{ backgroundColor: "#1565C0" }}
          >
            + Novo Produto
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg shadow">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ backgroundColor: "#1565C0" }}>
              {[
                "Produto Acabado",
                "Estoque",
                "Est. Segurança",
                "Retirada",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left text-white font-bold px-4 py-4"
                  style={{ fontSize: 13 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {produtos.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="text-center py-10 text-gray-400"
                >
                  Nenhum produto cadastrado.
                </td>
              </tr>
            )}
            {produtos.map((p, idx) => {
              const qtdHoje = retiradasMap[p.id] ?? 0;
              const rowBg = p.estoque_baixo
                ? "#FFF3CD"
                : idx % 2 === 0
                ? "#F0F7FF"
                : "#ffffff";

              return (
                <tr key={p.id} style={{ backgroundColor: rowBg }}>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex-shrink-0"
                        style={{ color: "#1565C0", fontSize: 16, lineHeight: 1 }}
                      >●</span>
                      <span className="font-medium text-gray-800" style={{ fontSize: 14 }}>
                        {p.nome}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-700" style={{ fontSize: 14 }}>
                    {p.estoque_atual}
                  </td>
                  <td className="px-4 py-4 text-gray-700" style={{ fontSize: 14 }}>
                    {p.estoque_seguranca}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => openRetirada(p)}
                      className="text-sm font-bold transition"
                      style={
                        qtdHoje > 0
                          ? {
                              backgroundColor: "#1565C0",
                              color: "#fff",
                              border: "none",
                              borderRadius: 9999,
                              minWidth: 80,
                              height: 36,
                              padding: "0 12px",
                              fontWeight: 700,
                            }
                          : {
                              backgroundColor: "transparent",
                              color: "#1565C0",
                              border: "2px solid #93C5FD",
                              borderRadius: 9999,
                              minWidth: 80,
                              height: 36,
                              padding: "0 12px",
                            }
                      }
                    >
                      {qtdHoje > 0 ? (
                        <strong>{qtdHoje} UND</strong>
                      ) : (
                        "Registar"
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Novo Produto ── */}
      {modal === "novoProduto" && (
        <Modal title="Novo Produto Acabado" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <Field label="Nome *">
              <input
                className={inputCls}
                value={novoProdutoNome}
                onChange={(e) => setNovoProdutoNome(e.target.value)}
                placeholder="Ex: Detergente 1L"
              />
            </Field>

            <Field label="Lote (opcional)">
              {lotesLoading ? (
                <p className="text-xs text-gray-400 py-1">
                  Carregando lotes...
                </p>
              ) : (
                <select
                  className={inputCls}
                  value={novoProdutoLoteId}
                  onChange={(e) => setNovoProdutoLoteId(e.target.value)}
                >
                  <option value="">— Sem lote —</option>
                  {lotesConcluidos.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.numero_lote} — {l.formulas?.nome ?? l.formula_id}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Estoque Inicial *">
              <input
                className={inputCls}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={novoProdutoEstoqueInicial}
                onChange={(e) =>
                  setNovoProdutoEstoqueInicial(e.target.value.replace(/\D/g, ""))
                }
              />
            </Field>

            <Field label="Estoque de Segurança *">
              <input
                className={inputCls}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={novoProdutoEstoqueSeg}
                onChange={(e) =>
                  setNovoProdutoEstoqueSeg(e.target.value.replace(/\D/g, ""))
                }
              />
            </Field>

            <ErrorMsg msg={modalError} />

            <div className="flex gap-3 pt-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveNovoProduto}
                disabled={saveLoading}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0" }}
              >
                {saveLoading ? "Salvando..." : "SALVAR"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Registar Retirada ── */}
      {modal === "retirada" && retiradaProduto && (
        <Modal title="Registar Retirada" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <div
              className="rounded-lg px-4 py-3"
              style={{ backgroundColor: "#E3F2FD" }}
            >
              <p className="font-semibold text-sm" style={{ color: "#1A3A6B" }}>
                {retiradaProduto.nome}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                Estoque atual:{" "}
                <strong>{retiradaProduto.estoque_atual}</strong>
              </p>
            </div>

            <Field label="Quantidade *">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRetiradaQtd((v) =>
                      String(Math.max(1, parseInt(v, 10) - 1))
                    )
                  }
                  disabled={parseInt(retiradaQtd, 10) <= 1}
                  className="flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition font-bold text-gray-700 text-lg"
                  style={{ minWidth: 40, minHeight: 40 }}
                >
                  −
                </button>
                <input
                  className={`${inputCls} text-center font-semibold`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={retiradaQtd}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setRetiradaQtd(raw);
                  }}
                  onBlur={() => {
                    const n = parseInt(retiradaQtd, 10);
                    if (isNaN(n) || n < 1) setRetiradaQtd("1");
                    else if (n > retiradaProduto.estoque_atual)
                      setRetiradaQtd(String(retiradaProduto.estoque_atual));
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setRetiradaQtd((v) =>
                      String(
                        Math.min(
                          retiradaProduto.estoque_atual,
                          parseInt(v, 10) + 1
                        )
                      )
                    )
                  }
                  disabled={
                    parseInt(retiradaQtd, 10) >= retiradaProduto.estoque_atual
                  }
                  style={{
                    width: "32px", height: "32px", minWidth: "32px", minHeight: "32px",
                    borderRadius: "50%", border: "none", background: "white", color: "#1565C0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "20px", fontWeight: "700", flexShrink: 0,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    opacity: parseInt(retiradaQtd, 10) >= retiradaProduto.estoque_atual ? 0.4 : 1,
                    cursor: parseInt(retiradaQtd, 10) >= retiradaProduto.estoque_atual ? "not-allowed" : "pointer",
                  }}
                >
                  +
                </button>
              </div>
            </Field>

            {parseInt(retiradaQtd, 10) > retiradaProduto.estoque_atual && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
                Quantidade maior que o estoque disponível.
              </p>
            )}

            <ErrorMsg msg={modalError} />

            <div className="flex gap-3 pt-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
              >
                CANCELAR
              </button>
              <button
                onClick={handleConfirmarRetirada}
                disabled={
                  retiradaLoading ||
                  parseInt(retiradaQtd, 10) > retiradaProduto.estoque_atual
                }
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0" }}
              >
                {retiradaLoading ? "Confirmando..." : "CONFIRMAR"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Relatório de Transferência ── */}
      {modal === "relatorio" && (
        <Modal title="Relatório de Transferência" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Data: <strong>{todayDisplay()}</strong>
            </p>

            {retiradasHoje.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                Nenhuma retirada registada hoje.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {retiradasHoje.map((r) => (
                  <li
                    key={r.id}
                    className="flex justify-between py-2 text-sm text-gray-700"
                  >
                    <span>{r.produtos_acabados?.nome ?? "—"}</span>
                    <span className="font-semibold">
                      {r.quantidade} UND
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p
              className="text-xs text-center pt-1"
              style={{ color: "#607D8B" }}
            >
              Ibisist - Sistema de Gestão Ibilimp
            </p>

            <ErrorMsg msg={modalError} />

            <div className="flex gap-2 flex-wrap pt-2">
              <button
                onClick={handleBaixarPdf}
                disabled={pdfLoading}
                className="flex-1 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0" }}
              >
                {pdfLoading ? "Gerando..." : "BAIXAR PDF"}
              </button>
              <button
                onClick={handlePartilhar}
                disabled={shareLoading}
                className="flex-1 py-2 rounded text-sm font-semibold hover:bg-gray-100 transition disabled:opacity-60 border border-gray-300 text-gray-700"
              >
                {shareLoading ? "..." : "PARTILHAR"}
              </button>
              <button
                onClick={handleWhatsapp}
                className="flex-1 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition"
                style={{ backgroundColor: "#25D366" }}
              >
                WHATSAPP
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
