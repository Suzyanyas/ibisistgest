import { getFormulas } from "@/app/actions/formulas";
import { getUserRole } from "@/app/actions/auth-role";
import FormulasClient from "./FormulasClient";

export default async function FormulasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { focus } = await searchParams;
  const formulas = await getFormulas();
  const role = await getUserRole();
  return (
    <FormulasClient
      initialFormulas={formulas}
      isAdmin={role === "admin"}
      focusId={(Array.isArray(focus) ? focus[0] : focus) ?? null}
    />
  );
}
