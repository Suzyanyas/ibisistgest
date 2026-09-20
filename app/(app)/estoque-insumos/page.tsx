import { getInsumos } from "@/app/actions/insumos";
import EstoqueInsumosClient from "./EstoqueInsumosClient";

// TODO: restore auth before delivery
export default async function EstoqueInsumosPage() {
  const insumos = await getInsumos();
  return <EstoqueInsumosClient initialInsumos={insumos} isAdmin={true} />;
}
