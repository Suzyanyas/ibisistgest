// Unidades e conversões usadas no cliente. Espelha a função converter_unidade da base
// (supabase/migrations/0002); serve só para pré-visualizações e avisos, nunca como fonte de verdade.

export const INSUMO_UNIDADES = ["KG", "L", "G", "ML", "PCT", "UN"];

const MASSA: Record<string, number> = { KG: 1000, G: 1 }; // em gramas
const VOLUME: Record<string, number> = { L: 1000, ML: 1 }; // em ml

export function getUnidadesCompativeis(
  insumoUnidade: string,
  densidade?: number | null
): string[] {
  const u = insumoUnidade.toUpperCase();
  if (densidade != null && (u in MASSA || u in VOLUME)) return ["KG", "G", "L", "ML"];
  if (u === "KG" || u === "G") return ["KG", "G"];
  if (u === "L" || u === "ML") return ["L", "ML"];
  if (u === "UN") return ["UN"];
  if (u === "PCT") return ["PCT"];
  return INSUMO_UNIDADES;
}

// null quando a conversão é impossível
export function converterUnidade(
  quantidade: number,
  de: string,
  para: string,
  densidade?: number | null
): number | null {
  const d = de.trim().toUpperCase();
  const p = para.trim().toUpperCase();
  if (d === p) return quantidade;
  if (d in MASSA && p in MASSA) return (quantidade * MASSA[d]) / MASSA[p];
  if (d in VOLUME && p in VOLUME) return (quantidade * VOLUME[d]) / VOLUME[p];
  const massaParaVolume = d in MASSA && p in VOLUME;
  const volumeParaMassa = d in VOLUME && p in MASSA;
  if (massaParaVolume || volumeParaMassa) {
    if (densidade == null || densidade <= 0) return null;
    // gramas = ml x densidade
    if (massaParaVolume) return (quantidade * MASSA[d]) / densidade / VOLUME[p];
    return (quantidade * VOLUME[d] * densidade) / MASSA[p];
  }
  return null;
}

export function unidadeIncompativel(
  unidade: string,
  unidadeBase: string,
  densidade?: number | null
): boolean {
  return (
    !getUnidadesCompativeis(unidadeBase, densidade).includes(unidade.toUpperCase()) ||
    converterUnidade(1, unidade, unidadeBase, densidade) === null
  );
}
