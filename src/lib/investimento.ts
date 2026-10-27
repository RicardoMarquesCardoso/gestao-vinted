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

/** Desconto a aplicar aos preços pedidos no eBay (regra "descontoEbay" em Definições; 10% por defeito). */
export const descontoEbay = (defs: { chave: string; valor: unknown }[] | undefined): number => {
  const r = (defs ?? []).find((d) => d.chave === 'regras_plano')?.valor as { descontoEbay?: number } | undefined;
  return typeof r?.descontoEbay === 'number' ? r.descontoEbay : 0.1;
};

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
      const eb = produtoNovo(p) && mercado?.ebay && mercado.ebay[1] >= 3 ? mercado.ebay[0] * (1 - descontoEbay(d.definicoes)) : null;
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
