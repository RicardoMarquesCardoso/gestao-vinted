// Promoções recebidas automaticamente de outra app (ex.: a app do Ricardo que tira a lista de LEGO
// em promoção no Continente).
//
// COMO CHEGAM: a outra app chama a função receber_promocao do Supabase (ver supabase/schema.sql)
// com o código secreto definicoes.token_promocoes. Cada promoção fica em definicoes.promocoes
// (as 50 mais recentes, a primeira é a mais nova), no formato Promocao abaixo.
//
// O QUE A VINTEDUO FAZ: ao abrir, o Painel mostra as promoções novas (das últimas 7 dias, ou ainda
// válidas) com quantos sets compensam; tocar abre o Vale a pena? → Promoção da loja já preenchido.
// Uma promoção pode ser dispensada do Painel (fica em definicoes.promocoes_vistas).

import { diasEntre } from './calc';
import { extrairItens } from './avaliar';
import type { Definicao } from './types';

export const CHAVE_PROMOCOES = 'promocoes';
export const CHAVE_PROMOCOES_VISTAS = 'promocoes_vistas';
export const CHAVE_TOKEN_PROMOCOES = 'token_promocoes';
/** Durante quantos dias uma promoção sem data de fim aparece no Painel. */
export const DIAS_PROMOCAO_NOVA = 7;

export interface Promocao {
  id: string;
  recebida: string; // data e hora (ISO)
  loja: string;
  /** A lista em texto livre, como se colava na app. */
  texto?: string;
  /** % de desconto sobre o PVP (ex.: 25), quando é igual para todos os sets. */
  desconto?: number;
  /** Ou a lista já arrumada: set e, se houver, preço na loja e/ou desconto próprio (%, ex.: 30). */
  itens?: { set?: string | number; preco?: number | string | null; desconto?: number | string | null }[];
  valida_ate?: string;
}

const valor = <T,>(defs: Definicao[], chave: string, padrao: T): T => (defs.find((d) => d.chave === chave)?.valor as unknown as T) ?? padrao;

/** Promoções recebidas, das mais recentes para as mais antigas. */
export const promocoesRecebidas = (defs: Definicao[]): Promocao[] => {
  const v = valor<unknown>(defs, CHAVE_PROMOCOES, []);
  return Array.isArray(v) ? (v as Promocao[]).filter((p) => p && p.id && p.loja) : [];
};

/** Ids das promoções dispensadas do Painel. */
export const promocoesVistas = (defs: Definicao[]): string[] => {
  const v = valor<unknown>(defs, CHAVE_PROMOCOES_VISTAS, []);
  return Array.isArray(v) ? (v as string[]) : [];
};

/** Promoções a mostrar no Painel: ainda válidas (ou recebidas há até 7 dias) e não dispensadas. */
export function promocoesNovas(defs: Definicao[], hoje: string): Promocao[] {
  const vistas = new Set(promocoesVistas(defs));
  return promocoesRecebidas(defs).filter(
    (p) => !vistas.has(p.id) && (p.valida_ate ? p.valida_ate >= hoje : diasEntre(p.recebida.slice(0, 10), hoje) <= DIAS_PROMOCAO_NOVA),
  );
}

/** Desconto da promoção em fração (25 → 0,25), ou 0 se não tiver. */
export const descontoDe = (p: Promocao) => (typeof p.desconto === 'number' && p.desconto > 0 ? Math.min(p.desconto, 90) / 100 : 0);

/** Número de um campo que pode vir como texto ("63,74", "30%"); null se não for um número > 0. */
const numero = (v: unknown): number | null => {
  const x = typeof v === 'string' ? Number(v.replace('%', '').replace(',', '.').trim()) : v;
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
};

/**
 * Sets, preços e descontos próprios de uma promoção: os da lista arrumada (itens) e os encontrados
 * no texto. Os itens têm prioridade (são exatos); o texto completa o que faltar.
 * Os descontos vêm em fração (30% → 0,3).
 */
export function setsDaPromocao(
  p: Promocao,
  existe: (n: string) => boolean,
): { sets: string[]; precos: Record<string, number | null>; descontos: Record<string, number | null> } {
  const precos: Record<string, number | null> = {};
  const descontos: Record<string, number | null> = {};
  const sets: string[] = [];
  for (const i of p.itens ?? []) {
    const n = String(i?.set ?? '').trim().replace(/-\d+$/, '');
    if (!/^\d{3,7}$/.test(n) || sets.includes(n)) continue;
    sets.push(n);
    precos[n] = numero(i.preco);
    const d = numero(i.desconto);
    descontos[n] = d !== null && d <= 90 ? d / 100 : null;
  }
  for (const i of extrairItens(p.texto ?? '', existe)) {
    if (!sets.includes(i.set)) {
      sets.push(i.set);
      precos[i.set] = null;
      descontos[i.set] = null;
    }
    if (precos[i.set] === null) precos[i.set] = i.preco;
    if (descontos[i.set] === null) descontos[i.set] = i.desconto;
  }
  return { sets, precos, descontos };
}
