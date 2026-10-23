"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  getPendencias,
  ignorarPendencia,
  type PendenciaItem,
  type PendenciaTipo,
  type Pendencias,
} from "@/app/actions/dashboard";
import { PENDENCIA_TEXTOS, textoBotao } from "@/lib/pendencias";
import { erroTela } from "@/lib/erro-tela";

// ─── Contexto ────────────────────────────────────────────────────────────────

type PendenciasCtx = {
  pendencias: Pendencias | null;
  total: number;
  abrir: () => void;
  // Chamado pelo Dashboard ao carregar: entrega os dados (sem nova consulta) e abre o modal
  carregarDashboard: (p: Pendencias) => void;
  // Chamado pelo Dashboard nas atualizações periódicas: só troca os dados
  definir: (p: Pendencias) => void;
};

const Ctx = createContext<PendenciasCtx | null>(null);

// null fora do provider (funcionário): quem usa trata como "sem pendências"
export function usePendencias(): PendenciasCtx | null {
  return useContext(Ctx);
}

const CHAVE_BASE = "ibisist-pendencias-base";
const INTERVALO_MIN_MS = 60_000;
const CHAVE_INTRO = "ibisist-pendencias-intro-vista";

function introJaVista(): boolean {
  try {
    return localStorage.getItem(CHAVE_INTRO) === "1";
  } catch {
    return false;
  }
}

type ItemPlano = { tipo: PendenciaTipo; item: PendenciaItem };

function achatar(p: Pendencias | null): ItemPlano[] {
  if (!p) return [];
  return p.grupos.flatMap((g) => g.items.map((item) => ({ tipo: g.tipo, item })));
}

function lerBase(): number {
  try {
    return parseInt(sessionStorage.getItem(CHAVE_BASE) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function gravarBase(n: number) {
  try {
    if (n > 0) sessionStorage.setItem(CHAVE_BASE, String(n));
    else sessionStorage.removeItem(CHAVE_BASE);
  } catch {
    // sessionStorage indisponível: o progresso só não sobrevive a um recarregamento
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export default function PendenciasProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pendencias, setPendencias] = useState<Pendencias | null>(null);
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [base, setBase] = useState(0);
  const [sucesso, setSucesso] = useState(false);
  const ultimaConsulta = useRef(0);
  const totalAnterior = useRef(0);
  const baseRef = useRef(0);
  // A frase de boas-vindas aparece até a primeira pendência ser resolvida ou ignorada
  const [introVista, setIntroVista] = useState(false);

  const itens = useMemo(() => achatar(pendencias), [pendencias]);
  const total = itens.length;

  // Troca os dados e mantém o progresso (base = maior total visto na sessão)
  const aplicar = useCallback((p: Pendencias) => {
    ultimaConsulta.current = Date.now();
    const novoTotal = p.grupos.reduce((n, g) => n + g.items.length, 0);
    const anterior = totalAnterior.current;
    totalAnterior.current = novoTotal;
    // menos itens do que antes = algo foi resolvido ou ignorado
    if (anterior > 0 && novoTotal < anterior) {
      try {
        localStorage.setItem(CHAVE_INTRO, "1");
      } catch {
        // sem localStorage: a frase só some nesta sessão
      }
      setIntroVista(true);
    }
    setPendencias(p);
    // base = maior total visto nesta sessão; zera quando tudo foi resolvido
    const novaBase = novoTotal > 0 ? Math.max(baseRef.current, lerBase(), novoTotal) : 0;
    baseRef.current = novaBase;
    gravarBase(novaBase);
    setBase(novaBase);
    if (novoTotal === 0 && anterior > 0) {
      setAberto(false);
      setSucesso(true);
    }
  }, []);

  const atualizar = useCallback(async () => {
    try {
      aplicar(await getPendencias());
    } catch {
      // mantém o que já está na tela; tenta de novo no próximo gatilho
    }
  }, [aplicar]);

  const semeadoPeloDashboard = useRef(false);

  const carregarDashboard = useCallback(
    (p: Pendencias) => {
      semeadoPeloDashboard.current = true;
      const novoTotal = p.grupos.reduce((n, g) => n + g.items.length, 0);
      aplicar(p);
      setIndice(0);
      // Abre a cada carregamento do Dashboard enquanto houver pendências
      if (novoTotal > 0) setAberto(true);
    },
    [aplicar]
  );

  const abrir = useCallback(() => {
    setAberto(true);
    void atualizar();
  }, [atualizar]);

  // Primeira carga fora do Dashboard (o Dashboard entrega os dados sem consulta extra)
  useEffect(() => {
    if (!isAdmin || semeadoPeloDashboard.current) return;
    if (pathname === "/") return;
    getPendencias()
      .then(aplicar)
      .catch(() => {
        // sem dados por enquanto; o botão aparece quando uma consulta futura funcionar
      });
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Ao navegar e ao voltar para a aba: atualiza o contador, no máximo uma vez por minuto
  useEffect(() => {
    if (!isAdmin) return;
    if (Date.now() - ultimaConsulta.current > INTERVALO_MIN_MS && ultimaConsulta.current !== 0) {
      void atualizar();
    }
  }, [pathname, isAdmin, atualizar]);

  useEffect(() => {
    if (!isAdmin) return;
    function aoVoltar() {
      if (document.visibilityState === "visible" && Date.now() - ultimaConsulta.current > INTERVALO_MIN_MS) {
        void atualizar();
      }
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [isAdmin, atualizar]);

  // Lê a marca da introdução depois da montagem (evita diferença entre servidor e navegador)
  useEffect(() => {
    if (!isAdmin) return;
    const id = setTimeout(() => setIntroVista(introJaVista()), 0);
    return () => clearTimeout(id);
  }, [isAdmin]);

  // Mensagem de sucesso some sozinha
  useEffect(() => {
    if (!sucesso) return;
    const id = setTimeout(() => setSucesso(false), 5000);
    return () => clearTimeout(id);
  }, [sucesso]);

  const ctx = useMemo<PendenciasCtx>(
    () => ({ pendencias, total, abrir, carregarDashboard, definir: aplicar }),
    [pendencias, total, abrir, carregarDashboard, aplicar]
  );

  if (!isAdmin) return <>{children}</>;

  const indiceAtual = Math.min(indice, Math.max(total - 1, 0));

  async function aoIgnorar(it: ItemPlano): Promise<string | null> {
    const r = await ignorarPendencia(it.item.chave, it.tipo, it.item.nome);
    if (!r.ok) return r.error;
    // remove localmente; a próxima consulta confirma
    if (pendencias) {
      aplicar({
        ...pendencias,
        grupos: pendencias.grupos
          .map((g) => ({ ...g, items: g.items.filter((x) => x.chave !== it.item.chave) }))
          .filter((g) => g.items.length > 0),
      });
    }
    return null;
  }

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {total > 0 && !aberto && <BotaoFlutuante total={total} onClick={abrir} />}
      {aberto && total > 0 && (
        <ModalPendencias
          itens={itens}
          indice={indiceAtual}
          base={base}
          onIndice={setIndice}
          onMinimizar={() => setAberto(false)}
          onIgnorar={aoIgnorar}
          podeIgnorar={pendencias?.podeIgnorar ?? false}
          mostrarIntro={!introVista}
        />
      )}
      {sucesso && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-xl"
          style={{ bottom: "max(24px, env(safe-area-inset-bottom))", border: "2px solid #16A34A" }}
        >
          <p className="text-sm font-semibold" style={{ color: "#166534" }}>
            Tudo certo. Todas as pendências foram resolvidas.
          </p>
          <button
            type="button"
            onClick={() => setSucesso(false)}
            aria-label="Fechar mensagem"
            className="flex items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            style={{ width: 36, height: 36 }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}

// ─── Botão flutuante ─────────────────────────────────────────────────────────

function BotaoFlutuante({ total, onClick }: { total: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir pendências: ${total} restantes`}
      className="pendencias-pulse fixed z-40 flex items-center gap-2 rounded-full text-white font-bold shadow-lg hover:brightness-110 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
      style={{
        right: 16,
        bottom: "max(16px, env(safe-area-inset-bottom))",
        minHeight: 56,
        padding: "0 20px",
        backgroundColor: "#D97706",
        border: "none",
        cursor: "pointer",
        fontSize: 15,
      }}
    >
      <AlertTriangle size={20} aria-hidden="true" />
      <span>Pendências</span>
      <span
        className="flex items-center justify-center rounded-full bg-white font-bold"
        style={{ minWidth: 28, height: 28, padding: "0 8px", color: "#B45309", fontSize: 14 }}
      >
        {total}
      </span>
    </button>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ModalPendencias({
  itens,
  indice,
  base,
  onIndice,
  onMinimizar,
  onIgnorar,
  podeIgnorar,
  mostrarIntro,
}: {
  itens: ItemPlano[];
  indice: number;
  base: number;
  onIndice: (i: number) => void;
  onMinimizar: () => void;
  onIgnorar: (it: ItemPlano) => Promise<string | null>;
  podeIgnorar: boolean;
  mostrarIntro: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const total = itens.length;
  const atual = itens[indice];
  const resolvidos = Math.max(base - total, 0);
  const baseExibida = Math.max(base, total);
  const percentual = baseExibida > 0 ? Math.round((resolvidos / baseExibida) * 100) : 0;

  // Foco: entra no modal, prende o Tab dentro dele e devolve o foco ao fechar
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    caixa.current?.querySelector<HTMLElement>("[data-foco-inicial]")?.focus();
    return () => {
      document.body.style.overflow = overflowAnterior;
      anterior?.focus?.();
    };
  }, []);

  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onMinimizar();
      return;
    }
    if (e.key !== "Tab") return;
    const focaveis = Array.from(caixa.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL) ?? []);
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  function ir(i: number) {
    setErro(null);
    onIndice((i + total) % total);
  }

  async function ignorar() {
    if (!atual || ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      const msg = await onIgnorar(atual);
      if (msg) setErro(msg);
    } catch (e) {
      setErro(erroTela(e, "Não foi possível ignorar esta pendência."));
    } finally {
      setOcupado(false);
    }
  }

  if (!atual) return null;
  const textos = PENDENCIA_TEXTOS[atual.tipo];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onMinimizar();
      }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pendencias-titulo"
        onKeyDown={aoTeclar}
        className="bg-white w-full max-w-lg max-h-[95vh] overflow-y-auto"
        style={{ borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ backgroundColor: "#1565C0", borderRadius: "16px 16px 0 0" }}
        >
          <h2 id="pendencias-titulo" className="text-white font-semibold text-lg">
            Pendências
          </h2>
          <button
            type="button"
            onClick={onMinimizar}
            aria-label="Minimizar pendências"
            title="Minimizar"
            className="modal-close flex items-center justify-center rounded-full text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ width: 44, height: 44, background: "none", border: "none", cursor: "pointer" }}
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-5 pt-5 pb-6 flex flex-col gap-5">
          {mostrarIntro && (
            <p className="text-gray-700" style={{ fontSize: 15 }}>
              São pequenos acertos, um de cada vez. Não precisa fazer tudo hoje.
            </p>
          )}

          {/* Progresso */}
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <p className="text-sm font-semibold" style={{ color: "#1A3A6B" }}>
                {resolvidos} de {baseExibida} resolvidos
              </p>
              <p className="text-xs text-gray-500">
                Item {indice + 1} de {total}
              </p>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={baseExibida}
              aria-valuenow={resolvidos}
              aria-label="Pendências resolvidas"
              className="w-full overflow-hidden rounded-full"
              style={{ height: 10, backgroundColor: "#E5E7EB" }}
            >
              <div
                style={{
                  width: `${percentual}%`,
                  height: "100%",
                  backgroundColor: "#16A34A",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Cartão do item */}
          <div className="rounded-xl p-5 flex flex-col gap-3" style={{ backgroundColor: "#FFF8E1", border: "1px solid #FCD34D" }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#B45309" }}>
              {textos.titulo}
            </p>
            <p className="font-bold break-words" style={{ color: "#1A3A6B", fontSize: 24, lineHeight: 1.2 }}>
              {atual.item.nome}
            </p>
            <p className="text-gray-700" style={{ fontSize: 16 }}>
              {textos.explicacao}
            </p>
            {atual.item.detalhe && (
              <p className="text-gray-600" style={{ fontSize: 14 }}>
                {atual.item.detalhe}
              </p>
            )}
            <div className="flex flex-col gap-1.5 pt-3" style={{ borderTop: "1px solid #FCD34D" }}>
              <p className="text-sm font-bold" style={{ color: "#1A3A6B" }}>
                Como resolver
              </p>
              {textos.comoResolver.map((linha) => (
                <p key={linha} className="text-gray-700" style={{ fontSize: 15 }}>
                  {linha}
                </p>
              ))}
              {textos.seEstaCerto && atual.item.ignoravel && podeIgnorar && (
                <p className="text-gray-700" style={{ fontSize: 15 }}>
                  {textos.seEstaCerto}
                </p>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-3">
            <Link
              href={atual.item.href}
              onClick={onMinimizar}
              data-foco-inicial
              className="flex items-center justify-center rounded-xl text-white font-bold text-center hover:brightness-110 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
              style={{ minHeight: 56, backgroundColor: "#1565C0", fontSize: 17, padding: "0 16px" }}
            >
              {textoBotao(atual.tipo, atual.item.id)}
            </Link>
            <p className="text-center text-gray-600" style={{ fontSize: 14 }}>
              O sistema leva você até a tela certa. Para voltar aqui, use o botão laranja Pendências.
            </p>
            {atual.item.ignoravel && podeIgnorar && (
              <button
                type="button"
                onClick={ignorar}
                disabled={ocupado}
                className="rounded-xl font-semibold hover:bg-gray-50 transition disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-300"
                style={{ minHeight: 52, border: "2px solid #9CA3AF", color: "#374151", background: "#fff", cursor: "pointer", fontSize: 15, padding: "0 16px" }}
              >
                {ocupado ? "Salvando..." : "Isso está certo, não precisa corrigir"}
              </button>
            )}
            {erro && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{erro}</p>}
          </div>

          {/* Navegação */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => ir(indice - 1)}
              disabled={total < 2}
              className="flex items-center gap-1 rounded-xl font-semibold hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
              style={{ minHeight: 48, padding: "0 16px", border: "1px solid #D1D5DB", background: "#fff", color: "#1A3A6B", cursor: "pointer" }}
            >
              <ChevronLeft size={20} aria-hidden="true" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => ir(indice + 1)}
              disabled={total < 2}
              className="flex items-center gap-1 rounded-xl font-semibold hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
              style={{ minHeight: 48, padding: "0 16px", border: "1px solid #D1D5DB", background: "#fff", color: "#1A3A6B", cursor: "pointer" }}
            >
              Próximo
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={onMinimizar}
            className="self-center text-sm font-semibold underline hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
            style={{ color: "#6B7A99", background: "none", border: "none", cursor: "pointer", minHeight: 44 }}
          >
            Minimizar e continuar usando o sistema
          </button>
        </div>
      </div>
    </div>
  );
}
