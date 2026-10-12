// Converte o erro de supabase.rpc() em um Error com mensagem para o usuário.
export function rpcError(error: { code?: string; message: string }): Error {
  // P0001 = raise exception nas funções: a mensagem já está em português
  if (error.code === "P0001") return new Error(error.message);
  if (error.code === "23505") return new Error("Já existe um registo com este nome.");
  if (error.code === "23514")
    return new Error("Valor inválido: o estoque não pode ficar negativo.");
  return new Error("Não foi possível concluir a operação. Tente novamente.");
}
