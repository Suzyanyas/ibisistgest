import { getProdutosAcabados, getRetiradasHoje } from "@/app/actions/produto-acabado";
import ProdutoAcabadoClient from "./ProdutoAcabadoClient";

export default async function ProdutoAcabadoPage() {
  const [produtos, retiradasHoje] = await Promise.all([
    getProdutosAcabados(),
    getRetiradasHoje(),
  ]);
  return (
    <ProdutoAcabadoClient
      initialProdutos={produtos}
      initialRetiradasHoje={retiradasHoje}
    />
  );
}
