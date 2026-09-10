import {
  getAgendaProducao,
  getAgendaAtrasada,
  getLotesEmEnvase,
  getInsumosAbaixoMinimo,
  getProdutosAbaixoMinimo,
} from "@/app/actions/dashboard";
import { getFormulas } from "@/app/actions/formulas";
import DashboardClient from "./DashboardClient";

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10);

  const [agendaHoje, agendaAtrasada, lotesEnvase, insumosAbaixo, produtosAbaixo, formulas] =
    await Promise.all([
      getAgendaProducao(today),
      getAgendaAtrasada(),
      getLotesEmEnvase(),
      getInsumosAbaixoMinimo(),
      getProdutosAbaixoMinimo(),
      getFormulas(),
    ]);

  return (
    <DashboardClient
      today={today}
      initialAgendaHoje={agendaHoje}
      initialAgendaAtrasada={agendaAtrasada}
      initialLotesEnvase={lotesEnvase}
      initialInsumosAbaixo={insumosAbaixo}
      initialProdutosAbaixo={produtosAbaixo}
      formulas={formulas}
    />
  );
}
