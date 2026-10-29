// Análise de investimento: quanto rende cada euro e durante quanto tempo fica preso.
import { useEffect, useState } from 'react';
import { produtoNovo } from './anuncio';
import { chaveComparacao, custoUnitario, custoVenda, diasEntre, emInventario, liquidoVenda, unidadesDisponiveis, vendaValida } from './calc';
import type { Dados, Produto } from './types';

// ---------- Dados de mercado (gerados todos os dias pela GitHub Action "mercado") ----------

/** [lançamento, retirada, PVP Alemanha (EUR), PVP Reino Unido (GBP), disponibilidade] */
export type LinhaBrickset = [string | null, string | null, number | null, number | null, string | null];

export interface Mercado {
  brickset: Record<string, LinhaBrickset>;
  /** Vendas dos últimos 6 meses na Europa, em EUR sem IVA: [média, n.º de unidades] */
  bricklink: Record<string, { n?: [number, number]; u?: [number, number] }>;
  /** eBay europeu: [mediana do preço PEDIDO em EUR por sets novos, n.º de anúncios] */
  ebay?: Record<string, [number, number]>;
  ebay_atualizado?: string | null;
  /**
   * Histórico do eBay por set: [data, mediana do preço pedido, n.º de anúncios]. A tarefa diária
   * acrescenta uma linha quando o preço muda, ou pelo menos uma vez por semana. Começou a 28/10/2026.
   * Serve para comparar cada venda com o eBay DA ALTURA dessa venda (calibrarEbay).
   */
  ebay_hist?: Record<string, [string, number, number][]>;
  /** Produtos Pokémon selados: chave = o nosso nome em minúsculas. Preço do TCGplayer (EUA). */
  pokemon?: Record<string, PrecoPokemon>;
  brickset_atualizado?: string | null;
  bricklink_atualizado?: string | null;
  pokemon_atualizado?: string | null;
}

/** Um produto Pokémon encontrado no TCGplayer (preço em dólares e convertido para euros). */
export interface ProdutoTcg {
  id: string;
  nome: string | null;
  set: string | null;
  usd: number | null;
  eur: number | null;
}

/**
 * O que a tarefa diária encontrou para um produto nosso:
 * - com preço (usd/eur) quando a associação é certa (feita por nós, ou pesquisa inequívoca);
 * - só "candidatos" quando a pesquisa encontrou vários parecidos e falta escolher.
 */
export interface PrecoPokemon extends Partial<ProdutoTcg> {
  auto: boolean; // true = pela pesquisa por nome; false = associação nossa
  candidatos?: ProdutoTcg[];
}

/** Chave usada para associar um produto Pokémon: o nome em minúsculas, sem espaços a mais. */
export const chavePokemon = (nome: string) => nome.trim().toLowerCase();

/** O que a tarefa diária guardou para este produto (com ou sem preço). */
export const entradaPokemon = (m: Mercado | null, nome: string): PrecoPokemon | null => m?.pokemon?.[chavePokemon(nome)] ?? null;

/**
 * Preço utilizável de um produto Pokémon, ou null.
 * - Se escolhemos um produto (definicoes.pokemon_ids) que está entre os candidatos, usa-o logo
 *   (sem esperar pela próxima atualização).
 * - Uma associação automática com um preço absurdo face ao custo (mais de 4× ou menos de ¼) é
 *   ignorada: quase de certeza é o produto errado.
 */
export function precoPokemon(m: Mercado | null, nome: string, ids: Record<string, string> = {}, custo?: number): (ProdutoTcg & { auto: boolean }) | null {
  const e = entradaPokemon(m, nome);
  if (!e) return null;
  const escolhido = ids[chavePokemon(nome)];
  if (escolhido) {
    if (e.id === escolhido && e.eur) return { ...(e as ProdutoTcg), auto: false };
    const c = e.candidatos?.find((x) => x.id === escolhido);
    return c?.eur ? { ...c, auto: false } : null;
  }
  if (!e.eur || !e.id) return null;
  if (custo && custo > 0 && (e.eur > custo * 4 || e.eur < custo / 4)) return null;
  return { ...(e as ProdutoTcg), auto: e.auto };
}

/**
 * Id TCGplayer que corresponde a este produto Pokémon, ou null se ainda não se sabe qual é.
 * - Se escolhemos um (definicoes.pokemon_ids), é esse, mesmo antes da próxima atualização.
 * - Senão, o que a pesquisa automática encontrou, desde que não haja candidatos por escolher
 *   e o preço não seja absurdo face ao custo (sinal de produto errado; ver precoPokemon).
 */
export function idTcgPokemon(m: Mercado | null, nome: string, ids: Record<string, string> = {}, custo?: number): string | null {
  const escolhido = ids[chavePokemon(nome)];
  if (escolhido) return escolhido;
  const e = entradaPokemon(m, nome);
  if (!e?.id || e.candidatos?.length) return null;
  if (custo && custo > 0 && e.eur && (e.eur > custo * 4 || e.eur < custo / 4)) return null;
  return e.id;
}

/**
 * Imagem do produto no TCGplayer, a partir do id. Não é guardada: o browser mostra-a
 * diretamente do site deles (como as imagens do Brickset nos LEGO). Pequena para as listas,
 * grande para o detalhe do produto.
 */
export const urlImagemTcg = (id: string | null | undefined, grande = false): string | null =>
  id && /^\d+$/.test(id) ? `https://tcgplayer-cdn.tcgplayer.com/product/${id}_${grande ? 'in_1000x1000' : '200w'}.jpg` : null;

/** Associações manuais dos produtos Pokémon (nome em minúsculas → tcgPlayerId). */
export const idsPokemon = (defs: { chave: string; valor: unknown }[] | undefined): Record<string, string> =>
  ((defs ?? []).find((d) => d.chave === 'pokemon_ids')?.valor ?? {}) as Record<string, string>;

const VAZIO: Mercado = { brickset: {}, bricklink: {} };
let pedido: Promise<Mercado> | null = null;

function carregarMercado() {
  pedido ??= fetch('mercado-sets.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : VAZIO))
    .then((j: Partial<Mercado>) => ({ ...VAZIO, ...j }))
    .catch(() => {
      pedido = null;
      return VAZIO;
    });
  return pedido;
}

/** Dados de mercado, carregados só quando são precisos. */
export function useMercado(): Mercado | null {
  const [m, setM] = useState<Mercado | null>(null);
  useEffect(() => {
    let ativo = true;
    void carregarMercado().then((x) => ativo && setM(x));
    return () => {
      ativo = false;
    };
  }, []);
  return m;
}

export interface InfoMercado {
  lancamento: string | null;
  retirada: string | null;
  /** true = já saiu de produção; false = ainda à venda; null = não se sabe */
  retirado: boolean | null;
  pvp: number | null; // EUR (LEGO Alemanha)
  blNovo: [number, number] | null;
  blUsado: [number, number] | null;
  /** eBay: [mediana do preço pedido (novos), n.º de anúncios] */
  ebay: [number, number] | null;
}

/** Desconto das regras (Definições → "descontoEbay"), usado só quando não há vendas para calibrar. */
export const descontoEbay = (defs: { chave: string; valor: unknown }[] | undefined): number => {
  const r = (defs ?? []).find((d) => d.chave === 'regras_plano')?.valor as { descontoEbay?: number } | undefined;
  return typeof r?.descontoEbay === 'number' ? r.descontoEbay : 0.37;
};

/**
 * Desconto a aplicar aos preços pedidos no eBay: o real, medido nas nossas vendas (calibrarEbay),
 * ou, se ainda houver poucas vendas comparáveis, o das regras.
 */
export const descontoEbayEfetivo = (d: Pick<Dados, 'produtos' | 'vendas'> & Partial<Pick<Dados, 'definicoes'>>, m: Mercado | null, hoje: string): number =>
  calibrarEbay(d, m, hoje)?.desconto ?? descontoEbay(d.definicoes);

// ---------- Calibração do eBay ----------
//
// Os preços do eBay são PEDIDOS, e nós vendemos na Vinted, por isso recebemos bastante menos.
// Para saber quanto menos, comparamos as nossas vendas com o preço pedido no eBay para os mesmos
// sets: para cada set, preço médio a que vendemos ÷ preço pedido no eBay. A mediana desses rácios
// (todos os sets) dá a percentagem que costumamos conseguir; o desconto é o resto.
//
// IMPORTANTE: comparar com o eBay DA MESMA ALTURA. Uma venda de há um ano não se pode comparar
// com o preço pedido hoje: se entretanto o set foi retirado, o eBay subiu e parecia que vendemos
// "barato" (em out/2026: 0,57 nesses sets contra 0,67 nos que não mudaram de fase). Por isso, para
// cada venda usa-se, por esta ordem:
//   1. o eBay do histórico (ebay_hist) mais próximo da data da venda, até 30 dias de diferença;
//   2. se ainda não há histórico dessa altura, o eBay de hoje, MAS só se o set ainda está à venda
//      na LEGO (não mudou de fase desde a venda, por isso o preço é comparável);
//   3. senão, a venda não entra na conta.
// Com o tempo, as vendas novas passam todas a usar o histórico. Recalcula-se sozinho a cada venda.

/** Mínimo de sets comparáveis para confiar na calibração (abaixo disto usa-se a regra). */
export const MIN_SETS_CALIBRACAO = 10;
/** Diferença máxima, em dias, entre a venda e o registo do eBay com que se compara. */
export const TOLERANCIA_EBAY_DIAS = 30;

export interface CalibracaoEbay {
  desconto: number; // ex.: 0.37
  sets: number; // quantos sets entraram na conta
  dias: number; // janela usada: vendas dos últimos 365 dias (ou 730, se houver poucas)
  naData: number; // sets comparados com o eBay da altura da venda (histórico)
  mesmaFase: number; // sets comparados com o eBay de hoje (ainda à venda na LEGO)
}

/**
 * Preço do eBay de um set numa data: o registo do histórico mais próximo dessa data, se tiver no
 * máximo TOLERANCIA_EBAY_DIAS de diferença. Devolve [mediana pedida, n.º de anúncios] ou null.
 */
export function ebayNaData(m: Mercado | null, set: string, data: string): [number, number] | null {
  const h = m?.ebay_hist?.[numeroBase(set)];
  if (!h?.length) return null;
  let melhor: [number, number] | null = null;
  let distancia = Infinity;
  for (const [d, mediana, n] of h) {
    const x = Math.abs(diasEntre(d, data));
    if (x < distancia) {
      distancia = x;
      melhor = [mediana, n];
    }
  }
  return distancia <= TOLERANCIA_EBAY_DIAS ? melhor : null;
}

let cacheCal: { vendas: unknown; produtos: unknown; mercado: unknown; hoje: string; r: CalibracaoEbay | null } | null = null;

/** Desconto real sobre o eBay, medido nas nossas vendas de sets novos; null se houver poucos dados. */
export function calibrarEbay(dados: Pick<Dados, 'produtos' | 'vendas'>, mercado: Mercado | null, hoje: string): CalibracaoEbay | null {
  // Guarda o último resultado: é pedido para cada produto, mas só muda quando mudam os dados
  if (cacheCal && cacheCal.vendas === dados.vendas && cacheCal.produtos === dados.produtos && cacheCal.mercado === mercado && cacheCal.hoje === hoje) return cacheCal.r;
  const produtos = new Map(dados.produtos.map((p) => [p.id, p]));
  const medir = (dias: number): CalibracaoEbay | null => {
    // Para cada set: os rácios venda ÷ eBay comparável, e se algum veio do histórico
    const porSet = new Map<string, { racios: number[]; naData: boolean }>();
    for (const v of dados.vendas) {
      const p = produtos.get(v.produto_id);
      if (!p?.set_numero || !vendaValida(v) || !produtoNovo(p) || !(v.preco_venda > 0)) continue;
      if (v.notas?.includes('data de venda desconhecida') || diasEntre(v.data_venda, hoje) > dias) continue;
      const set = numeroBase(p.set_numero);
      let e = ebayNaData(mercado, set, v.data_venda);
      const naData = !!e && e[1] >= 3;
      if (!naData) {
        // Sem histórico dessa altura: o eBay de hoje só serve se o set ainda está à venda na LEGO
        const info = infoMercado(mercado, set, hoje);
        e = info?.retirada && info.retirada > hoje ? info.ebay : null;
      }
      if (!e || e[1] < 3 || !(e[0] > 0)) continue;
      const x = porSet.get(set) ?? { racios: [], naData: false };
      x.racios.push(v.preco_venda / (v.quantidade || 1) / e[0]);
      x.naData ||= naData;
      porSet.set(set, x);
    }
    const racios = [...porSet.values()].map((x) => x.racios.reduce((a, b) => a + b, 0) / x.racios.length);
    if (racios.length < MIN_SETS_CALIBRACAO) return null;
    racios.sort((a, b) => a - b);
    const n = racios.length;
    const mediana = n % 2 ? racios[(n - 1) / 2] : (racios[n / 2 - 1] + racios[n / 2]) / 2;
    const naData = [...porSet.values()].filter((x) => x.naData).length;
    // Entre 0% e 70% de desconto, arredondado às centésimas
    return { desconto: Math.round(Math.min(Math.max(1 - mediana, 0), 0.7) * 100) / 100, sets: n, dias, naData, mesmaFase: n - naData };
  };
  // Preferir as vendas do último ano (preços mais atuais); se forem poucas, os últimos 2 anos
  const r = medir(365) ?? medir(730);
  cacheCal = { vendas: dados.vendas, produtos: dados.produtos, mercado, hoje, r };
  return r;
}


const numeroBase = (s: string) => s.trim().replace(/-\d+$/, '');

export function infoMercado(m: Mercado | null, setNumero: string | null, hoje: string): InfoMercado | null {
  if (!m || !setNumero) return null;
  const n = numeroBase(setNumero);
  const b = m.brickset[n];
  const bl = m.bricklink[n] ?? m.bricklink[setNumero.trim()];
  const eb = m.ebay?.[n] ?? null;
  if (!b && !bl && !eb) return null;
  const retirada = b?.[1] ?? null;
  const retirado = retirada ? retirada <= hoje : b?.[4] ? /retired/i.test(b[4]) : null;
  return {
    lancamento: b?.[0] ?? null,
    retirada,
    retirado,
    pvp: b?.[2] ?? null,
    blNovo: bl?.n ?? null,
    blUsado: bl?.u ?? null,
    ebay: eb,
  };
}

// ---------- Cálculos ----------

export interface LinhaInvestimento {
  chave: string;
  nome: string;
  setNumero: string | null;
  // Vendido
  vendidas: number;
  custoVendido: number;
  liquido: number;
  lucro: number;
  diasMedioVenda: number | null; // compra → venda, média por unidade
  rentabAnual: number | null; // lucro ÷ (custo × anos com o dinheiro preso)
  // Em stock
  emStock: number;
  custoStock: number;
  diasMedioStock: number | null; // desde a compra, média pesada pelo custo
  valorEstimadoStock: number | null; // pelo preço de mercado (BrickLink) ou pelas nossas vendas
  fonteValor: 'bricklink' | 'ebay' | 'tcgplayer' | 'vendas' | null;
  mercado: InfoMercado | null;
}

export interface ResumoInvestimento {
  lucro: number;
  custoVendido: number;
  roi: number | null; // lucro ÷ custo
  rentabAnual: number | null; // só vendas com datas de compra e venda
  diasMedioVenda: number | null;
  vendasComTempo: number;
  vendasSemTempo: number;
  stockCusto: number;
  stockUnidades: number;
  stockDiasMedio: number | null;
  valorEstimadoStock: number;
  custoComEstimativa: number; // custo do stock que tem valor estimado
  linhas: LinhaInvestimento[];
}

const semDataVenda = (notas: string | null) => !!notas?.includes('data de venda desconhecida');

export function investimento(d: Pick<Dados, 'produtos' | 'vendas'> & Partial<Pick<Dados, 'definicoes'>>, m: Mercado | null, hoje: string): ResumoInvestimento {
  const produtoPorId = new Map(d.produtos.map((p) => [p.id, p]));
  interface Acum {
    nome: string;
    setNumero: string | null;
    vendidas: number;
    custoVendido: number;
    liquido: number;
    lucro: number;
    unidadesComTempo: number;
    somaDias: number;
    capitalDias: number; // custo × dias (só vendas com tempo)
    lucroComTempo: number;
    emStock: number;
    custoStock: number;
    capitalDiasStock: number;
    custoStockComData: number;
    valorStock: number;
    custoStockComValor: number;
    fonte: 'bricklink' | 'ebay' | 'tcgplayer' | 'vendas' | null;
    stock: Produto[];
  }
  const grupos = new Map<string, Acum>();
  const grupo = (p: Produto) => {
    const k = chaveComparacao(p);
    let g = grupos.get(k);
    if (!g) {
      g = {
        nome: p.nome, setNumero: p.set_numero?.trim() || null, vendidas: 0, custoVendido: 0, liquido: 0, lucro: 0, unidadesComTempo: 0,
        somaDias: 0, capitalDias: 0, lucroComTempo: 0, emStock: 0, custoStock: 0, capitalDiasStock: 0, custoStockComData: 0,
        valorStock: 0, custoStockComValor: 0, fonte: null, stock: [],
      };
      grupos.set(k, g);
    }
    return g;
  };

  let vendasComTempo = 0;
  let vendasSemTempo = 0;
  for (const v of d.vendas) {
    if (!vendaValida(v)) continue;
    const p = produtoPorId.get(v.produto_id);
    if (!p) continue;
    const g = grupo(p);
    const u = v.quantidade || 1;
    const custo = custoVenda(v, p);
    const liquido = liquidoVenda(v);
    g.vendidas += u;
    g.custoVendido += custo;
    g.liquido += liquido;
    g.lucro += liquido - custo;
    if (p.data_compra && v.data_venda && !semDataVenda(v.notas)) {
      const dias = Math.max(diasEntre(p.data_compra, v.data_venda), 1);
      g.unidadesComTempo += u;
      g.somaDias += dias * u;
      g.capitalDias += custo * dias;
      g.lucroComTempo += liquido - custo;
      vendasComTempo++;
    } else vendasSemTempo++;
  }

  for (const p of d.produtos) {
    if (!emInventario(p)) continue;
    const u = unidadesDisponiveis(p, d.vendas);
    if (!u) continue;
    const g = grupo(p);
    const custo = custoUnitario(p) * u;
    g.emStock += u;
    g.custoStock += custo;
    g.stock.push(p);
    if (p.data_compra) {
      g.capitalDiasStock += custo * Math.max(diasEntre(p.data_compra, hoje), 0);
      g.custoStockComData += custo;
    }
  }

  const linhas: LinhaInvestimento[] = [];
  for (const [chave, g] of grupos) {
    const mercado = infoMercado(m, g.setNumero, hoje);
    // Valor estimado do stock: BrickLink → eBay (com desconto) → TCGplayer (Pokémon) → a nossa venda média líquida
    const vendaMedia = g.vendidas ? g.liquido / g.vendidas : null;
    for (const p of g.stock) {
      const u = unidadesDisponiveis(p, d.vendas);
      const bl = produtoNovo(p) ? mercado?.blNovo ?? null : mercado?.blUsado ?? mercado?.blNovo ?? null;
      const pk = precoPokemon(m, p.nome, idsPokemon(d.definicoes), custoUnitario(p));
      // eBay só para novos (procuramos anúncios de novos), com desconto por serem preços pedidos
      const eb = produtoNovo(p) && mercado?.ebay && mercado.ebay[1] >= 3 ? mercado.ebay[0] * (1 - descontoEbayEfetivo(d, m, hoje)) : null;
      const unit = bl ? bl[0] : eb ?? (pk ? pk.eur : vendaMedia);
      if (unit === null) continue;
      g.valorStock += unit * u;
      g.custoStockComValor += custoUnitario(p) * u;
      g.fonte = bl ? 'bricklink' : eb ? 'ebay' : pk ? 'tcgplayer' : (g.fonte ?? 'vendas');
    }
    linhas.push({
      chave,
      nome: g.nome,
      setNumero: g.setNumero,
      vendidas: g.vendidas,
      custoVendido: g.custoVendido,
      liquido: g.liquido,
      lucro: g.lucro,
      diasMedioVenda: g.unidadesComTempo ? Math.round(g.somaDias / g.unidadesComTempo) : null,
      rentabAnual: g.capitalDias > 0 ? g.lucroComTempo / (g.capitalDias / 365) : null,
      emStock: g.emStock,
      custoStock: g.custoStock,
      diasMedioStock: g.custoStockComData > 0 ? Math.round(g.capitalDiasStock / g.custoStockComData) : null,
      valorEstimadoStock: g.custoStockComValor > 0 ? g.valorStock : null,
      fonteValor: g.fonte,
      mercado,
    });
  }

  const soma = (f: (l: LinhaInvestimento) => number) => linhas.reduce((a, l) => a + f(l), 0);
  const capitalDias = [...grupos.values()].reduce((a, g) => a + g.capitalDias, 0);
  const lucroComTempo = [...grupos.values()].reduce((a, g) => a + g.lucroComTempo, 0);
  const unidadesComTempo = [...grupos.values()].reduce((a, g) => a + g.unidadesComTempo, 0);
  const somaDias = [...grupos.values()].reduce((a, g) => a + g.somaDias, 0);
  const capitalDiasStock = [...grupos.values()].reduce((a, g) => a + g.capitalDiasStock, 0);
  const custoStockComData = [...grupos.values()].reduce((a, g) => a + g.custoStockComData, 0);
  const custoVendido = soma((l) => l.custoVendido);
  const lucro = soma((l) => l.lucro);
  return {
    lucro,
    custoVendido,
    roi: custoVendido > 0 ? lucro / custoVendido : null,
    rentabAnual: capitalDias > 0 ? lucroComTempo / (capitalDias / 365) : null,
    diasMedioVenda: unidadesComTempo ? Math.round(somaDias / unidadesComTempo) : null,
    vendasComTempo,
    vendasSemTempo,
    stockCusto: soma((l) => l.custoStock),
    stockUnidades: soma((l) => l.emStock),
    stockDiasMedio: custoStockComData > 0 ? Math.round(capitalDiasStock / custoStockComData) : null,
    valorEstimadoStock: [...grupos.values()].reduce((a, g) => a + g.valorStock, 0),
    custoComEstimativa: [...grupos.values()].reduce((a, g) => a + g.custoStockComValor, 0),
    linhas,
  };
}
