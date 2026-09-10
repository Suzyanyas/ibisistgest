import { getInsumos } from "@/app/actions/insumos";
import { getUserRole } from "@/app/actions/auth-role";
import EstoqueInsumosClient from "./EstoqueInsumosClient";

export default async function EstoqueInsumosPage() {
  const [insumos, role] = await Promise.all([getInsumos(), getUserRole()]);
  return <EstoqueInsumosClient initialInsumos={insumos} isAdmin={role === "admin"} />;
}
