// Memória do último resultado de uma função (memoização).
//
// PORQUÊ: há cálculos que percorrem todas as vendas (rácio do PVP, tempo até vender, vendas do
// mesmo set) e que eram repetidos para cada set de uma promoção (647 sets do Continente → ~0,3 s
// num computador, mais no telemóvel). Os dados só mudam quando se grava ou recarrega, e nessa
// altura a app cria listas NOVAS (nunca altera as antigas). Por isso basta comparar os argumentos
// por identidade (===): se forem os mesmos objetos, o resultado é o mesmo.
//
// Atenção: só serve para funções puras e para listas que nunca são alteradas no sítio.

/** Devolve uma versão de f que reutiliza o último resultado quando os argumentos são os mesmos. */
export function ultimoResultado<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R {
  let anteriores: A | null = null;
  let resultado: R;
  return (...a: A) => {
    if (anteriores && anteriores.length === a.length && a.every((x, i) => x === anteriores![i])) return resultado;
    resultado = f(...a);
    anteriores = a;
    return resultado;
  };
}
