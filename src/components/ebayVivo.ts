// Preços do eBay "na hora" para um ou vários sets, pedidos à função ebay-set do Supabase.
//
// useEbayVivo(sets): espera meio segundo depois de a lista parar de mudar (para não pedir a cada
// tecla) e pede os sets que ainda não foram pedidos nesta sessão, 4 de cada vez. Devolve, por set,
// a resposta ou 'a_procurar'. As respostas ficam guardadas em memória até se fechar a app.
// Em modo demonstração não pede nada (não há sessão no Supabase).

import { useEffect, useState } from 'react';
import { ebayAoVivo } from '../lib/supabase';
import type { RespostaEbay } from '../lib/supabase';

const cache = new Map<string, Promise<RespostaEbay>>();
const SIMULTANEOS = 4;

function pedir(set: string): Promise<RespostaEbay> {
  let p = cache.get(set);
  if (!p) {
    p = ebayAoVivo(set).catch((e): RespostaEbay => ({ erro: 'ebay', detalhe: e instanceof Error ? e.message : String(e) }));
    cache.set(set, p);
  }
  return p;
}

export type EstadoEbay = RespostaEbay | 'a_procurar';

export function useEbayVivo(sets: string[], ativo: boolean): Record<string, EstadoEbay> {
  const [respostas, setRespostas] = useState<Record<string, EstadoEbay>>({});
  const chave = sets.join(',');
  useEffect(() => {
    if (!ativo || !sets.length) return;
    let vivo = true;
    const t = setTimeout(async () => {
      setRespostas((r) => ({ ...r, ...Object.fromEntries(sets.filter((s) => !r[s] || r[s] === 'a_procurar').map((s) => [s, 'a_procurar' as const])) }));
      for (let i = 0; i < sets.length && vivo; i += SIMULTANEOS) {
        const lote = sets.slice(i, i + SIMULTANEOS);
        const res = await Promise.all(lote.map(pedir));
        if (vivo) setRespostas((r) => ({ ...r, ...Object.fromEntries(lote.map((s, j) => [s, res[j]])) }));
      }
    }, 500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo]);
  return respostas;
}

/** [mediana, n.º de anúncios] de uma resposta, se tiver preço utilizável. */
export const precoEbay = (r: EstadoEbay | undefined): [number, number] | null =>
  r && r !== 'a_procurar' && r.mediana ? [r.mediana, r.anuncios ?? 0] : null;
