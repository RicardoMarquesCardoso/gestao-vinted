// Wallapop: o "preço da concorrência" de cada set, como mais uma variável do preço de venda
// esperado (pedido do Ricardo, nov/2026).
//
// DE ONDE VEM: a função wallapop-rotacao do Supabase pesquisa cada set LEGO em stock uma vez por
// semana e guarda em definicoes.wallapop_pesquisas (ver supabase/functions/_shared/wallapop.ts):
//   { "76440": { data, mediana, anuncios, hist: [[data, mediana, anuncios], …] } }
// A mediana é do preço PEDIDO de anúncios de "novo" em Portugal e Espanha, já sem caixas vazias,
// molduras, minifiguras, lotes, etc. A app só lê esta chave (nunca a escreve).
//
// COMO ENTRA NO PREÇO: tal como o eBay, um preço pedido não é um preço de venda. Multiplica-se pela
// percentagem a que costumamos vender (racioWallapop):
//   - medida nas nossas vendas, comparando cada venda com a Wallapop da MESMA ALTURA (o "hist",
//     até 30 dias de diferença), quando houver pelo menos 10 sets comparáveis (calibrarWallapop);
//   - até lá, RACIO_WALLAPOP (0,85): em nov/2026 os nossos anúncios estavam ~ao nível da mediana
//     da Wallapop (teste com 8 sets) e as nossas vendas ficaram a ~83% do último preço anunciado.
// Depois junta-se com o eBay (juntarMercado): média dos dois, pesada pelo n.º de anúncios de cada
// um (no máximo 20 cada, para uma fonte com muitos anúncios não apagar a outra).
//
// Funções puras, testadas em tests/wallapop.test.ts.

import { produtoNovo } from './anuncio';
import { diasEntre, vendaValida } from './calc';
import { ultimoResultado } from './memo';
import type { Dados, Definicao } from './types';

export const CHAVE_PESQUISAS_WALLAPOP = 'wallapop_pesquisas';
/** Percentagem do preço pedido na Wallapop a que vendemos, enquanto não há vendas para medir. */
export const RACIO_WALLAPOP = 0.85;
/** Uma pesquisa com mais de 30 dias já não conta (a rotação repete cada set a cada 7). */
export const VALIDADE_WALLAPOP_DIAS = 30;
const MIN_SETS_CALIBRACAO = 10;
const TOLERANCIA_DIAS = 30;
/** Peso máximo de cada fonte na média (n.º de anúncios). */
const PESO_MAXIMO = 20;

export interface PesquisaWallapop {
  data: string;
  mediana?: number | null;
  anuncios: number;
  hist?: [string, number | null, number][];
}

const numeroBase = (s: string) => s.trim().replace(/-\d+$/, '');

/** Todas as pesquisas guardadas (objeto vazio se ainda não houver). */
export function pesquisasWallapop(definicoes: Pick<Definicao, 'chave' | 'valor'>[]): Record<string, PesquisaWallapop> {
  const v = definicoes.find((d) => d.chave === CHAVE_PESQUISAS_WALLAPOP)?.valor;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, PesquisaWallapop>) : {};
}

/**
 * A Wallapop de hoje de um set: [mediana pedida, n.º de anúncios, data], se a última pesquisa tem
 * mediana (≥ 3 anúncios válidos) e no máximo 30 dias.
 */
export function wallapopAtual(definicoes: Pick<Definicao, 'chave' | 'valor'>[], set: string | null, hoje: string): [number, number, string] | null {
  if (!set) return null;
  const p = pesquisasWallapop(definicoes)[numeroBase(set)];
  if (!p?.mediana || p.anuncios < 3 || diasEntre(p.data, hoje) > VALIDADE_WALLAPOP_DIAS) return null;
  return [p.mediana, p.anuncios, p.data];
}

/** A Wallapop de um set numa data: o registo do histórico mais próximo, até 30 dias de diferença. */
export function wallapopNaData(pesquisas: Record<string, PesquisaWallapop>, set: string, data: string): number | null {
  let melhor: number | null = null;
  let distancia = Infinity;
  for (const [d, mediana, n] of pesquisas[numeroBase(set)]?.hist ?? []) {
    if (!mediana || n < 3) continue;
    const x = Math.abs(diasEntre(d, data));
    if (x < distancia) {
      distancia = x;
      melhor = mediana;
    }
  }
  return distancia <= TOLERANCIA_DIAS ? melhor : null;
}

export interface CalibracaoWallapop {
  racio: number; // ex.: 0.85 = vendemos a 85% do preço pedido na Wallapop
  sets: number;
}

/**
 * Percentagem real a que vendemos face à Wallapop da mesma altura, pelas vendas de sets novos do
 * último ano: por set, média de (venda ÷ Wallapop); depois a mediana dos sets. null com menos de
 * 10 sets (a Wallapop só começou a ser guardada em nov/2026, por isso nos primeiros meses é null).
 */
export const calibrarWallapop = ultimoResultado(
  (dados: Pick<Dados, 'produtos' | 'vendas' | 'definicoes'>, hoje: string): CalibracaoWallapop | null => {
    const pesquisas = pesquisasWallapop(dados.definicoes);
    const produtos = new Map(dados.produtos.map((p) => [p.id, p]));
    const porSet = new Map<string, number[]>();
    for (const v of dados.vendas) {
      const p = produtos.get(v.produto_id);
      if (!p?.set_numero || !vendaValida(v) || !produtoNovo(p) || !(v.preco_venda > 0)) continue;
      if (v.notas?.includes('data de venda desconhecida') || diasEntre(v.data_venda, hoje) > 365) continue;
      const w = wallapopNaData(pesquisas, p.set_numero, v.data_venda);
      if (!w) continue;
      const set = numeroBase(p.set_numero);
      porSet.set(set, [...(porSet.get(set) ?? []), v.preco_venda / (v.quantidade || 1) / w]);
    }
    const racios = [...porSet.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length).sort((a, b) => a - b);
    const n = racios.length;
    if (n < MIN_SETS_CALIBRACAO) return null;
    const mediana = n % 2 ? racios[(n - 1) / 2] : (racios[n / 2 - 1] + racios[n / 2]) / 2;
    // Entre 50% e 110%, arredondado às centésimas
    return { racio: Math.round(Math.min(Math.max(mediana, 0.5), 1.1) * 100) / 100, sets: n };
  },
);

/** A percentagem a usar: a medida, ou a de reserva enquanto há poucas vendas para comparar. */
export const racioWallapop = (dados: Pick<Dados, 'produtos' | 'vendas' | 'definicoes'>, hoje: string): number =>
  calibrarWallapop(dados, hoje)?.racio ?? RACIO_WALLAPOP;

export interface FonteMercado {
  preco: number; // já com a percentagem a que vendemos
  pedido: number; // mediana do preço pedido
  anuncios: number;
}

/**
 * Junta o eBay e a Wallapop num só preço de venda esperado: média pesada pelo n.º de anúncios
 * (no máximo 20 cada). Com só uma das duas, é essa. Sem nenhuma, null.
 */
export function juntarMercado(ebay: FonteMercado | null, wallapop: FonteMercado | null): number | null {
  const fontes = [ebay, wallapop].filter((f): f is FonteMercado => !!f && f.preco > 0);
  if (!fontes.length) return null;
  const peso = (f: FonteMercado) => Math.min(Math.max(f.anuncios, 1), PESO_MAXIMO);
  const total = fontes.reduce((a, f) => a + peso(f), 0);
  return fontes.reduce((a, f) => a + f.preco * peso(f), 0) / total;
}

/** Texto curto de uma fonte: "eBay ~92 € (12) · Wallapop ~80 € (9)". */
export function textoMercado(ebay: FonteMercado | null, wallapop: FonteMercado | null): string {
  const partes: string[] = [];
  if (ebay) partes.push(`eBay ~${Math.round(ebay.pedido)} € (${ebay.anuncios})`);
  if (wallapop) partes.push(`Wallapop ~${Math.round(wallapop.pedido)} € (${wallapop.anuncios})`);
  return partes.join(' · ');
}
