import { Suspense } from "react";
import { getLotesProducao } from "@/app/actions/producao";
import ProducaoClient from "./ProducaoClient";

export default async function ProducaoPage() {
  const lotes = await getLotesProducao();
  return (
    <Suspense>
      <ProducaoClient initialLotes={lotes} />
    </Suspense>
  );
}
