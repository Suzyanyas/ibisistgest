"use client";

import { useEffect, useState } from "react";
import {
  getProdutosParaGestao,
  editarProduto,
  mesclarProdutos,
  arquivarProduto,
  excluirProduto,
  type ProdutoAcabadoWithFlag,
  type ProdutoGestaoInfo,
  type ModoMesclagem,
} from "@/app/actions/produto-acabado";
import { getFormulasList, type FormulaBasic } from "@/app/actions/producao";
import {
  Modal,
  Field,
  ErrorMsg,
  SearchSelect,
  inputCls,
  SIZES,
  type SizeKey,
  type SizeValues,
} from "./shared";

export type GerirAba = "dados" | "mesclar" | "arquivar" | "excluir";

const ABAS: { key: GerirAba; label: string }[] = [
  { key: "dados", label: "Dados" },
  { key: "mesclar", label: "Mesclar" },
  { key: "arquivar", label: "Arquivar" },
  { key: "excluir", label: "Excluir" },
];

function estoqueDe(p: ProdutoGestaoInfo): SizeValues {
  return {
    "200ml": p.estoque_200ml,
    "500ml": p.estoque_500ml,
    "1l": p.estoque_1l,
    "2l": p.estoque_2l,
    "5l": p.estoque_5l,
    "20l": p.estoque_20l,
  };
}

const btnCancelar =
  "px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";
const btnPrimario =
  "px-5 py-2 rounded text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-600";

export default function GerirProdutoModal({
  produtoId,
  abaInicial,
  produtos,
  onClose,
  onDone,
}: {
  produtoId: string;
  abaInicial: GerirAba;
  // Lista da tela, usada para montar as opções do Mesclar
  produtos: ProdutoAcabadoWithFlag[];
  onClose: () => void;
  // Chamado após sucesso: o pai fecha o modal e atualiza a lista
  onDone: () => Promise<void>;
}) {
  const [aba, setAba] = useState<GerirAba>(abaInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [infos, setInfos] = useState<Record<string, ProdutoGestaoInfo>>({});
  const [formulas, setFormulas] = useState<FormulaBasic[]>([]);

  // Dados
  const [nome, setNome] = useState("");
  const [seg, setSeg] = useState("0");
  const [formulaId, setFormulaId] = useState("");

  // Mesclar
  const [origemId, setOrigemId] = useState(produtoId);
  const [destinoId, setDestinoId] = useState("");
  const [modo, setModo] = useState<ModoMesclagem>("somar");
  const [obsMesclar, setObsMesclar] = useState("");
  const [confirmandoMesclar, setConfirmandoMesclar] = useState(false);
  const [carregandoInfo, setCarregandoInfo] = useState(false);

  // Arquivar / Excluir
  const [obsArquivar, setObsArquivar] = useState("");
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [obsExcluir, setObsExcluir] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [r, fs] = await Promise.all([
          getProdutosParaGestao([produtoId]),
          getFormulasList().catch(() => [] as FormulaBasic[]),
        ]);
        if (cancelado) return;
        setFormulas(fs);
        if (!r.ok) {
          setErro(r.error);
          return;
        }
        const p = r.produtos[0];
        if (!p) {
          setErro("Produto acabado não encontrado.");
          return;
        }
        setInfos({ [p.id]: p });
        setNome(p.nome);
        setSeg(String(p.estoque_seguranca));
        setFormulaId(p.formula?.id ?? "");
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro ao carregar o produto.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [produtoId]);

  const p = infos[produtoId] ?? null;

  function trocarAba(a: GerirAba) {
    setAba(a);
    setErro(null);
    setConfirmandoMesclar(false);
  }

  // Executa uma ação do servidor; em sucesso o pai fecha o modal e atualiza a lista
  async function executar(acao: () => Promise<{ ok: true } | { ok: false; error: string }>, falha: string) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await acao();
      if (!r.ok) {
        setErro(r.error);
        setConfirmandoMesclar(false);
        return;
      }
      await onDone();
    } catch (e) {
      setErro(e instanceof Error ? e.message : falha);
      setConfirmandoMesclar(false);
    } finally {
      setOcupado(false);
    }
  }

  // ── Dados ──
  function salvarDados() {
    if (!nome.trim()) return setErro("O nome do produto é obrigatório.");
    const segNum = parseInt(seg, 10);
    if (isNaN(segNum) || segNum < 0) {
      return setErro("O estoque mínimo deve ser um número inteiro maior ou igual a zero.");
    }
    executar(
      () => editarProduto({ id: produtoId, nome, estoque_seguranca: segNum, formula_id: formulaId || null }),
      "Erro ao salvar o produto."
    );
  }

  // ── Mesclar ──
  async function carregarInfos(ids: string[]) {
    const faltando = ids.filter((id) => id && !infos[id]);
    if (faltando.length === 0) return;
    setCarregandoInfo(true);
    try {
      const r = await getProdutosParaGestao(faltando);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setInfos((prev) => {
        const next = { ...prev };
        for (const item of r.produtos) next[item.id] = item;
        return next;
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o produto.");
    } finally {
      setCarregandoInfo(false);
    }
  }

  function escolherOrigem(id: string) {
    setErro(null);
    setConfirmandoMesclar(false);
    setOrigemId(id);
    if (id === destinoId) setDestinoId("");
    carregarInfos([id]);
  }

  function escolherDestino(id: string) {
    setErro(null);
    setConfirmandoMesclar(false);
    setDestinoId(id);
    carregarInfos([id]);
  }

  const origem = infos[origemId] ?? null;
  const destino = infos[destinoId] ?? null;
  const opcoesOrigem = produtos.map((x) => ({ value: x.id, label: x.ativo ? x.nome : `${x.nome} (arquivado)` }));
  const opcoesDestino = produtos
    .filter((x) => x.ativo && x.id !== origemId)
    .map((x) => ({ value: x.id, label: x.nome }));

  const formulasConflitam =
    !!origem?.formula && !!destino?.formula && origem.formula.id !== destino.formula.id;
  const mesclarPronto = !!origem && !!destino && !formulasConflitam && !carregandoInfo;

  function confirmarMesclagem() {
    executar(() => mesclarProdutos(origemId, destinoId, modo, obsMesclar), "Erro ao mesclar os produtos.");
  }

  // ── Arquivar ──
  function alternarArquivo() {
    if (!p) return;
    executar(() => arquivarProduto(produtoId, p.ativo, obsArquivar), "Erro ao atualizar o produto.");
  }

  // ── Excluir ──
  function excluir() {
    executar(() => excluirProduto(produtoId, obsExcluir), "Erro ao excluir o produto.");
  }

  const estoqueP = p ? estoqueDe(p) : null;
  const totalP = estoqueP ? SIZES.reduce((a, s) => a + estoqueP[s.key], 0) : 0;
  const nomeConfere = !!p && nomeDigitado.trim() === p.nome;

  return (
    <Modal title={p ? `Gerir: ${p.nome}` : "Gerir produto"} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {ABAS.map((a) => {
            const ativa = a.key === aba;
            const perigo = a.key === "excluir";
            return (
              <button
                key={a.key}
                role="tab"
                aria-selected={ativa}
                onClick={() => trocarAba(a.key)}
                disabled={ocupado}
                className="px-4 py-2 text-sm font-semibold transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60"
                style={{
                  color: perigo ? "#DC2626" : ativa ? "#1565C0" : "#6B7A99",
                  borderBottom: ativa ? `2px solid ${perigo ? "#DC2626" : "#1565C0"}` : "2px solid transparent",
                  marginBottom: -1,
                  background: "none",
                  cursor: "pointer",
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        {carregando && <p className="text-sm text-gray-400 py-4">Carregando produto...</p>}

        {!carregando && !p && <ErrorMsg msg={erro} />}

        {!carregando && p && aba === "dados" && (
          <>
            <Field label="Nome *">
              <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
            <Field label="Estoque mínimo *">
              <input
                className={inputCls}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={seg}
                onChange={(e) => setSeg(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Fórmula">
              <SearchSelect
                options={formulas.map((f) => ({ value: f.id, label: `${f.nome} (${f.sigla})` }))}
                value={formulaId}
                onChange={setFormulaId}
                emptyLabel="Sem fórmula"
                placeholder="Pesquisar fórmula..."
              />
            </Field>
            <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "#E3F2FD", color: "#1A3A6B" }}>
              As quantidades em estoque não são alteradas aqui. Para corrigi-las, use o Inventário na lista de produtos.
              A fórmula só pode ser trocada se nenhum envase do produto vier de um lote de outra fórmula, e só pode ser
              removida se o produto não tiver envases.
            </p>
            <ErrorMsg msg={erro} />
            <div className="flex gap-3 pt-2 justify-end">
              <button onClick={onClose} disabled={ocupado} className={btnCancelar}>
                CANCELAR
              </button>
              <button
                onClick={salvarDados}
                disabled={ocupado}
                className={btnPrimario}
                style={{ backgroundColor: "#1565C0" }}
              >
                {ocupado ? "Salvando..." : "SALVAR"}
              </button>
            </div>
          </>
        )}

        {!carregando && p && aba === "mesclar" && (
          <>
            <p className="text-sm text-gray-600">
              O produto a remover desaparece da lista. Suas retiradas e seus envases passam para o produto que fica.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Produto a remover">
                <SearchSelect
                  options={opcoesOrigem}
                  value={origemId}
                  onChange={escolherOrigem}
                  placeholder="Pesquisar produto..."
                />
              </Field>
              <Field label="Produto que fica">
                <SearchSelect
                  options={opcoesDestino}
                  value={destinoId}
                  onChange={escolherDestino}
                  placeholder="Pesquisar produto..."
                />
              </Field>
            </div>

            {origem && destino && (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: "#F0F7FF", color: "#1A3A6B" }}>
                        <th className="text-left px-3 py-2 font-semibold"></th>
                        <th className="text-right px-3 py-2 font-semibold">Remover: {origem.nome}</th>
                        <th className="text-right px-3 py-2 font-semibold">Fica: {destino.nome}</th>
                        <th className="text-right px-3 py-2 font-semibold">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-600">Fórmula</td>
                        <td className="px-3 py-2 text-right">{origem.formula ? `Sim (${origem.formula.nome})` : "Não"}</td>
                        <td className="px-3 py-2 text-right">{destino.formula ? `Sim (${destino.formula.nome})` : "Não"}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {(destino.formula ?? origem.formula)?.nome ?? "Sem fórmula"}
                        </td>
                      </tr>
                      {SIZES.map((s: { key: SizeKey; label: string }) => {
                        const o = estoqueDe(origem)[s.key];
                        const d = estoqueDe(destino)[s.key];
                        return (
                          <tr key={s.key} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-600">Estoque {s.label}</td>
                            <td className="px-3 py-2 text-right">{o}</td>
                            <td className="px-3 py-2 text-right">{d}</td>
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: "#1565C0" }}>
                              {modo === "somar" ? o + d : d}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-600">Envases</td>
                        <td className="px-3 py-2 text-right">{origem.envases_count}</td>
                        <td className="px-3 py-2 text-right">{destino.envases_count}</td>
                        <td className="px-3 py-2 text-right font-semibold">{origem.envases_count + destino.envases_count}</td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-600">Retiradas</td>
                        <td className="px-3 py-2 text-right">{origem.retiradas_count}</td>
                        <td className="px-3 py-2 text-right">{destino.retiradas_count}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {origem.retiradas_count + destino.retiradas_count}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {formulasConflitam && (
                  <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                    Os dois produtos têm fórmulas diferentes ({origem.formula?.nome} e {destino.formula?.nome}) e não
                    podem ser mesclados. Ajuste a fórmula de um deles na aba Dados.
                  </p>
                )}

                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium mb-1" style={{ color: "#1A3A6B" }}>
                    O que fazer com os estoques
                  </legend>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="modo-mesclagem"
                      checked={modo === "somar"}
                      onChange={() => {
                        setModo("somar");
                        setConfirmandoMesclar(false);
                      }}
                      className="mt-1"
                    />
                    <span>Somar os estoques</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="modo-mesclagem"
                      checked={modo === "manter_destino"}
                      onChange={() => {
                        setModo("manter_destino");
                        setConfirmandoMesclar(false);
                      }}
                      className="mt-1"
                    />
                    <span>Manter só o estoque do produto que fica (o estoque do outro é descartado)</span>
                  </label>
                </fieldset>

                <Field label="Observação">
                  <input
                    className={inputCls}
                    value={obsMesclar}
                    onChange={(e) => setObsMesclar(e.target.value)}
                    placeholder="Ex.: produtos duplicados"
                  />
                </Field>
              </>
            )}

            {(!origem || !destino) && (
              <p className="text-xs text-gray-400">
                {carregandoInfo ? "Carregando produto..." : "Escolha o produto que fica para ver a comparação."}
              </p>
            )}

            <ErrorMsg msg={erro} />

            {confirmandoMesclar && origem && destino ? (
              <div className="rounded-lg px-4 py-3 flex flex-col gap-3" style={{ backgroundColor: "#FFF3CD", color: "#7A5300" }}>
                <p className="text-sm">
                  Confirma remover <strong>{origem.nome}</strong> e manter <strong>{destino.nome}</strong>?{" "}
                  {modo === "somar"
                    ? "Os estoques serão somados."
                    : "O estoque de quem sai será descartado."}{" "}
                  Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setConfirmandoMesclar(false)} disabled={ocupado} className={btnCancelar}>
                    VOLTAR
                  </button>
                  <button
                    onClick={confirmarMesclagem}
                    disabled={ocupado}
                    className={btnPrimario}
                    style={{ backgroundColor: "#1565C0" }}
                  >
                    {ocupado ? "Mesclando..." : "CONFIRMAR MESCLAGEM"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 pt-2 justify-end">
                <button onClick={onClose} disabled={ocupado} className={btnCancelar}>
                  CANCELAR
                </button>
                <button
                  onClick={() => setConfirmandoMesclar(true)}
                  disabled={ocupado || !mesclarPronto}
                  className={btnPrimario}
                  style={{ backgroundColor: "#1565C0" }}
                >
                  MESCLAR
                </button>
              </div>
            )}
          </>
        )}

        {!carregando && p && aba === "arquivar" && (
          <>
            {p.ativo ? (
              <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "#E3F2FD", color: "#1A3A6B" }}>
                Ao arquivar, <strong>{p.nome}</strong> sai da lista de produtos, dos alertas de estoque baixo, das
                pendências e da escolha de destino no Envase, e não permite novas retiradas. O histórico de envases e
                retiradas é mantido e o produto pode ser reativado a qualquer momento.
              </p>
            ) : (
              <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "#FFF3CD", color: "#7A5300" }}>
                <strong>{p.nome}</strong> está arquivado. Ao reativar, ele volta para a lista, para os alertas e para o
                Envase.
              </p>
            )}
            <Field label="Observação">
              <input
                className={inputCls}
                value={obsArquivar}
                onChange={(e) => setObsArquivar(e.target.value)}
                placeholder="Opcional"
              />
            </Field>
            <ErrorMsg msg={erro} />
            <div className="flex gap-3 pt-2 justify-end">
              <button onClick={onClose} disabled={ocupado} className={btnCancelar}>
                CANCELAR
              </button>
              <button
                onClick={alternarArquivo}
                disabled={ocupado}
                className={btnPrimario}
                style={{ backgroundColor: "#1565C0" }}
              >
                {ocupado ? "Salvando..." : p.ativo ? "ARQUIVAR PRODUTO" : "REATIVAR PRODUTO"}
              </button>
            </div>
          </>
        )}

        {!carregando && p && aba === "excluir" && estoqueP && (
          <>
            <div className="rounded-lg px-4 py-3 flex flex-col gap-2" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
              <p className="text-sm font-semibold">Esta exclusão é definitiva e não pode ser desfeita.</p>
              <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
                <li>
                  Estoque que será perdido:{" "}
                  {SIZES.map((s) => `${s.label}: ${estoqueP[s.key]}`).join(", ")} (total {totalP} UND).
                </li>
                <li>
                  {p.retiradas_count} retirada(s) serão apagadas e também desaparecem dos Relatórios de Transferência
                  de datas passadas.
                </li>
                <li>
                  {p.envases_count} envase(s) perdem o produto de destino (o envase continua, mas sem produto).
                </li>
              </ul>
              <p className="text-sm">Para arquivar sem perder o histórico, use a aba Arquivar.</p>
            </div>
            <Field label={`Digite o nome exato do produto para confirmar: ${p.nome}`}>
              <input
                className={inputCls}
                value={nomeDigitado}
                onChange={(e) => setNomeDigitado(e.target.value)}
                placeholder={p.nome}
                autoComplete="off"
              />
            </Field>
            <Field label="Observação">
              <input
                className={inputCls}
                value={obsExcluir}
                onChange={(e) => setObsExcluir(e.target.value)}
                placeholder="Opcional"
              />
            </Field>
            <ErrorMsg msg={erro} />
            <div className="flex gap-3 pt-2 justify-end">
              <button onClick={onClose} disabled={ocupado} className={btnCancelar}>
                CANCELAR
              </button>
              <button
                onClick={excluir}
                disabled={ocupado || !nomeConfere}
                className={btnPrimario}
                style={{ backgroundColor: "#DC2626" }}
              >
                {ocupado ? "Excluindo..." : "EXCLUIR DEFINITIVAMENTE"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
