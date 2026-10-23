import { getProdutosAcabados, getRetiradasHoje } from "@/app/actions/produto-acabado";
import { getUserRole } from "@/app/actions/auth-role";
import ProdutoAcabadoClient from "./ProdutoAcabadoClient";

export default async function ProdutoAcabadoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { focus, acao } = await searchParams;
  const [produtos, retiradasHoje, role] = await Promise.all([
    getProdutosAcabados(),
    getRetiradasHoje(),
    getUserRole(),
  ]);
  return (
    <ProdutoAcabadoClient
      initialProdutos={produtos}
      initialRetiradasHoje={retiradasHoje}
      isAdmin={role === "admin"}
      focusId={(Array.isArray(focus) ? focus[0] : focus) ?? null}
      acao={(Array.isArray(acao) ? acao[0] : acao) ?? null}
    />
  );
}
