import { getInsumos } from "@/app/actions/insumos";
import { getUserRole } from "@/app/actions/auth-role";
import EstoqueInsumosClient from "./EstoqueInsumosClient";

export default async function EstoqueInsumosPage() {
  const insumos = await getInsumos("producao");
  const role = await getUserRole();
  return <EstoqueInsumosClient initialInsumos={insumos} isAdmin={role === "admin"} />;
}
