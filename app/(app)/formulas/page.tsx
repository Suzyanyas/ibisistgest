import { getFormulas } from "@/app/actions/formulas";
import FormulasClient from "./FormulasClient";

// TODO: restore auth before delivery
export default async function FormulasPage() {
  const formulas = await getFormulas();
  return <FormulasClient initialFormulas={formulas} isAdmin={true} />;
}
