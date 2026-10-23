import { ErroAcao, ERRO_GENERICO } from "@/lib/acao";

// Converte o erro de supabase.rpc() em um ErroAcao com mensagem para o usuário.
// O erro original é registrado no log do servidor.
export function rpcError(error: { code?: string; message: string }): ErroAcao {
  // P0001 = raise exception nas funções: a mensagem já está em português
  if (error.code === "P0001") return new ErroAcao(error.message);
  console.error("[rpc]", error);
  if (error.code === "23505") return new ErroAcao("Já existe um registo com este nome.");
  if (error.code === "23514")
    return new ErroAcao("Valor inválido: o estoque não pode ficar negativo.");
  if (error.code === "23503")
    return new ErroAcao("Este registro está em uso por outros dados e não pode ser alterado ou excluído.");
  return new ErroAcao(ERRO_GENERICO);
}
