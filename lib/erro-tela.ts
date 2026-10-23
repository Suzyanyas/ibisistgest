// Mensagem de erro para a tela quando uma chamada ao servidor FALHA de forma inesperada
// (rede, queda, leitura que lançou). Em produção a mensagem de um erro lançado por uma
// server action é descartada pelo React ("Minified React error #441"); nunca a mostre.
// Falhas esperadas chegam como { ok: false, error } e são exibidas diretamente.
export function erroTela(e: unknown, fallback: string): string {
  console.error(e);
  return fallback;
}
