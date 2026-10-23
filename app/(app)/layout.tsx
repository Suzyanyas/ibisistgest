import Navbar from "@/components/Navbar";
import PendenciasProvider from "@/components/PendenciasProvider";
import { getUserRole } from "@/app/actions/auth-role";

// O layout só decide se o usuário é admin (getUser é compartilhado com a página na mesma
// requisição). As pendências em si são buscadas no cliente, uma vez por carregamento
// (ou entregues pelo Dashboard, que já as consulta), então as demais telas não pagam por elas.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = (await getUserRole()) === "admin";
  return (
    <PendenciasProvider isAdmin={isAdmin}>
      <Navbar />
      <main className="flex-1" style={{ backgroundColor: "#E8F4FF" }}>
        {children}
      </main>
    </PendenciasProvider>
  );
}
