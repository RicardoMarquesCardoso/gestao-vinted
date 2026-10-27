import { diasEntre } from './calc';
import type { PeriodoAnuncio, Produto } from './types';

type Linha = Partial<Produto> & { id?: string };

/**
 * Atualiza os períodos de anúncio de um produto quando o estado ou o preço mudam.
 * Devolve a nova lista, ou undefined se não houver nada a registar.
 */
export function atualizarPeriodos(antes: Linha | undefined, depois: Linha, agora: string): PeriodoAnuncio[] | undefined {
  if (depois.estado === undefined) return undefined; // gravação parcial sem estado
  const base = (depois.anuncios ?? antes?.anuncios ?? []).map((x) => ({ ...x }));
  const eraAnunciado = antes?.estado === 'anunciado';
  const eAnunciado = depois.estado === 'anunciado';
  const aberto = [...base].reverse().find((x) => !x.fim);
  const preco = depois.preco_anuncio ?? null;

  if (eAnunciado && !eraAnunciado) {
    if (aberto) return undefined; // já havia um período aberto
    base.push({ inicio: agora, fim: null, conta_id: depois.conta_id ?? null, preco });
    return base;
  }
  if (!eAnunciado && eraAnunciado) {
    if (!aberto) return undefined;
    aberto.fim = agora;
    aberto.motivo = depois.estado === 'vendido' ? 'vendido' : depois.estado === 'por_anunciar' ? 'retirado' : 'outro';
    return base;
  }
  if (eAnunciado && eraAnunciado && aberto && 'preco_anuncio' in depois && preco !== (antes?.preco_anuncio ?? null)) {
    aberto.precos = [...(aberto.precos ?? []), { quando: agora, preco }];
    return base;
  }
  return undefined;
}

/** Total de dias em que o produto esteve anunciado (até hoje, se ainda estiver). */
export function diasAnunciado(p: Pick<Produto, 'anuncios'>, hoje: string): number | null {
  if (!p.anuncios?.length) return null;
  return p.anuncios.reduce((a, x) => a + Math.max(diasEntre(x.inicio.slice(0, 10), (x.fim ?? hoje).slice(0, 10)), 0), 0);
}
