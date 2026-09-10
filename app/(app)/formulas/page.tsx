import { getFormulas } from "@/app/actions/formulas";
import { getUserRole } from "@/app/actions/auth-role";
import FormulasClient from "./FormulasClient";

export default async function FormulasPage() {
  const [formulas, role] = await Promise.all([getFormulas(), getUserRole()]);
  return <FormulasClient initialFormulas={formulas} isAdmin={role === "admin"} />;
}
