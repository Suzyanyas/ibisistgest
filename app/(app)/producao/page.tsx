import { Suspense } from "react";
import { getLotesProducao } from "@/app/actions/producao";
import { getUserRole } from "@/app/actions/auth-role";
import ProducaoClient from "./ProducaoClient";

export default async function ProducaoPage() {
  const lotes = await getLotesProducao();
  const role = await getUserRole();
  return (
    <Suspense>
      <ProducaoClient initialLotes={lotes} isAdmin={role === "admin"} />
    </Suspense>
  );
}
