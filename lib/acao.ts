// Resultado das server actions. Em produção o Next/React descarta a mensagem de qualquer
// erro LANÇADO por uma server action (o cliente recebe só "Minified React error #441"),
// então falhas esperadas precisam ser DEVOLVIDAS, nunca lançadas.

export type ResultadoAcao = { ok: true } | { ok: false; error: string };
export type ResultadoDado<T> = { ok: true; data: T } | { ok: false; error: string };

export const ERRO_GENERICO = "Não foi possível concluir a operação. Tente novamente.";

// Erro com mensagem já pensada para o usuário (português, sem detalhes técnicos).
// Só mensagens de ErroAcao chegam à tela; qualquer outro erro vira ERRO_GENERICO.
export class ErroAcao extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroAcao";
  }
}

export function falha(contexto: string, e: unknown): { ok: false; error: string } {
  if (e instanceof ErroAcao) return { ok: false, error: e.message };
  // O erro original (banco, rede, bug) fica só no log do servidor
  console.error(`[acao:${contexto}]`, e);
  return { ok: false, error: ERRO_GENERICO };
}

// Executa o corpo de uma action e converte qualquer erro lançado em { ok: false, error }.
export async function executar<T>(
  contexto: string,
  fn: () => Promise<T>
): Promise<ResultadoDado<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return falha(contexto, e);
  }
}

// Erro de banco inesperado dentro de uma action: registra e lança uma mensagem segura.
export function erroBanco(contexto: string, error: { message: string; code?: string }): never {
  console.error(`[db:${contexto}]`, error);
  if (error.code === "23503") {
    throw new ErroAcao("Este registro está em uso por outros dados e não pode ser alterado ou excluído.");
  }
  if (error.code === "23505") throw new ErroAcao("Já existe um registro com este nome.");
  throw new ErroAcao(ERRO_GENERICO);
}
