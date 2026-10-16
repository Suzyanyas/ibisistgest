import { getProdutosAcabados, getRetiradasHoje } from "@/app/actions/produto-acabado";
import { getUserRole } from "@/app/actions/auth-role";
import ProdutoAcabadoClient from "./ProdutoAcabadoClient";

export default async function ProdutoAcabadoPage() {
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
    />
  );
}
