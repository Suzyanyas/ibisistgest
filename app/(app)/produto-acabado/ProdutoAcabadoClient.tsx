"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Search } from "lucide-react";
import {
  getProdutosAcabados,
  createProdutoAcabado,
  registrarRetirada,
  ajustarProdutoAcabado,
  getRetiradasHoje,
  getRetiradasPorData,
  getHistoricoProduto,
  type ProdutoAcabadoWithFlag,
  type RetiradasHoje,
  type HistoricoProdutoItem,
  type OrigemProduto,
} from "@/app/actions/produto-acabado";
import { getFormulasList, type FormulaBasic } from "@/app/actions/producao";
import { hojeFortaleza, formatarDataBR } from "@/lib/fortaleza";

function formatDataEnvase(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) +
    " " +
    d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Fortaleza",
    })
  );
}

// ─── Tamanhos ─────────────────────────────────────────────────────────────────

type SizeKey = "200ml" | "500ml" | "1l" | "2l" | "5l" | "20l";

const SIZES: { key: SizeKey; label: string }[] = [
  { key: "200ml", label: "200 ML" },
  { key: "500ml", label: "500 ML" },
  { key: "1l", label: "1L" },
  { key: "2l", label: "2L" },
  { key: "5l", label: "5L" },
  { key: "20l", label: "20L" },
];

type SizeValues = Record<SizeKey, number>;
type SizeStrings = Record<SizeKey, string>;

const ZERO: SizeValues = { "200ml": 0, "500ml": 0, "1l": 0, "2l": 0, "5l": 0, "20l": 0 };
const ZERO_STR: SizeStrings = {
  "200ml": "0",
  "500ml": "0",
  "1l": "0",
  "2l": "0",
  "5l": "0",
  "20l": "0",
};

function estoquePorTamanho(p: ProdutoAcabadoWithFlag): SizeValues {
  return {
    "200ml": p.estoque_200ml ?? 0,
    "500ml": p.estoque_500ml ?? 0,
    "1l": p.estoque_1l ?? 0,
    "2l": p.estoque_2l ?? 0,
    "5l": p.estoque_5l ?? 0,
    "20l": p.estoque_20l ?? 0,
  };
}

function retiradaPorTamanho(r: RetiradasHoje): SizeValues {
  return {
    "200ml": r.qtd_200ml ?? 0,
    "500ml": r.qtd_500ml ?? 0,
    "1l": r.qtd_1l ?? 0,
    "2l": r.qtd_2l ?? 0,
    "5l": r.qtd_5l ?? 0,
    "20l": r.qtd_20l ?? 0,
  };
}

type LinhaRelatorio = {
  produto_id: string;
  nome: string;
  tamanhos: { label: string; qtd: number }[];
  total: number;
};

// Uma linha por produto, somando todas as retiradas do dia
function agruparRetiradas(rows: RetiradasHoje[]): LinhaRelatorio[] {
  const map = new Map<string, { nome: string; soma: SizeValues }>();
  for (const r of rows) {
    const item = map.get(r.produto_id) ?? {
      nome: r.produtos_acabados?.nome ?? "—",
      soma: { ...ZERO },
    };
    const q = retiradaPorTamanho(r);
    for (const s of SIZES) item.soma[s.key] += q[s.key];
    map.set(r.produto_id, item);
  }
  return Array.from(map.entries()).map(([produto_id, { nome, soma }]) => {
    const tamanhos = SIZES.filter((s) => soma[s.key] > 0).map((s) => ({
      label: s.label,
      qtd: soma[s.key],
    }));
    return { produto_id, nome, tamanhos, total: tamanhos.reduce((a, t) => a + t.qtd, 0) };
  });
}

function descreverLinha(l: LinhaRelatorio): string {
  const partes = l.tamanhos.map((t) => `${t.label}: ${t.qtd}`).join(", ");
  return `${l.nome}: ${partes} (Total: ${l.total} UND)`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className={`bg-white w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}
        style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ backgroundColor: "#1565C0", borderRadius: "12px 12px 0 0" }}
        >
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="modal-close text-white text-2xl leading-none"
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

type ModalType =
  | null
  | "novoProduto"
  | "retirada"
  | "relatorio"
  | "historico"
  | "inventario";

export default function ProdutoAcabadoClient({
  initialProdutos,
  initialRetiradasHoje,
  isAdmin,
  focusId,
}: {
  initialProdutos: ProdutoAcabadoWithFlag[];
  initialRetiradasHoje: RetiradasHoje[];
  isAdmin: boolean;
  focusId: string | null;
}) {
  const router = useRouter();
  const [produtos, setProdutos] =
    useState<ProdutoAcabadoWithFlag[]>(initialProdutos);
  const [destaqueId, setDestaqueId] = useState<string | null>(
    focusId && initialProdutos.some((p) => p.id === focusId) ? focusId : null
  );
  const focoTratado = useRef(false);

  // Pendências do dashboard: ?focus=<produtoId> destaca a linha do produto
  useEffect(() => {
    if (!focusId || focoTratado.current) return;
    focoTratado.current = true;
    if (produtos.some((p) => p.id === focusId)) {
      requestAnimationFrame(() => {
        document
          .getElementById(`produto-${focusId}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      setTimeout(() => setDestaqueId(null), 4000);
    }
    router.replace("/produto-acabado", { scroll: false });
  }, [focusId, produtos, router]);
  const [retiradasHoje, setRetiradasHoje] =
    useState<RetiradasHoje[]>(initialRetiradasHoje);

  const [searchQuery, setSearchQuery] = useState("");
  const normalize = (str: string) =>
    str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filteredProdutos = produtos.filter((p) =>
    normalize(p.nome).includes(normalize(searchQuery))
  );

  const [modal, setModal] = useState<ModalType>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Novo produto state
  const [novoProdutoNome, setNovoProdutoNome] = useState("");
  const [novoProdutoSizes, setNovoProdutoSizes] = useState<SizeStrings>({ ...ZERO_STR });
  const [novoProdutoEstoqueSeg, setNovoProdutoEstoqueSeg] = useState("0");
  const [novoProdutoOrigem, setNovoProdutoOrigem] = useState<"" | OrigemProduto>("");
  const [novoProdutoObs, setNovoProdutoObs] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [novoProdutoFormulaId, setNovoProdutoFormulaId] = useState("");
  const [formulas, setFormulas] = useState<FormulaBasic[]>([]);
  const [formulasLoading, setFormulasLoading] = useState(false);

  // Retirada state
  const [retiradaProduto, setRetiradaProduto] =
    useState<ProdutoAcabadoWithFlag | null>(null);
  const [ret, setRet] = useState<SizeValues>({ ...ZERO });
  const [retObs, setRetObs] = useState("");
  const [retiradaLoading, setRetiradaLoading] = useState(false);

  // Inventário state
  const [invProduto, setInvProduto] = useState<ProdutoAcabadoWithFlag | null>(null);
  const [invSizes, setInvSizes] = useState<SizeStrings>({ ...ZERO_STR });
  const [invObs, setInvObs] = useState("");
  const [invLoading, setInvLoading] = useState(false);

  // Relatório state
  const [relatorioData, setRelatorioData] = useState(hojeFortaleza());
  const [relatorioRows, setRelatorioRows] = useState<RetiradasHoje[]>([]);
  const [relatorioLoading, setRelatorioLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // Historico state
  const [historicoProdutoNome, setHistoricoProdutoNome] = useState<string>("");
  const [historicoProduto, setHistoricoProduto] = useState<HistoricoProdutoItem[] | null>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoError, setHistoricoError] = useState<string | null>(null);

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
    setNovoProdutoFormulaId("");
    setNovoProdutoSizes({ ...ZERO_STR });
    setNovoProdutoEstoqueSeg("0");
    setNovoProdutoOrigem("");
    setNovoProdutoObs("");
    setModalError(null);
    setModal("novoProduto");
    setFormulasLoading(true);
    try {
      const fs = await getFormulasList();
      setFormulas(fs);
    } catch {
      // non-fatal — formula select stays empty
    } finally {
      setFormulasLoading(false);
    }
  }

  function openRetirada(produto: ProdutoAcabadoWithFlag) {
    setRetiradaProduto(produto);
    setRet({ ...ZERO });
    setRetObs("");
    setModalError(null);
    setModal("retirada");
  }

  function openInventario(produto: ProdutoAcabadoWithFlag) {
    const atual = estoquePorTamanho(produto);
    const strs = { ...ZERO_STR };
    for (const s of SIZES) strs[s.key] = String(atual[s.key]);
    setInvProduto(produto);
    setInvSizes(strs);
    setInvObs("");
    setModalError(null);
    setModal("inventario");
  }

  async function carregarRelatorio(data: string) {
    setRelatorioLoading(true);
    setModalError(null);
    try {
      setRelatorioRows(await getRetiradasPorData(data));
    } catch (e) {
      setRelatorioRows([]);
      setModalError(e instanceof Error ? e.message : "Erro ao carregar retiradas.");
    } finally {
      setRelatorioLoading(false);
    }
  }

  function openRelatorio() {
    const hoje = hojeFortaleza();
    setRelatorioData(hoje);
    setRelatorioRows([]);
    setModal("relatorio");
    carregarRelatorio(hoje);
  }

  async function openHistorico(produto: ProdutoAcabadoWithFlag) {
    setHistoricoProdutoNome(produto.nome);
    setHistoricoProduto(null);
    setHistoricoError(null);
    setModal("historico");
    setHistoricoLoading(true);
    try {
      const data = await getHistoricoProduto(produto.id);
      setHistoricoProduto(data);
    } catch (e) {
      setHistoricoError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
    } finally {
      setHistoricoLoading(false);
    }
  }

  function closeModal() {
    setModal(null);
    setModalError(null);
  }

  // ── Actions ──

  async function handleSaveNovoProduto() {
    if (!novoProdutoNome.trim())
      return setModalError("Nome é obrigatório.");
    if (!novoProdutoFormulaId)
      return setModalError("Selecione a fórmula correspondente a este produto.");
    if (!novoProdutoOrigem)
      return setModalError("Selecione a origem do produto.");
    if (novoProdutoOrigem === "produto_de_fora" && !novoProdutoObs.trim())
      return setModalError("Informe a observação para produto de fora (ex.: revenda, fornecedor X).");
    const estoqueSegNum = parseInt(novoProdutoEstoqueSeg, 10);
    if (isNaN(estoqueSegNum) || estoqueSegNum < 0)
      return setModalError("Estoque de segurança deve ser um número inteiro positivo.");
    const n = (k: SizeKey) => parseInt(novoProdutoSizes[k], 10) || 0;
    setModalError(null);
    setSaveLoading(true);
    try {
      const r = await createProdutoAcabado({
        nome: novoProdutoNome.trim(),
        formula_id: novoProdutoFormulaId,
        estoque_seguranca: estoqueSegNum,
        estoque_200ml: n("200ml"),
        estoque_500ml: n("500ml"),
        estoque_1l: n("1l"),
        estoque_2l: n("2l"),
        estoque_5l: n("5l"),
        estoque_20l: n("20l"),
        origem: novoProdutoOrigem,
        obs: novoProdutoObs.trim(),
      });
      if (!r.ok) {
        setModalError(r.error);
        return;
      }
      closeModal();
      await refreshData();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao criar produto.");
    } finally {
      setSaveLoading(false);
    }
  }

  const retTotal = SIZES.reduce((a, s) => a + ret[s.key], 0);

  async function handleConfirmarRetirada() {
    if (!retiradaProduto) return;
    if (retTotal <= 0)
      return setModalError("Selecione pelo menos uma unidade.");
    setModalError(null);
    setRetiradaLoading(true);
    try {
      const r = await registrarRetirada(
        retiradaProduto.id,
        ret["1l"],
        ret["2l"],
        ret["5l"],
        ret["20l"],
        ret["200ml"],
        ret["500ml"],
        retObs
      );
      if (!r.ok) {
        setModalError(r.error);
        return;
      }
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

  async function handleConfirmarInventario() {
    if (!invProduto) return;
    if (!invObs.trim()) return setModalError("A observação é obrigatória.");
    const n = (k: SizeKey) => parseInt(invSizes[k], 10) || 0;
    setModalError(null);
    setInvLoading(true);
    try {
      const r = await ajustarProdutoAcabado(
        invProduto.id,
        n("1l"),
        n("2l"),
        n("5l"),
        n("20l"),
        n("200ml"),
        n("500ml"),
        invObs.trim()
      );
      if (!r.ok) {
        setModalError(r.error);
        return;
      }
      closeModal();
      await refreshData();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Erro ao ajustar estoque.");
    } finally {
      setInvLoading(false);
    }
  }

  // ── Report helpers ──

  const relatorioLinhas = agruparRetiradas(relatorioRows);

  function buildReportText(): string {
    const header = `Relatório de Transferência - ${formatarDataBR(relatorioData)}`;
    const footer = "Ibisist - Sistema de Gestão Ibilimp";
    if (relatorioLinhas.length === 0)
      return `${header}\n\nNenhuma retirada registada nesta data.\n\n${footer}`;
    return `${header}\n\n${relatorioLinhas.map(descreverLinha).join("\n")}\n\n${footer}`;
  }

  async function handleBaixarPdf() {
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.setTextColor(26, 58, 107);
      doc.text("Relatório de Transferência", 20, 20);

      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.text(`Data: ${formatarDataBR(relatorioData)}`, 20, 30);

      doc.setDrawColor(21, 101, 192);
      doc.line(20, 34, 190, 34);

      doc.setFontSize(12);
      doc.setTextColor(30, 30, 30);

      if (relatorioLinhas.length === 0) {
        doc.text("Nenhuma retirada registada nesta data.", 20, 44);
      } else {
        let y = 44;
        const pageHeight = doc.internal.pageSize.getHeight();
        relatorioLinhas.forEach((l) => {
          const wrapped = doc.splitTextToSize(descreverLinha(l), 170) as string[];
          if (y + wrapped.length * 6 > pageHeight - 20) {
            doc.addPage();
            y = 20;
          }
          doc.text(wrapped, 20, y);
          y += wrapped.length * 6 + 2;
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

      doc.save(`relatorio-transferencia-${relatorioData}.pdf`);
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

  const tableHeaders = [
    "Produto",
    ...SIZES.map((s) => s.label),
    "Total",
    "Est. Seg.",
    "Retirada",
  ];

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

      {/* Search */}
      <div className="mb-4 relative bg-white shadow-sm rounded-lg">
        <Search
          size={16}
          color="#9CA3AF"
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar produto..."
          className="w-full rounded-lg border border-gray-200 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          style={{ paddingLeft: 36, paddingRight: searchQuery ? 36 : 16 }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            aria-label="Limpar pesquisa"
            className="text-gray-400 hover:text-gray-600"
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              background: "none",
              border: "none",
            }}
          >
            &times;
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto rounded-lg shadow max-h-[calc(100vh-200px)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr
              className="sticky top-0 z-10"
              style={{
                background: "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)",
                boxShadow: "0 2px 8px rgba(21,101,192,0.2)",
              }}
            >
              {tableHeaders.map((h) => (
                <th
                  key={h}
                  className="text-left text-white font-bold px-4 py-4"
                  style={{
                    fontSize: 13,
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                    textAlign: h === "Produto" || h === "Retirada" ? "left" : "right",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredProdutos.length === 0 && (
              <tr className="table-row-hover">
                <td
                  colSpan={tableHeaders.length}
                  className="text-center py-10 text-gray-400"
                >
                  {searchQuery
                    ? `Nenhum produto encontrado para '${searchQuery}'`
                    : "Nenhum produto cadastrado."}
                </td>
              </tr>
            )}
            {filteredProdutos.map((p, idx) => {
              const qtdHoje = retiradasMap[p.id] ?? 0;
              const estoque = estoquePorTamanho(p);
              const rowBg = p.estoque_baixo
                ? "#FFF3CD"
                : idx % 2 === 0
                ? "#F0F7FF"
                : "#ffffff";

              return (
                <tr
                  key={p.id}
                  id={`produto-${p.id}`}
                  className="table-row-hover"
                  style={{
                    backgroundColor: p.id === destaqueId ? "#BBDEFB" : rowBg,
                    transition: "background-color 0.6s",
                    ...(p.id === destaqueId
                      ? { outline: "2px solid #1565C0", outlineOffset: -2 }
                      : p.estoque_baixo
                      ? { borderLeft: "3px solid #F59E0B" }
                      : {}),
                  }}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: p.estoque_baixo ? "#F59E0B" : "#1565C0",
                          marginRight: 8,
                          flexShrink: 0,
                          verticalAlign: "middle",
                        }}
                      />
                      <button
                        onClick={() => openHistorico(p)}
                        title="Ver histórico de lotes"
                        className="font-medium text-left hover:underline transition inline-flex items-center"
                        style={{ fontSize: 14, color: "#1565C0", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        {p.nome}
                        <History size={14} style={{ color: "#1565C0", marginLeft: 6, flexShrink: 0 }} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => openInventario(p)}
                          title="Ajustar estoque (inventário)"
                          className="text-xs font-semibold hover:underline"
                          style={{ color: "#6B7A99", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: 8 }}
                        >
                          Inventário
                        </button>
                      )}
                    </div>
                  </td>
                  {SIZES.map((s) => (
                    <td key={s.key} className="px-4 py-4 text-gray-700" style={{ fontSize: 14, textAlign: "right" }}>
                      {estoque[s.key]}
                    </td>
                  ))}
                  <td
                    className="px-4 py-4 font-semibold"
                    style={{
                      fontSize: 14,
                      textAlign: "right",
                      fontWeight: p.estoque_baixo ? 700 : 600,
                      color: p.estoque_baixo ? "#D97706" : "#1565C0",
                    }}
                  >
                    {p.estoque_atual}
                  </td>
                  <td className="px-4 py-4 text-gray-700" style={{ fontSize: 14, textAlign: "right" }}>
                    {p.estoque_seguranca}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => openRetirada(p)}
                      className="text-sm font-bold transition hover:shadow-md hover:scale-105 transition-all active:scale-95"
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
                        <span className="inline-flex items-center gap-1.5">
                          <span className="animate-pulse" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: "#4ADE80" }} />
                          <strong>{qtdHoje} UND</strong>
                        </span>
                      ) : (
                        "Registrar"
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
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{ backgroundColor: "#FFF3CD", color: "#7A5300" }}
            >
              Produtos feitos na fábrica nascem no Envase. Use esta opção só para o que já existia ou não foi produzido aqui.
            </p>

            <Field label="Origem do produto *">
              <select
                className={inputCls}
                value={novoProdutoOrigem}
                onChange={(e) => setNovoProdutoOrigem(e.target.value as "" | OrigemProduto)}
              >
                <option value="">— Selecione —</option>
                <option value="estoque_inicial">Estoque inicial (já existia antes do sistema)</option>
                <option value="produto_de_fora">Produto de fora (revenda ou lote anterior ao sistema)</option>
              </select>
            </Field>

            <Field
              label={
                novoProdutoOrigem === "produto_de_fora"
                  ? "Observação *"
                  : "Observação"
              }
            >
              <input
                className={inputCls}
                value={novoProdutoObs}
                onChange={(e) => setNovoProdutoObs(e.target.value)}
                placeholder="Ex.: Revenda, fornecedor X"
              />
            </Field>

            <Field label="Nome *">
              <input
                className={inputCls}
                value={novoProdutoNome}
                onChange={(e) => setNovoProdutoNome(e.target.value)}
                placeholder="Ex: Detergente 1L"
              />
            </Field>

            <Field label="Fórmula *">
              {formulasLoading ? (
                <p className="text-xs text-gray-400 py-1">
                  Carregando fórmulas...
                </p>
              ) : (
                <select
                  className={inputCls}
                  value={novoProdutoFormulaId}
                  onChange={(e) => setNovoProdutoFormulaId(e.target.value)}
                >
                  <option value="">— Selecione —</option>
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome} ({f.sigla})
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <p className="text-sm font-semibold" style={{ color: "#1A3A6B" }}>Estoque Inicial por Tamanho</p>
            <div className="grid grid-cols-2 gap-3">
              {SIZES.map((s) => (
                <Field key={s.key} label={s.label}>
                  <input
                    className={inputCls}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={novoProdutoSizes[s.key]}
                    onChange={(e) =>
                      setNovoProdutoSizes((prev) => ({
                        ...prev,
                        [s.key]: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                </Field>
              ))}
            </div>

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

      {/* ── Modal: Registrar Retirada ── */}
      {modal === "retirada" && retiradaProduto && (() => {
        const estoque = estoquePorTamanho(retiradaProduto);
        return (
        <Modal title="Registrar Retirada" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <div
              className="rounded-lg px-4 py-3"
              style={{ backgroundColor: "#E3F2FD" }}
            >
              <p className="font-semibold text-sm" style={{ color: "#1A3A6B" }}>
                {retiradaProduto.nome}
              </p>
              <div className="flex gap-3 flex-wrap text-xs text-gray-600 mt-1">
                {SIZES.map((s) => (
                  <span key={s.key}>{s.label}: <strong>{estoque[s.key]}</strong></span>
                ))}
              </div>
            </div>

            {SIZES.map((s) => {
              const max = estoque[s.key];
              const value = ret[s.key];
              const set = (v: number) => setRet((prev) => ({ ...prev, [s.key]: v }));
              return (
              <Field key={s.key} label={`${s.label} (disponível: ${max})`}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => set(Math.max(0, value - 1))}
                    disabled={value <= 0}
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
                    value={value}
                    disabled={max <= 0}
                    onChange={(e) => {
                      const raw = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      set(isNaN(raw) ? 0 : Math.min(raw, max));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => set(Math.min(max, value + 1))}
                    disabled={value >= max}
                    className="btn-icon"
                    style={{
                      width: "32px", height: "32px", minWidth: "32px", minHeight: "32px",
                      borderRadius: "50%", border: "none", background: "white", color: "#1565C0",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "20px", fontWeight: "700", flexShrink: 0,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                      opacity: value >= max ? 0.4 : 1,
                      cursor: value >= max ? "not-allowed" : "pointer",
                    }}
                  >
                    +
                  </button>
                </div>
              </Field>
              );
            })}

            <Field label="Observação (opcional)">
              <input
                className={inputCls}
                value={retObs}
                onChange={(e) => setRetObs(e.target.value)}
                placeholder="Ex.: Entrega ao cliente X"
              />
            </Field>

            <p className="text-sm font-semibold text-center" style={{ color: "#1A3A6B" }}>
              Total: {retTotal} unidades
            </p>

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
                disabled={retiradaLoading || retTotal <= 0}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0" }}
              >
                {retiradaLoading ? "Confirmando..." : "CONFIRMAR"}
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* ── Modal: Inventário (admin) ── */}
      {modal === "inventario" && invProduto && isAdmin && (() => {
        const atual = estoquePorTamanho(invProduto);
        return (
        <Modal title={`Inventário: ${invProduto.nome}`} onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ color: "#6B7A99" }}>
                  <th className="text-left py-1">Tamanho</th>
                  <th className="text-right py-1">Atual</th>
                  <th className="text-right py-1 pl-3">Novo</th>
                </tr>
              </thead>
              <tbody>
                {SIZES.map((s) => {
                  const novo = parseInt(invSizes[s.key], 10) || 0;
                  return (
                    <tr key={s.key}>
                      <td className="py-1 font-medium" style={{ color: "#1A3A6B" }}>{s.label}</td>
                      <td className="py-1 text-right text-gray-700">{atual[s.key]}</td>
                      <td className="py-1 pl-3">
                        <input
                          className={`${inputCls} text-right`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={invSizes[s.key]}
                          style={novo !== atual[s.key] ? { borderColor: "#F59E0B" } : undefined}
                          onChange={(e) =>
                            setInvSizes((prev) => ({
                              ...prev,
                              [s.key]: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Field label="Observação *">
              <input
                className={inputCls}
                value={invObs}
                onChange={(e) => setInvObs(e.target.value)}
                placeholder="Ex.: Contagem física de 15/10"
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
                onClick={handleConfirmarInventario}
                disabled={invLoading}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0" }}
              >
                {invLoading ? "Confirmando..." : "CONFIRMAR"}
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* ── Modal: Histórico de Lotes ── */}
      {modal === "historico" && (
        <Modal
          title={`Histórico de Lotes: ${historicoProdutoNome}`}
          onClose={closeModal}
          wide
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Produto de destino: <strong>{historicoProdutoNome}</strong>
            </p>
            {historicoLoading && (
              <p className="text-sm text-gray-400 py-2">Carregando...</p>
            )}
            {historicoError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                {historicoError}
              </p>
            )}
            {!historicoLoading && !historicoError && historicoProduto !== null && (
              historicoProduto.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  Nenhum lote envasado para este produto.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #e5e7eb" }}>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: "#1565C0" }}>
                        {["Lote", "Data Envase", ...SIZES.map((s) => s.label), "Rend. Real", "Usuário"].map((h) => (
                          <th
                            key={h}
                            className="text-left text-white font-bold px-3 py-2"
                            style={{ fontSize: 12, whiteSpace: "nowrap" }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historicoProduto.map((env, idx) => (
                        <tr key={env.id} className="table-row-hover" style={{ backgroundColor: idx % 2 === 0 ? "#F0F7FF" : "#ffffff" }}>
                          <td className="px-3 py-2 text-gray-700 font-medium">{env.lotes_producao?.numero_lote ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-700" style={{ whiteSpace: "nowrap" }}>{formatDataEnvase(env.data_envase)}</td>
                          <td className="px-3 py-2 text-gray-700">{env.qtd_200ml ?? 0}</td>
                          <td className="px-3 py-2 text-gray-700">{env.qtd_500ml ?? 0}</td>
                          <td className="px-3 py-2 text-gray-700">{env.qtd_1l ?? 0}</td>
                          <td className="px-3 py-2 text-gray-700">{env.qtd_2l ?? 0}</td>
                          <td className="px-3 py-2 text-gray-700">{env.qtd_5l ?? 0}</td>
                          <td className="px-3 py-2 text-gray-700">{env.qtd_20l ?? 0}</td>
                          <td className="px-3 py-2 font-semibold" style={{ color: "#1565C0", whiteSpace: "nowrap" }}>
                            {env.rendimento_real != null ? `${env.rendimento_real} L` : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600" style={{ whiteSpace: "nowrap" }}>{env.user_email ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
            <div className="flex justify-end pt-2">
              <button
                onClick={closeModal}
                className="px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition"
                style={{ backgroundColor: "#1565C0" }}
              >
                FECHAR
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Relatório de Transferência ── */}
      {modal === "relatorio" && (
        <Modal title="Relatório de Transferência" onClose={closeModal}>
          <div className="flex flex-col gap-4">
            <Field label="Data">
              <input
                className={inputCls}
                type="date"
                value={relatorioData}
                max={hojeFortaleza()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setRelatorioData(v);
                  carregarRelatorio(v);
                }}
              />
            </Field>
            <p className="text-xs text-gray-500">
              Data: <strong>{formatarDataBR(relatorioData)}</strong>
            </p>

            {relatorioLoading ? (
              <p className="text-sm text-gray-400 py-2">Carregando...</p>
            ) : relatorioLinhas.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                Nenhuma retirada registada nesta data.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {relatorioLinhas.map((l) => (
                  <li
                    key={l.produto_id}
                    className="flex justify-between gap-3 py-2 text-sm text-gray-700"
                  >
                    <span>
                      <strong>{l.nome}</strong>
                      <br />
                      <span className="text-xs text-gray-500">
                        {l.tamanhos.map((t) => `${t.label}: ${t.qtd}`).join(" · ")}
                      </span>
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      {l.total} UND
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
                disabled={pdfLoading || relatorioLoading}
                className="flex-1 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
                style={{ backgroundColor: "#1565C0" }}
              >
                {pdfLoading ? "Gerando..." : "BAIXAR PDF"}
              </button>
              <button
                onClick={handlePartilhar}
                disabled={shareLoading || relatorioLoading}
                className="flex-1 py-2 rounded text-sm font-semibold hover:bg-gray-100 transition disabled:opacity-60 border border-gray-300 text-gray-700"
              >
                {shareLoading ? "..." : "PARTILHAR"}
              </button>
              <button
                onClick={handleWhatsapp}
                disabled={relatorioLoading}
                className="flex-1 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60"
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
