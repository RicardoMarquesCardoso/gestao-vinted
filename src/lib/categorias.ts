// Categorias (marca) e subcategorias (marca › tema) dos produtos, e a comparação de texto sem
// maiúsculas nem acentos. Usado pela pesquisa dos Produtos e das Análises (pedido do Ricardo: a
// mesma pesquisa nos dois ecrãs) e pelos filtros dos cálculos (lib/calc.ts).
//   ex.: "pokemon" encontra "Pokémon"; o filtro { marca: 'LEGO', tema: 'Speed Champions' } deixa
//   passar só os LEGO desse tema.

import type { Produto } from './types';

/** Filtro de categoria: só a marca (categoria) ou marca + tema (subcategoria). */
export interface FiltroCategoria {
  marca: string;
  tema?: string;
}

/** Texto sem acentos e em minúsculas, para comparar. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** O tema só conta como subcategoria se for diferente da marca. */
export function temaDe(p: Pick<Produto, 'tema' | 'marca'>): string | null {
  return p.tema && normalizar(p.tema) !== normalizar(p.marca) ? p.tema.trim() : null;
}

/** Verdadeiro se o produto pertence à categoria/subcategoria escolhida (sem filtro, todos). */
export function naCategoria(p: Pick<Produto, 'tema' | 'marca'>, f: FiltroCategoria | null | undefined): boolean {
  if (!f) return true;
  if (normalizar(p.marca) !== normalizar(f.marca)) return false;
  return !f.tema || normalizar(temaDe(p)) === normalizar(f.tema);
}
