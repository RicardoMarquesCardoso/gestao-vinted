// "Vale a pena?": até que preço compensa comprar um set, e quantas unidades.
//
// Escreve-se só o n.º do set, e a app responde (precosCompra):
//   - por quanto se espera vender e em quantos dias;
//   - os preços de compra por escalão: "bom" (lucro ≥ margem "vender já" das regras, 20%),
//     "muito bom" (≥ 40%) e "oportunidade rara" (≥ 75%), e quantas unidades comprar em cada um.
//
// DIVERSIFICAR (pedido do Ricardo): acumular muitas unidades do mesmo set não compensa, a não
// ser numa oportunidade de outro mundo. Anuncia-se uma unidade de cada vez, por isso cada unidade
// a mais demora mais a vender e prende dinheiro. Regras:
//   - "bom" → ter 1 unidade; "muito bom" → até 2; "oportunidade rara" → até 3 (contando o stock);
//   - nunca ter mais de 10% do dinheiro em stock num só set (maxCapitalPorSet).
//
// Também se pode avaliar um preço concreto (avaliarCompra), com estes resultados:
//   - por quanto se espera vender (e de onde vem esse valor);
//   - quanto tempo deve demorar a vender (pelo nosso histórico);
//   - o lucro, a margem e a rentabilidade por ano (o tempo conta tanto como o lucro);
//   - um veredicto (bom / talvez / não compensa) e o preço máximo a pagar.
//
// PREÇO DE VENDA ESPERADO, por esta ordem (a primeira que existir):
//   1. As nossas vendas do mesmo set (as mesmas da função referencia() dos planos).
//   2. O eBay: mediana dos preços PEDIDOS na Europa × a percentagem a que costumamos vender
//      (calibrarEbay). Pode vir "ao vivo" (pedido no momento à função ebay-set do Supabase) ou
//      dos dados do dia (mercado-sets.json).
//   3. O PVP da Brickset × a percentagem do PVP a que costumamos vender, medida nas nossas
//      vendas (calibrarPvp), separada para sets ainda à venda e já retirados.
//
// Porquê esta ordem? Em out/2026 testámos as fontes nas nossas 102 vendas de LEGO com data
// (o "teste com o passado"): as nossas vendas erraram tipicamente ~11%, o eBay ~12% e o PVP ~20%.
// O mesmo teste mostrou que, nas nossas vendas, os sets retirados NÃO subiram como as taxas de
// valorização das regras assumem (vendemos a ~0,73 do PVP antes da retirada e ~0,80 depois). Por
// isso aqui o PVP usa o rácio medido, e não as taxas dos planos.
//
// Tudo isto são funções puras (sem ecrã), testadas em tests/avaliar.test.ts.

import { produtoNovo } from './anuncio';
import { custoUnitario, diasEntre, emInventario, unidadesDisponiveis, vendaValida } from './calc';
import { descontoEbayEfetivo, infoMercado } from './investimento';
import type { InfoMercado, Mercado } from './investimento';
import { referencia, regrasPlano } from './plano';
import type { Dados, Produto } from './types';

/** Lucro mínimo (em euros) para uma compra valer a vaga: cada conta só pode ter 30 vendas por ano. */
export const LUCRO_MINIMO = 5;

/** Rácios de reserva (out/2026) quando ainda há poucas vendas para medir: venda ÷ PVP. */
export const RACIO_PVP_A_VENDA = 0.73;
export const RACIO_PVP_RETIRADO = 0.8;
/** Mínimo de sets diferentes para confiar num rácio medido. */
const MIN_SETS_PVP = 5;

/** Erro típico de cada fonte, medido no teste com o passado (out/2026). Só para informar. */
export const ERRO_TIPICO = { vendas: 0.11, ebay: 0.12, pvp: 0.2 } as const;

export type FonteAvaliacao = keyof typeof ERRO_TIPICO;

export interface Estimativa {
  fonte: FonteAvaliacao;
  preco: number;
  texto: string;
}

export interface PedidoAvaliacao {
  set: string;
  /** Preço da promoção (por unidade). */
  preco: number;
  /** Portes ou outros custos da compra (por unidade). */
  portes?: number;
  /** Tema do set (do catálogo), para estimar o tempo até vender quando nunca o vendemos. */
  tema?: string | null;
  /** eBay pedido agora à função ebay-set: [mediana do preço pedido, n.º de anúncios]. */
  ebayAoVivo?: [number, number] | null;
}

export interface ContextoAvaliacao {
  dados: Pick<Dados, 'produtos' | 'vendas' | 'definicoes'>;
  mercado: Mercado | null;
  hoje: string;
}

export interface TempoVenda {
  dias: number;
  /** De onde veio: vendas deste set, do mesmo tema, ou de todos os sets. */
  base: 'set' | 'tema' | 'geral';
  n: number;
}

export interface Avaliacao {
  /** A estimativa usada (a primeira da lista disponível) e todas as que existem, para comparar. */
  venda: Estimativa | null;
  estimativas: Estimativa[];
  custo: number;
  lucro: number | null;
  margem: number | null; // lucro ÷ custo
  tempo: TempoVenda | null;
  rentabAnual: number | null; // margem anualizada pelos dias até vender
  veredicto: 'bom' | 'talvez' | 'mau' | null;
  motivo: string;
  /** Preço máximo a pagar (sem portes) para chegar à margem de "vender já" das regras. */
  precoMaximo: number | null;
  /** Unidades deste set que já temos em stock (anuncia-se uma de cada vez). */
  emStock: number;
  mercado: InfoMercado | null;
}

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null;
};
const numeroBase = (s: string) => s.trim().replace(/-\d+$/, '');
const normalizar = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const dataConhecida = (notas: string | null) => !notas?.includes('data de venda desconhecida');
const ehLego = (p: Pick<Produto, 'marca'>) => !p.marca || /lego/i.test(p.marca);

// ---------- Calibração do PVP ----------

export interface CalibracaoPvp {
  aVenda: number; // venda ÷ PVP, sets ainda à venda na data da venda
  retirado: number; // venda ÷ PVP, sets já retirados na data da venda
  setsAVenda: number;
  setsRetirado: number;
}

/**
 * A que percentagem do PVP costumamos vender, medida nas nossas vendas de sets LEGO novos dos
 * últimos 2 anos. Para cada set faz-se a média das vendas ÷ PVP; o rácio é a mediana dos sets.
 * Separa-se pela fase do set NA DATA DA VENDA (ainda à venda / já retirado). Com menos de 5
 * sets numa fase, usa-se o rácio de reserva.
 */
export function calibrarPvp(ctx: ContextoAvaliacao): CalibracaoPvp {
  const produtos = new Map(ctx.dados.produtos.map((p) => [p.id, p]));
  const fases = { aVenda: new Map<string, number[]>(), retirado: new Map<string, number[]>() };
  for (const v of ctx.dados.vendas) {
    const p = produtos.get(v.produto_id);
    if (!p?.set_numero || !ehLego(p) || !produtoNovo(p) || !vendaValida(v) || !(v.preco_venda > 0)) continue;
    if (!dataConhecida(v.notas) || diasEntre(v.data_venda, ctx.hoje) > 730) continue;
    const m = infoMercado(ctx.mercado, p.set_numero, ctx.hoje);
    if (!m?.pvp || !m.retirada) continue; // sem a data de retirada não se sabe a fase
    const fase = v.data_venda >= m.retirada ? fases.retirado : fases.aVenda;
    const set = numeroBase(p.set_numero);
    fase.set(set, [...(fase.get(set) ?? []), v.preco_venda / (v.quantidade || 1) / m.pvp]);
  }
  const racio = (porSet: Map<string, number[]>, reserva: number) => {
    const medias = [...porSet.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
    return medias.length >= MIN_SETS_PVP ? Math.round(mediana(medias)! * 100) / 100 : reserva;
  };
  return {
    aVenda: racio(fases.aVenda, RACIO_PVP_A_VENDA),
    retirado: racio(fases.retirado, RACIO_PVP_RETIRADO),
    setsAVenda: fases.aVenda.size,
    setsRetirado: fases.retirado.size,
  };
}

// ---------- Tempo até vender ----------

/**
 * Dias entre a compra e a venda, pelo nosso histórico de produtos novos: a mediana das vendas
 * deste set; se nunca o vendemos, a do mesmo tema (pelo menos 5 vendas); senão, a de tudo.
 * Atenção: as datas de compra importadas da folha ficaram no dia 1 do mês, e o tempo inclui os
 * sets guardados de propósito, por isso é uma estimativa grosseira. Quando houver dados suficientes
 * do tempo ANUNCIADO (produtos.anuncios, desde 27/10/2026), deve passar a usar-se esse.
 */
export const MIN_VENDAS_TEMA = 5;

export function tempoAteVender(ctx: ContextoAvaliacao, set: string, tema?: string | null): TempoVenda | null {
  const produtos = new Map(ctx.dados.produtos.map((p) => [p.id, p]));
  const linhas: { set: string; tema: string; dias: number }[] = [];
  for (const v of ctx.dados.vendas) {
    const p = produtos.get(v.produto_id);
    if (!p?.data_compra || !produtoNovo(p) || !vendaValida(v) || !dataConhecida(v.notas)) continue;
    const dias = diasEntre(p.data_compra, v.data_venda);
    if (dias < 0) continue;
    linhas.push({ set: numeroBase(p.set_numero ?? ''), tema: normalizar(p.tema), dias });
  }
  const n = numeroBase(set);
  const doSet = linhas.filter((l) => l.set === n).map((l) => l.dias);
  if (doSet.length) return { dias: Math.round(mediana(doSet)!), base: 'set', n: doSet.length };
  // O tema dos nossos produtos com este set conta mais do que o do catálogo (os nomes podem diferir)
  const temaNosso = ctx.dados.produtos.find((p) => p.set_numero && numeroBase(p.set_numero) === n && p.tema)?.tema;
  const t = normalizar(temaNosso ?? tema);
  const doTema = t ? linhas.filter((l) => l.tema && (l.tema === t || l.tema.startsWith(t) || t.startsWith(l.tema))).map((l) => l.dias) : [];
  if (doTema.length >= MIN_VENDAS_TEMA) return { dias: Math.round(mediana(doTema)!), base: 'tema', n: doTema.length };
  const todos = linhas.map((l) => l.dias);
  return todos.length ? { dias: Math.round(mediana(todos)!), base: 'geral', n: todos.length } : null;
}

// ---------- Avaliação ----------

/** Arredondar para baixo ao meio euro (para o preço máximo nunca ficar acima do que compensa). */
const meioEuroAbaixo = (x: number) => Math.floor(x * 2) / 2;

/** Produto "de faz de conta" com este set, para reutilizar a referência dos planos. */
const produtoDoSet = (set: string): Produto => ({
  id: '__avaliar__', compra_id: null, nome: set, descricao: null, marca: 'LEGO', tema: null, set_numero: set,
  condicao: null, quantidade: 1, data_compra: null, preco_compra: 0, custos_adicionais: 0, pessoa_id: null,
  tipo_pagamento: 'pessoa', estado: 'por_anunciar', conta_id: null, data_anuncio: null, preco_anuncio: null, notas: null, fotos: [],
});

/** Todas as estimativas de preço de venda disponíveis para um set novo, pela ordem de confiança. */
export function estimativas(ctx: ContextoAvaliacao, set: string, ebayAoVivo?: [number, number] | null): Estimativa[] {
  const r: Estimativa[] = [];
  // 1. As nossas vendas (mesma regra dos planos: últimos 2 anos, o último ano pesa mais)
  const ref = referencia(produtoDoSet(set.trim()), { dados: ctx.dados, mercado: ctx.mercado, hoje: ctx.hoje });
  if (ref?.fonte === 'vendas') r.push({ fonte: 'vendas', preco: ref.preco, texto: ref.texto });
  // 2. eBay (ao vivo, se houver; senão o do dia)
  const m = infoMercado(ctx.mercado, set, ctx.hoje);
  const eb = ebayAoVivo && ebayAoVivo[1] >= 3 ? ebayAoVivo : m?.ebay && m.ebay[1] >= 3 ? m.ebay : null;
  if (eb) {
    const fator = 1 - descontoEbayEfetivo(ctx.dados, ctx.mercado, ctx.hoje);
    r.push({
      fonte: 'ebay',
      preco: eb[0] * fator,
      texto: `${eb[1]} anúncios a ~${Math.round(eb[0])} € → a ~${Math.round(fator * 100)}%, como costumamos vender`,
    });
  }
  // 3. PVP × o rácio a que costumamos vender (fase atual do set)
  if (m?.pvp) {
    const cal = calibrarPvp(ctx);
    const retirado = m.retirado === true;
    const racio = retirado ? cal.retirado : cal.aVenda;
    r.push({
      fonte: 'pvp',
      preco: m.pvp * racio,
      texto: `${Math.round(m.pvp)} € → a ~${Math.round(racio * 100)}% (${retirado ? 'sets já retirados' : 'sets ainda à venda'}, pelas nossas vendas)`,
    });
  }
  return r;
}

/** Avalia a compra de uma unidade de um set novo ao preço pedido. */
export function avaliarCompra(ped: PedidoAvaliacao, ctx: ContextoAvaliacao): Avaliacao {
  const regras = regrasPlano(ctx.dados.definicoes);
  const set = numeroBase(ped.set);
  const custo = Math.max(ped.preco, 0) + Math.max(ped.portes ?? 0, 0);
  const lista = estimativas(ctx, set, ped.ebayAoVivo);
  const venda = lista[0] ?? null;
  const tempo = tempoAteVender(ctx, set, ped.tema);
  const emStock = ctx.dados.produtos
    .filter((p) => p.set_numero && numeroBase(p.set_numero) === set && produtoNovo(p) && emInventario(p))
    .reduce((a, p) => a + unidadesDisponiveis(p, ctx.dados.vendas), 0);
  const base = { estimativas: lista, custo, tempo, emStock, mercado: infoMercado(ctx.mercado, set, ctx.hoje) };

  if (!venda) {
    return { ...base, venda, lucro: null, margem: null, rentabAnual: null, veredicto: null, precoMaximo: null, motivo: 'Sem dados para estimar o preço de venda deste set.' };
  }

  const lucro = venda.preco - custo;
  const margem = custo > 0 ? lucro / custo : null;
  // Rentabilidade por ano: a margem repetida tantas vezes quantas cabem num ano (mínimo 7 dias,
  // para uma venda muito rápida não dar números absurdos)
  const rentabAnual = margem !== null && tempo ? (margem * 365) / Math.max(tempo.dias, 7) : null;
  const precoMaximo = Math.max(meioEuroAbaixo(venda.preco / (1 + regras.margemVender) - (ped.portes ?? 0)), 0);

  let veredicto: Avaliacao['veredicto'];
  let motivo: string;
  if (margem === null || margem < regras.margemChao || lucro < 2) {
    veredicto = 'mau';
    motivo = lucro <= 0 ? 'Vende-se por menos do que custa.' : 'O lucro esperado é demasiado pequeno.';
  } else if (margem >= regras.margemVender && lucro >= LUCRO_MINIMO) {
    veredicto = 'bom';
    motivo = `Lucro de ${Math.round(margem * 100)}%, acima dos ${Math.round(regras.margemVender * 100)}% das regras.`;
  } else {
    veredicto = 'talvez';
    motivo =
      margem < regras.margemVender
        ? `Lucro de ${Math.round(margem * 100)}%, abaixo dos ${Math.round(regras.margemVender * 100)}% das regras.`
        : `Só ~${Math.round(lucro)} € de lucro: pode não valer uma das 30 vendas por ano da conta.`;
  }
  if (emStock > 0 && veredicto !== 'mau') motivo += ` Já têm ${emStock} em stock e só se anuncia um de cada vez, por isso esta unidade vai demorar mais.`;

  return { ...base, venda, lucro, margem, rentabAnual, veredicto, motivo, precoMaximo };
}

// ---------- Preços de compra e quantidades ----------

export type NomeEscalao = 'rara' | 'otimo' | 'bom';

export interface Escalao {
  nome: NomeEscalao;
  margem: number; // lucro mínimo sobre o custo neste escalão
  /** Pagar no máximo isto por unidade (arredondado para baixo ao meio euro). */
  precoMax: number;
  /** Unidades a ter no total neste escalão (1, 2 ou 3) e quantas comprar (descontado o stock e o limite de capital). */
  alvo: number;
  comprar: number;
  /** Porque se compra menos do que o alvo (stock, limite de capital). */
  limite: string | null;
}

export interface PrecosCompra {
  venda: Estimativa | null;
  estimativas: Estimativa[];
  tempo: TempoVenda | null;
  emStock: number;
  /** Dinheiro já investido neste set (unidades em stock) e no stock todo. */
  custoNoSet: number;
  capitalStock: number;
  /** Do melhor para o pior: rara, otimo, bom. Vazio se não houver preço de venda. */
  escaloes: Escalao[];
  mercado: InfoMercado | null;
}

/** Quantas unidades ter, no máximo, em cada escalão. */
export const UNIDADES_ESCALAO: Record<NomeEscalao, number> = { rara: 3, otimo: 2, bom: 1 };

/**
 * Até que preço compensa comprar um set novo, e quantas unidades, por escalão de lucro.
 * Preço máximo = venda esperada ÷ (1 + margem), e nunca mais do que venda − 5 € (lucro mínimo
 * para valer uma das 30 vendas por ano da conta).
 */
export function precosCompra(ped: Omit<PedidoAvaliacao, 'preco' | 'portes'>, ctx: ContextoAvaliacao): PrecosCompra {
  const r = regrasPlano(ctx.dados.definicoes);
  const set = numeroBase(ped.set);
  const lista = estimativas(ctx, set, ped.ebayAoVivo);
  const venda = lista[0] ?? null;
  // Stock: unidades por vender de todos os produtos, e as deste set (novos)
  let capitalStock = 0;
  let custoNoSet = 0;
  let emStock = 0;
  for (const p of ctx.dados.produtos) {
    if (!emInventario(p)) continue;
    const disp = unidadesDisponiveis(p, ctx.dados.vendas);
    if (disp <= 0) continue;
    capitalStock += custoUnitario(p) * disp;
    if (p.set_numero && numeroBase(p.set_numero) === set && produtoNovo(p)) {
      custoNoSet += custoUnitario(p) * disp;
      emStock += disp;
    }
  }
  const base = { venda, estimativas: lista, tempo: tempoAteVender(ctx, set, ped.tema), emStock, custoNoSet, capitalStock, mercado: infoMercado(ctx.mercado, set, ctx.hoje) };
  if (!venda) return { ...base, escaloes: [] };

  const margens: Record<NomeEscalao, number> = { rara: r.margemCompraRara, otimo: r.margemCompraOtima, bom: r.margemVender };
  const escaloes = (['rara', 'otimo', 'bom'] as NomeEscalao[]).map((nome): Escalao => {
    const margem = margens[nome];
    const precoMax = Math.max(meioEuroAbaixo(Math.min(venda.preco / (1 + margem), venda.preco - LUCRO_MINIMO)), 0);
    const alvo = UNIDADES_ESCALAO[nome];
    let comprar = Math.max(alvo - emStock, 0);
    let limite: string | null = emStock > 0 && comprar < alvo ? `já têm ${emStock} em stock` : null;
    // Limite de capital: (já neste set + k × preço) ≤ máx. × (stock + k × preço)
    if (comprar > 0 && precoMax > 0 && capitalStock > 0) {
      const cabe = Math.floor((r.maxCapitalPorSet * capitalStock - custoNoSet) / (precoMax * (1 - r.maxCapitalPorSet)));
      // Pelo menos 1 se ainda não há nenhuma: o limite serve para não acumular, não para impedir de ter o set
      const maximo = emStock === 0 ? Math.max(cabe, 1) : Math.max(cabe, 0);
      if (maximo < comprar) {
        comprar = maximo;
        limite = `mais de ${Math.round(r.maxCapitalPorSet * 100)}% do dinheiro em stock num só set`;
      }
    }
    if (precoMax <= 0) comprar = 0;
    return { nome, margem, precoMax, alvo, comprar, limite };
  });
  return { ...base, escaloes };
}

// ---------- Promoções de lojas: "a 25% na Fnac, que sets compro?" ----------
//
// Nas lojas grandes (Fnac, Continente, Toys R Us…) o preço de partida é o PVP, por isso uma
// promoção é só uma percentagem de desconto. Cola-se a lista de sets (ou o texto copiado da
// página da loja) e a app diz, para cada um: preço na promoção = PVP × (1 − desconto), se compensa,
// em que escalão e quantas unidades. Os que compensam aparecem primeiro, ordenados pelo lucro
// "seguro" (o lucro mesmo que a venda fique abaixo do esperado pelo erro típico da fonte).
// Para diversificar, no máximo MAX_POR_TEMA_PROMO compras do mesmo tema numa promoção.

export const MAX_POR_TEMA_PROMO = 2;

/**
 * Tira os n.º de set de um texto qualquer (uma lista escrita à mão ou o texto copiado da página da
 * loja). Só aceita números de 4 a 6 algarismos que não façam parte de preços nem de códigos de
 * barras, e que o "existe" reconheça como set (ex.: está na Brickset). Sem repetidos, pela ordem.
 */
export function extrairSets(texto: string, existe: (n: string) => boolean): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(/(?<![\d.,])(\d{4,6})(?:-\d{1,2})?(?![\d]|[.,]\d)/g)) {
    const n = m[1];
    if (!vistos.has(n) && existe(n)) vistos.add(n);
  }
  return [...vistos];
}

export interface ItemPromo {
  set: string;
  /** Preço na loja, se a lista o tiver (o mais baixo encontrado para esse set); senão null. */
  preco: number | null;
  /** Desconto próprio deste set (fração, 0,3 = 30%), se a lista o tiver; senão null. */
  desconto: number | null;
}

/** Preços num texto: "63,74 €", "1.299,99", "€ 63.74"… (números com 2 casas decimais). */
const PRECO = /(?<![\d.,])(\d{1,3}(?:[.\s]\d{3})+|\d+)[.,](\d{2})(?![\d])/g;
const lerPrecos = (linha: string) =>
  [...linha.matchAll(PRECO)].map((m) => Number(`${m[1].replace(/[.\s]/g, '')}.${m[2]}`)).filter((x) => x > 0);
/** Percentagens num texto: "-30%", "30 %", "25,5%" (entre 1% e 90%, em fração). */
const PERCENT = /(?<![\d.,])(\d{1,2}(?:[.,]\d+)?)\s*%/g;
const lerDescontos = (linha: string) =>
  [...linha.matchAll(PERCENT)].map((m) => Number(m[1].replace(',', '.')) / 100).filter((x) => x >= 0.01 && x <= 0.9);

/**
 * Sets e respetivos preços e descontos num texto (lista da loja). Cada set fica com os preços e as
 * percentagens da sua linha e das linhas seguintes sem outro set (nas páginas copiadas, o preço
 * costuma vir por baixo do nome). Usa-se o preço mais baixo (o com desconto) e a maior
 * percentagem (ex.: "-30%"). Uma linha com vários sets não dá preço nem desconto a nenhum.
 */
export function extrairItens(texto: string, existe: (n: string) => boolean): ItemPromo[] {
  const itens = new Map<string, ItemPromo>();
  let atual: ItemPromo | null = null;
  for (const linha of texto.split(/\r?\n/)) {
    const sets = extrairSets(linha, existe);
    // Os preços contam-se sem os números de set (ex.: "75375" não é um preço)
    const precos = lerPrecos(linha);
    const descontos = lerDescontos(linha);
    if (sets.length) {
      for (const n of sets) if (!itens.has(n)) itens.set(n, { set: n, preco: null, desconto: null });
      atual = sets.length === 1 ? itens.get(sets[0])! : null;
    }
    if (atual && precos.length) {
      const min = Math.min(...precos);
      atual.preco = atual.preco === null ? min : Math.min(atual.preco, min);
    }
    if (atual && descontos.length) {
      const max = Math.max(...descontos);
      atual.desconto = atual.desconto === null ? max : Math.max(atual.desconto, max);
    }
  }
  return [...itens.values()];
}

export interface LinhaPromo {
  set: string;
  tema: string | null;
  /** Preço original: o PVP indicado pela loja, se veio na lista, senão o PVP da Brickset. */
  pvp: number | null;
  pvpOrigem: 'loja' | 'brickset' | null;
  preco: number | null; // preço na promoção
  /**
   * De onde vem o preço: 'loja' = o preço da lista; 'desconto' = PVP × (1 − desconto próprio do
   * set); 'pvp' = PVP × (1 − desconto geral da promoção).
   */
  origemPreco: 'loja' | 'desconto' | 'pvp' | null;
  /** Desconto sobre o PVP a que corresponde o preço (fração), se houver PVP. */
  descontoAplicado: number | null;
  precos: PrecosCompra;
  /** Melhor escalão que o preço da promoção cumpre (null = não compensa). */
  escalao: NomeEscalao | null;
  comprar: number;
  lucro: number | null; // por unidade, ao preço da promoção
  margem: number | null;
  /** Lucro sobre o custo se a venda ficar abaixo do esperado pelo erro típico da fonte. */
  margemSegura: number | null;
  rentabAnual: number | null;
  /** Desconto mínimo sobre o PVP a partir do qual compensa (escalão "bom"); null se nunca. */
  descontoMinimo: number | null;
  motivo: string;
}

/** Desconto mínimo sobre o PVP para pagar no máximo "precoMax" (arredondado ao 1% acima). */
const descontoPara = (pvp: number | null, precoMax: number | undefined) =>
  pvp && precoMax && precoMax > 0 && precoMax < pvp * 0.99 ? Math.ceil((1 - precoMax / pvp) * 100) / 100 : pvp && precoMax && precoMax >= pvp * 0.99 ? 0 : null;

/**
 * Avalia uma lista de sets numa promoção. Para cada set:
 *   - PVP (preço original): o indicado pela loja (opcoes.pvps), senão o da Brickset;
 *   - preço final, por esta ordem:
 *       1. o preço final da lista (opcoes.precos); um preço absurdo face ao PVP (menos de 20% ou
 *          mais de 105%, quase de certeza lido mal) é ignorado;
 *       2. PVP × (1 − desconto do set) (opcoes.descontos), porque cada set pode ter o seu;
 *       3. PVP × (1 − desconto geral da promoção).
 */
export function avaliarPromocao(
  sets: string[],
  desconto: number,
  ctx: ContextoAvaliacao,
  opcoes: {
    tema?: (n: string) => string | null | undefined;
    ebayAoVivo?: (n: string) => [number, number] | null | undefined;
    precos?: Record<string, number | null | undefined>;
    descontos?: Record<string, number | null | undefined>;
    pvps?: Record<string, number | null | undefined>;
  } = {},
): LinhaPromo[] {
  const linhas = sets.map((set): LinhaPromo => {
    const tema = opcoes.tema?.(set) ?? null;
    const precos = precosCompra({ set, tema, ebayAoVivo: opcoes.ebayAoVivo?.(set) ?? null }, ctx);
    const pvpLoja = opcoes.pvps?.[set] ?? null;
    const pvp = pvpLoja && pvpLoja > 0 ? pvpLoja : precos.mercado?.pvp ?? null;
    const pvpOrigem = pvpLoja && pvpLoja > 0 ? ('loja' as const) : pvp ? ('brickset' as const) : null;
    const daLoja = opcoes.precos?.[set] ?? null;
    const lojaValido = daLoja !== null && daLoja > 0 && (!pvp || (daLoja >= pvp * 0.2 && daLoja <= pvp * 1.05));
    const dSet = opcoes.descontos?.[set] ?? null;
    const dSetValido = dSet !== null && dSet > 0 && dSet <= 0.9;
    const aPvp = (d: number) => (pvp && d > 0 ? Math.round(pvp * (1 - d) * 100) / 100 : null);
    const preco = lojaValido ? daLoja : dSetValido ? aPvp(dSet) : aPvp(desconto);
    const origemPreco = lojaValido ? ('loja' as const) : !preco ? null : dSetValido ? ('desconto' as const) : ('pvp' as const);
    const descontoAplicado = preco && pvp ? Math.round((1 - preco / pvp) * 1000) / 1000 : null;
    const base = { set, tema, pvp, pvpOrigem, preco, origemPreco, descontoAplicado, precos, descontoMinimo: descontoPara(pvp, precos.escaloes.find((e) => e.nome === 'bom')?.precoMax) };
    if (!preco)
      return { ...base, escalao: null, comprar: 0, lucro: null, margem: null, margemSegura: null, rentabAnual: null, motivo: pvp ? 'Sem preço: indica o desconto.' : 'Sem preço nem PVP (na lista ou na Brickset).' };
    if (!precos.venda) return { ...base, escalao: null, comprar: 0, lucro: null, margem: null, margemSegura: null, rentabAnual: null, motivo: 'Sem dados para estimar o preço de venda.' };
    const venda = precos.venda.preco;
    const lucro = venda - preco;
    const margem = lucro / preco;
    const margemSegura = (venda * (1 - ERRO_TIPICO[precos.venda.fonte]) - preco) / preco;
    const rentabAnual = precos.tempo ? (margem * 365) / Math.max(precos.tempo.dias, 7) : null;
    // O melhor escalão cujo preço máximo o preço da promoção cumpre (rara → otimo → bom)
    const e = precos.escaloes.find((x) => preco <= x.precoMax) ?? null;
    let motivo: string;
    const aPartir = base.descontoMinimo !== null ? ` Compensa a partir de ${Math.round(base.descontoMinimo * 100)}%.` : ' Não compensa com nenhum desconto.';
    if (!e) motivo = (lucro <= 0 ? 'Vende-se por menos do que custa na promoção.' : `Lucro de ${Math.round(margem * 100)}%: pouco.`) + aPartir;
    else if (e.comprar === 0) motivo = e.limite ?? 'Não comprar.';
    else motivo = e.limite ?? '';
    return { ...base, escalao: e?.nome ?? null, comprar: e?.comprar ?? 0, lucro, margem, margemSegura, rentabAnual, motivo };
  });
  // Ordem: os que compensam primeiro, pelo lucro seguro; depois os outros, pelo lucro
  linhas.sort((a, b) => (b.comprar > 0 ? 1 : 0) - (a.comprar > 0 ? 1 : 0) || (b.margemSegura ?? -9) - (a.margemSegura ?? -9));
  // Diversificar por tema: no máximo MAX_POR_TEMA_PROMO compras do mesmo tema
  const porTema = new Map<string, number>();
  for (const l of linhas) {
    if (l.comprar === 0 || !l.tema) continue;
    const t = normalizar(l.tema);
    const ja = porTema.get(t) ?? 0;
    if (ja >= MAX_POR_TEMA_PROMO) {
      l.comprar = 0;
      l.motivo = `Já há ${MAX_POR_TEMA_PROMO} do tema ${l.tema} nesta lista (diversificar).`;
    } else porTema.set(t, ja + 1);
  }
  linhas.sort((a, b) => (b.comprar > 0 ? 1 : 0) - (a.comprar > 0 ? 1 : 0) || (b.margemSegura ?? -9) - (a.margemSegura ?? -9));
  return linhas;
}

// ---------- Links para ver o set noutros sites (abertos por nós, à mão) ----------

/**
 * Pesquisa do set na Vinted, do mais barato para o mais caro e, se for novo, só "Novo com
 * etiquetas" e "Novo sem etiquetas". No telemóvel, se a app da Vinted estiver instalada, abre lá.
 * É só um link: a VinteDuo não lê nada da Vinted.
 */
export function urlVinted(set: string, novo = true): string {
  const q = encodeURIComponent(`lego ${numeroBase(set)}`);
  return `https://www.vinted.pt/catalog?search_text=${q}&order=price_low_to_high${novo ? '&status_ids[]=6&status_ids[]=1' : ''}`;
}

/** Anúncios já vendidos do set no eBay Alemanha (o maior mercado LEGO na Europa), só novos. */
export function urlEbayVendidos(set: string): string {
  return `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(`lego ${numeroBase(set)}`)}&LH_Sold=1&LH_Complete=1&LH_ItemCondition=1000`;
}

/** Sets que acompanhamos sem os ter (a tarefa diária vai buscar o eBay deles): definicoes.sets_avaliar. */
export const CHAVE_SETS_AVALIAR = 'sets_avaliar';
