import { getLotesProducao } from "@/app/actions/producao";
import ProducaoClient from "./ProducaoClient";

export default async function ProducaoPage() {
  const lotes = await getLotesProducao();
  return <ProducaoClient initialLotes={lotes} />;
}
