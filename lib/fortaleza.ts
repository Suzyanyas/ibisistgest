// Datas no fuso America/Fortaleza (UTC-3, sem horário de verão), usadas pelo Produto Acabado.

const TZ = "America/Fortaleza";

// "YYYY-MM-DD" de hoje em Fortaleza
export function hojeFortaleza(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

// "YYYY-MM-DD" -> "dd/mm/aaaa"
export function formatarDataBR(dataISO: string): string {
  const [y, m, d] = dataISO.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Início (inclusive) e fim (exclusivo) do dia em Fortaleza, como instantes ISO UTC
export function intervaloDiaFortaleza(dataISO: string): { inicio: string; fim: string } {
  const inicio = new Date(`${dataISO}T00:00:00-03:00`);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}
