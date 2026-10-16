import {
  getAgendaProducao,
  getAgendaAtrasada,
  getLotesEmEnvase,
  getInsumosAbaixoMinimo,
  getProdutosAbaixoMinimo,
  getAtividadeRecente,
  getPendencias,
} from "@/app/actions/dashboard";
import { getFormulas } from "@/app/actions/formulas";
import { getUserRole } from "@/app/actions/auth-role";
import DashboardClient from "./DashboardClient";

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10);

  const [
    agendaHoje,
    agendaAtrasada,
    lotesEnvase,
    insumosAbaixo,
    produtosAbaixo,
    formulas,
    atividadeRecente,
    role,
    pendencias,
  ] = await Promise.all([
    getAgendaProducao(today),
    getAgendaAtrasada(),
    getLotesEmEnvase(),
    getInsumosAbaixoMinimo(),
    getProdutosAbaixoMinimo(),
    getFormulas(),
    getAtividadeRecente(),
    getUserRole(),
    getPendencias(),
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
      initialAtividadeRecente={atividadeRecente}
      initialPendencias={pendencias}
      isAdmin={role === "admin"}
    />
  );
}
