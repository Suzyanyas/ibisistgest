import { getInsumos } from "@/app/actions/insumos";
import { getUserRole } from "@/app/actions/auth-role";
import EstoqueInsumosClient from "./EstoqueInsumosClient";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function EstoqueInsumosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const focus = first(params.focus);
  const acao = first(params.acao);
  const categoria = first(params.categoria);

  // O insumo em foco pode estar em qualquer aba; abre a aba dele.
  // Sem insumo (acao=novo para embalagem), abre Materiais & EPI.
  let tab: "producao" | "material" = "producao";
  if (focus) {
    const todos = await getInsumos();
    tab = todos.find((i) => i.id === focus)?.tipo ?? "producao";
  } else if (acao === "novo" && categoria) {
    tab = "material";
  }

  const [insumos, role] = await Promise.all([getInsumos(tab), getUserRole()]);
  return (
    <EstoqueInsumosClient
      initialInsumos={insumos}
      initialTab={tab}
      isAdmin={role === "admin"}
      foco={{ id: focus ?? null, acao: acao ?? null, categoria: categoria ?? null }}
    />
  );
}
