// Plano para cada produto em stock (vender já / guardar até X) e lista de tarefas.
//
// Ideia base, para dar mais retorno: o dinheiro que volta depressa pode ser reinvestido.
// Exceção, nos sets LEGO: quando o set está perto da retirada (sai nos próximos 6 meses ou saiu
// há menos de 6), guarda-se até ~6 meses depois da retirada, para apanhar a subida ("pop") que
// costuma vir quando deixa de haver nas lojas. Vale para qualquer set, seja qual for o valor.
// Fora disso, vende-se logo que o lucro previsto chegue à margem pedida.
import { produtoNovo } from './anuncio';
import { chaveComparacao, custoUnitario, diasEntre, emInventario, somarDias, unidadesDisponiveis, vendaValida } from './calc';
import { fmtEuro } from './format';
import { descontoEbayEfetivo, idsPokemon, infoMercado, precoPokemon } from './investimento';
import type { Mercado } from './investimento';
import type { Dados, Definicao, Produto } from './types';

export const CHAVE_REGRAS = 'regras_plano';
export const CHAVE_PLANOS = 'planos';
export const CHAVE_ADIADAS = 'tarefas_adiadas';
/** Associação manual dos produtos Pokémon ao TCGplayer: nome em minúsculas → tcgPlayerId. */
export const CHAVE_POKEMON_IDS = 'pokemon_ids';

export interface RegrasPlano {
  /** Vender já se o lucro previsto for pelo menos isto (sobre o custo). */
  margemVender: number;
  /** Só vale a pena guardar se a valorização esperada for pelo menos isto por ano. */
  rentabMinGuardar: number;
  /** Dias anunciado (sem mudar o preço) antes de sugerir baixar. */
  diasBaixar: number;
  /** Quanto baixar de cada vez. */
  baixarPct: number;
  /** Margem acima do preço de referência, para negociar na Vinted. */
  margemNegociar: number;
  /** Nunca sugerir vender abaixo do custo + isto. */
  margemChao: number;
  /** Valorização anual esperada: ainda à venda na LEGO, nos 2 anos depois de retirado, e depois. */
  valorizacaoAVenda: number;
  valorizacaoRetirado: number;
  valorizacaoDepois: number;
  /** Valorização anual esperada dos produtos Pokémon selados (sem datas de retirada conhecidas). */
  valorizacaoPokemon: number;
  /**
   * Desconto sobre os preços pedidos no eBay, usado só como reserva: quando há vendas nossas
   * suficientes para comparar, a app calcula o desconto real sozinha (ver calibrarEbay).
   */
  descontoEbay: number;
  /** Guardar sets que saem de produção dentro deste n.º de meses (ou saíram há menos disto)… */
  mesesAntesRetirada: number;
  /** …até este n.º de meses depois da retirada. */
  mesesDepoisRetirada: number;
  /**
   * Compras (ecrã "Vale a pena?"): diversificar. Por defeito compra-se 1 unidade de cada set
   * (com lucro ≥ margemVender). Só com lucro de pelo menos margemCompraOtima se aceitam 2, e com
   * margemCompraRara ("oportunidade de outro mundo") 3, contando as que já estão em stock.
   */
  margemCompraOtima: number;
  margemCompraRara: number;
  /** Nunca ter mais do que esta parte do dinheiro em stock num só set. */
  maxCapitalPorSet: number;
}

export const REGRAS_PADRAO: RegrasPlano = {
  margemVender: 0.2,
  rentabMinGuardar: 0.12,
  diasBaixar: 60,
  baixarPct: 0.07,
  margemNegociar: 0.08,
  margemChao: 0.05,
  valorizacaoAVenda: 0,
  valorizacaoRetirado: 0.2,
  valorizacaoDepois: 0.07,
  valorizacaoPokemon: 0.15,
  descontoEbay: 0.37, // reserva: em out/2026 vendemos a ~63% do preço pedido no eBay, comparando com o eBay da mesma altura (22 sets)
  mesesAntesRetirada: 6,
  mesesDepoisRetirada: 6,
  margemCompraOtima: 0.4,
  margemCompraRara: 0.75,
  maxCapitalPorSet: 0.1,
};

/** Decisão tomada por vocês para um produto/set (sobrepõe-se à sugestão). */
export interface PlanoManual {
  acao: 'guardar' | 'vender';
  ate?: string | null; // para "guardar"
  quando: string;
}

/** Tarefas adiadas: id → data até quando fica escondida. */
export type Adiadas = Record<string, string>;

const obj = <T,>(defs: Definicao[], chave: string): Partial<T> => {
  const v = defs.find((d) => d.chave === chave)?.valor as unknown;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Partial<T>) : {};
};
export const regrasPlano = (defs: Definicao[]): RegrasPlano => ({ ...REGRAS_PADRAO, ...obj<RegrasPlano>(defs, CHAVE_REGRAS) });
export const planosManuais = (defs: Definicao[]) => obj<Record<string, PlanoManual>>(defs, CHAVE_PLANOS) as Record<string, PlanoManual>;
export const tarefasAdiadas = (defs: Definicao[]) => obj<Adiadas>(defs, CHAVE_ADIADAS) as Adiadas;

/** Chave do plano: o set (ou nome) e se é novo ou usado. */
export const chavePlano = (p: Produto) => `${chaveComparacao(p)}|${produtoNovo(p) ? 'novo' : 'usado'}`;

export interface Contexto {
  dados: Pick<Dados, 'produtos' | 'vendas' | 'definicoes'>;
  mercado: Mercado | null;
  /** Ano de lançamento pelo catálogo oficial, quando não há dados da Brickset. */
  anoSet?: (numero: string) => number | null | undefined;
  hoje: string;
}

export interface Referencia {
  preco: number; // preço por que se espera vender uma unidade agora
  fonte: 'vendas' | 'bricklink' | 'ebay' | 'pvp' | 'tcgplayer';
  texto: string;
}

export interface Plano {
  acao: 'vender' | 'guardar';
  ate: string | null; // guardar até
  precoSugerido: number | null; // preço para anunciar
  chao: number; // preço mínimo
  custo: number;
  referencia: Referencia | null;
  margemAgora: number | null; // lucro previsto a vender agora (sobre o custo)
  motivo: string;
  manual: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const arredEuro = (x: number) => (x >= 20 ? Math.round(x) : Math.round(x * 2) / 2);
const mesAno = (d: string) => {
  const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${m[+d.slice(5, 7) - 1]}/${d.slice(2, 4)}`;
};
export { mesAno };

/** Preço de referência para vender agora: as nossas vendas → BrickLink → eBay (com desconto) → TCGplayer (Pokémon) → PVP. */
export function referencia(p: Produto, ctx: Contexto): Referencia | null {
  const r = regrasPlano(ctx.dados.definicoes);
  const chave = chaveComparacao(p);
  const novo = produtoNovo(p);
  const produtos = new Map(ctx.dados.produtos.map((x) => [x.id, x]));
  const recentes = ctx.dados.vendas.filter((v) => {
    const q = produtos.get(v.produto_id);
    return (
      q && vendaValida(v) && chaveComparacao(q) === chave && produtoNovo(q) === novo && v.preco_venda > 0 &&
      !v.notas?.includes('data de venda desconhecida') && diasEntre(v.data_venda, ctx.hoje) <= 730
    );
  });
  if (recentes.length) {
    // As vendas mais recentes pesam mais
    const peso = (d: string) => (diasEntre(d, ctx.hoje) <= 365 ? 2 : 1);
    const total = recentes.reduce((a, v) => a + peso(v.data_venda), 0);
    const preco = recentes.reduce((a, v) => a + (peso(v.data_venda) * v.preco_venda) / (v.quantidade || 1), 0) / total;
    return { preco, fonte: 'vendas', texto: `já vendemos a ${Math.round(preco)} € (${recentes.length === 1 ? '1 venda' : `${recentes.length} vendas`})` };
  }
  const m = infoMercado(ctx.mercado, p.set_numero, ctx.hoje);
  const bl = novo ? m?.blNovo : m?.blUsado ?? null;
  if (bl && bl[1] >= 2) return { preco: bl[0], fonte: 'bricklink', texto: `BrickLink: ${Math.round(bl[0])} € (${bl[1]} vendidos em 6 meses)` };
  // eBay: preços pedidos (não de venda), por isso com desconto. Só para novos.
  // O desconto é o real, medido nas nossas vendas (calibrarEbay); sem dados suficientes, o das regras.
  if (novo && m?.ebay && m.ebay[1] >= 3) {
    const desconto = descontoEbayEfetivo(ctx.dados, ctx.mercado, ctx.hoje);
    const preco = m.ebay[0] * (1 - desconto);
    return {
      preco,
      fonte: 'ebay',
      texto: `eBay: anúncios a ~${Math.round(m.ebay[0])} € (${m.ebay[1]} na Europa); como vendemos a ~${Math.round((1 - desconto) * 100)}% do eBay, conta-se ~${Math.round(preco)} €`,
    };
  }
  // Pokémon: preço do TCGplayer (EUA), convertido para euros. É uma referência fraca (outro mercado).
  const pk = ehPokemon(p) ? precoPokemon(ctx.mercado, p.nome, idsPokemon(ctx.dados.definicoes), custoUnitario(p)) : null;
  if (pk?.eur) return { preco: pk.eur, fonte: 'tcgplayer', texto: `TCGplayer (EUA): ~${Math.round(pk.eur)} €` };
  // PVP (Brickset, LEGO Alemanha). Ainda à venda: as lojas fazem descontos, conta-se ~80% do PVP.
  // Já retirado: parte do PVP e aplica a valorização esperada desde a retirada (as mesmas taxas das
  // regras usadas para decidir guardar), no máximo o dobro do PVP. Se o preço ficar alto demais,
  // a tarefa "baixar o preço" corrige ao fim de algum tempo sem vender.
  if (m?.pvp && novo && m.retirado === false) return { preco: m.pvp * 0.8, fonte: 'pvp', texto: `ainda à venda (PVP ${Math.round(m.pvp)} €, com desconto ~20%)` };
  if (m?.pvp && novo && m.retirado === true) {
    const preco = precoPvp(m.pvp, m.retirada ?? ctx.hoje, ctx.hoje, r);
    return {
      preco,
      fonte: 'pvp',
      texto: `retirado${m.retirada ? ` em ${mesAno(m.retirada)}` : ''}, PVP ${Math.round(m.pvp)} € → estimado ~${Math.round(preco)} € hoje`,
    };
  }
  return null;
}

/**
 * Preço estimado de um set novo numa data, a partir do PVP: 80% do PVP enquanto a LEGO o vende
 * (há sempre promoções); depois de retirado, o PVP valorizado pelas taxas das regras desde a
 * retirada (no máximo o dobro do PVP).
 */
function precoPvp(pvp: number, retirada: string, data: string, r: RegrasPlano): number {
  if (data < retirada) return pvp * 0.8;
  const anos = diasEntre(retirada, data) / 365;
  return pvp * Math.min(Math.pow(1 + r.valorizacaoRetirado, Math.min(anos, 2)) * Math.pow(1 + r.valorizacaoDepois, Math.max(anos - 2, 0)), 2);
}

/**
 * Valor esperado de uma unidade mês a mês (posição 0 = hoje, até 60 meses), seguindo as fases do set.
 * Se a referência é o PVP, usa a fórmula do PVP em cada data (inclui o salto dos 80% para 100% na
 * retirada). Senão, parte do preço de referência e aplica a valorização de cada fase.
 */
function caminhoValor(p: Produto, ref: Referencia, ctx: Contexto, r: RegrasPlano, retirada: string | null) {
  const m = infoMercado(ctx.mercado, p.set_numero, ctx.hoje);
  const pvp = m?.pvp && m.retirada ? { pvp: m.pvp, retirada: m.retirada } : null;
  const datas = [ctx.hoje];
  const valores = [ref.preco];
  for (let i = 1; i <= 60; i++) {
    const antes = datas[i - 1];
    const d = somarDias(antes, 30);
    datas.push(d);
    if (pvp && ref.fonte === 'pvp') valores.push(precoPvp(pvp.pvp, pvp.retirada, d, r));
    else {
      // Valoriza pela fase do set; depois da retirada, nunca abaixo do valor estimado pelo PVP (o "pop")
      const v = valores[i - 1] * Math.pow(1 + taxa(antes, retirada, r), 1 / 12);
      valores.push(pvp && d >= pvp.retirada ? Math.max(v, precoPvp(pvp.pvp, pvp.retirada, d, r)) : v);
    }
  }
  return { datas, valores };
}


/** Data em que o set sai (ou saiu) de produção: Brickset ou, sem isso, lançamento + ~2,5 anos. */
function dataRetirada(p: Produto, ctx: Contexto): { data: string; estimada: boolean } | null {
  const m = infoMercado(ctx.mercado, p.set_numero, ctx.hoje);
  if (m?.retirada) return { data: m.retirada, estimada: false };
  const lanc = m?.lancamento ?? (p.set_numero && ctx.anoSet?.(p.set_numero) ? `${ctx.anoSet(p.set_numero)}-03-01` : null);
  return lanc ? { data: somarDias(lanc, 913), estimada: true } : null;
}

/** Valorização anual esperada numa data, conforme a fase do set. */
function taxa(data: string, retirada: string | null, r: RegrasPlano) {
  if (!retirada || data < retirada) return r.valorizacaoAVenda;
  return diasEntre(retirada, data) <= 730 ? r.valorizacaoRetirado : r.valorizacaoDepois;
}

/** Produtos que podem valer a pena guardar: sets LEGO novos com n.º e produtos Pokémon selados. */
export const ehPokemon = (p: Pick<Produto, 'marca'>) => /pok[eé]mon/i.test(p.marca ?? '');
export const paraInvestir = (p: Produto) =>
  produtoNovo(p) && ((!!p.set_numero?.trim() && (!p.marca || /lego/i.test(p.marca))) || ehPokemon(p));

export function sugerirPlano(p: Produto, ctx: Contexto): Plano {
  const r = regrasPlano(ctx.dados.definicoes);
  const custo = custoUnitario(p);
  const chao = arredEuro(custo * (1 + r.margemChao));
  const ref = referencia(p, ctx);
  const margemAgora = ref && custo > 0 ? ref.preco / custo - 1 : null;
  const precoVenda = ref ? Math.max(arredEuro(ref.preco * (1 + r.margemNegociar)), chao) : arredEuro(custo * (1 + r.margemVender + r.margemNegociar));
  const base = { custo, chao, referencia: ref, margemAgora, manual: false };
  const vender = (motivo: string): Plano => ({ ...base, acao: 'vender', ate: null, precoSugerido: precoVenda, motivo });

  const manual = planosManuais(ctx.dados.definicoes)[chavePlano(p)];
  if (manual) {
    return {
      ...base,
      manual: true,
      acao: manual.acao,
      ate: manual.acao === 'guardar' ? manual.ate ?? null : null,
      precoSugerido: precoVenda,
      motivo: manual.acao === 'guardar' ? 'Decidiram guardar.' : 'Decidiram vender.',
    };
  }

  if (!paraInvestir(p)) return vender(ref ? `Não é para guardar (${p.set_numero ? 'usado' : 'sem n.º de set'}): vender pelo melhor preço.` : 'Não é para guardar: vender com margem sobre o custo.');
  if (!ref) return vender(`Sem preço de referência: anunciar com ${pct(r.margemVender + r.margemNegociar)} sobre o custo e ver a reação.`);

  // LEGO perto da retirada: guardar até ~6 meses depois da retirada, para apanhar a subida.
  // Só com a data de retirada do Brickset (não estimada). O valor esperado é só informativo.
  const retLego = ehPokemon(p) ? null : dataRetirada(p, ctx);
  if (retLego && !retLego.estimada) {
    const inicio = somarDias(ctx.hoje, -Math.round(r.mesesDepoisRetirada * 30.4));
    const fim = somarDias(ctx.hoje, Math.round(r.mesesAntesRetirada * 30.4));
    if (retLego.data >= inicio && retLego.data <= fim) {
      const ate = somarDias(retLego.data, Math.round(r.mesesDepoisRetirada * 30.4));
      const { datas, valores } = caminhoValor(p, ref, ctx, r, retLego.data);
      const t = Math.max(datas.findIndex((d) => d >= ate), 1);
      {
        const fase = retLego.data > ctx.hoje ? `Sai de produção em ${mesAno(retLego.data)}.` : `Saiu de produção em ${mesAno(retLego.data)}.`;
        return {
          ...base,
          acao: 'guardar',
          ate,
          precoSugerido: Math.max(arredEuro(valores[t] * (1 + r.margemNegociar)), chao),
          motivo:
            `Vender agora dá ~${pct(Math.max(margemAgora!, -1))} (${ref.texto}). ${fase} ` +
            `Guardar até ${mesAno(ate)} para apanhar a subida da retirada (estimativa: ~${Math.round(valores[t])} €, ~${pct(valores[t] / custo - 1)} de lucro).`,
        };
      }
    }
  }
  if (margemAgora! >= r.margemVender) return vender(`Já dá ~${pct(margemAgora!)} de lucro (${ref.texto}). Vender liberta o dinheiro para reinvestir.`);

  // Pouca margem agora: ver se guardar compensa
  // Pokémon não tem datas de retirada: usa uma valorização anual fixa. LEGO: depende da fase do set.
  const ret = retLego;
  const taxaMes = (d: string) => (ehPokemon(p) ? r.valorizacaoPokemon : taxa(d, ret?.data ?? null, r));
  const alvo = custo * (1 + r.margemVender);
  let valor = ref.preco;
  let data = ctx.hoje;
  let meses = 0;
  while (valor < alvo && meses < 60) {
    valor *= Math.pow(1 + taxaMes(data), 1 / 12);
    data = somarDias(data, 30);
    meses++;
  }
  const rentab = meses > 0 && valor >= alvo ? Math.pow(alvo / ref.preco, 12 / meses) - 1 : 0;
  if (valor >= alvo && rentab >= r.rentabMinGuardar) {
    const fase = !ret
      ? ''
      : ret.data > ctx.hoje
        ? ` Sai de produção ${ret.estimada ? 'por volta de' : 'em'} ${mesAno(ret.data)} e deve valorizar depois.`
        : ` Retirado em ${mesAno(ret.data)}, a valorizar.`;
    return {
      ...base,
      acao: 'guardar',
      ate: data,
      precoSugerido: arredEuro(alvo * (1 + r.margemNegociar)),
      motivo: `Agora só dá ~${pct(Math.max(margemAgora!, -1))} (${ref.texto}).${fase} Espera-se chegar a ${pct(r.margemVender)} de lucro em ~${meses} meses.`,
    };
  }
  return vender(
    margemAgora! >= 0
      ? `Só dá ~${pct(margemAgora!)} de lucro e não se espera que valorize depressa: vender para libertar o dinheiro.`
      : `Abaixo do custo (${ref.texto}) e sem valorização à vista: vender pelo mínimo aceitável.`,
  );
}

// ---------- Tarefas ----------

export interface Tarefa {
  id: string;
  tipo: 'anunciar' | 'baixar' | 'rever';
  produtos: Produto[];
  unidades: number;
  titulo: string;
  detalhe: string;
  preco: number | null;
  capital: number; // custo das unidades, para ordenar
}

/** Última vez que o anúncio começou ou mudou de preço. */
function desdeUltimaMudanca(p: Produto): string | null {
  const aberto = [...(p.anuncios ?? [])].reverse().find((x) => !x.fim);
  if (aberto) return [aberto.inicio, ...(aberto.precos ?? []).map((x) => x.quando)].sort().pop()!.slice(0, 10);
  return p.data_anuncio;
}

export function tarefas(ctx: Contexto): Tarefa[] {
  const r = regrasPlano(ctx.dados.definicoes);
  const adiadas = tarefasAdiadas(ctx.dados.definicoes);
  const grupos = new Map<string, { tipo: Tarefa['tipo']; produtos: Produto[]; plano: Plano; extra?: string; preco: number | null }>();
  // Anuncia-se 1 unidade de cada produto de cada vez: se já há um anunciado (mesmo set ou nome),
  // as outras unidades não geram a tarefa "Anunciar" até essa ser vendida.
  const jaAnunciados = new Set(
    ctx.dados.produtos.filter((p) => p.estado === 'anunciado' && unidadesDisponiveis(p, ctx.dados.vendas) > 0).map(chaveComparacao),
  );
  for (const p of ctx.dados.produtos) {
    if (!emInventario(p) || !unidadesDisponiveis(p, ctx.dados.vendas)) continue;
    const plano = sugerirPlano(p, ctx);
    let tipo: Tarefa['tipo'] | null = null;
    let preco: number | null = null;
    let extra: string | undefined;
    if (plano.manual && plano.acao === 'guardar' && plano.ate && plano.ate <= ctx.hoje) {
      tipo = 'rever';
    } else if (p.estado === 'por_anunciar' && plano.acao === 'vender' && !jaAnunciados.has(chaveComparacao(p))) {
      tipo = 'anunciar';
      preco = plano.precoSugerido;
    } else if (p.estado === 'anunciado' && p.preco_anuncio) {
      const desde = desdeUltimaMudanca(p);
      const dias = desde ? diasEntre(desde, ctx.hoje) : 0;
      const novo = Math.max(arredEuro(p.preco_anuncio * (1 - r.baixarPct)), plano.chao);
      if (dias >= r.diasBaixar && novo < p.preco_anuncio && !(plano.acao === 'guardar' && !plano.manual && p.preco_anuncio <= (plano.precoSugerido ?? Infinity))) {
        tipo = 'baixar';
        preco = novo;
        extra = `${dias} dias a ${fmtEuro(p.preco_anuncio)}`;
      }
    }
    if (!tipo) continue;
    const k = `${tipo}:${chavePlano(p)}:${preco ?? ''}`;
    const g = grupos.get(k);
    if (g) g.produtos.push(p);
    else grupos.set(k, { tipo, produtos: [p], plano, extra, preco });
  }
  const lista: Tarefa[] = [];
  for (const [id, g] of grupos) {
    const ate = adiadas[id];
    if (ate && ate > ctx.hoje) continue;
    const p = g.produtos[0];
    const unidades = g.produtos.reduce((a, x) => a + unidadesDisponiveis(x, ctx.dados.vendas), 0);
    // "Anunciar" é sempre de 1 unidade; nas outras tarefas mostra-se quantas são
    const nome = `${unidades > 1 && g.tipo !== 'anunciar' ? `${unidades}× ` : ''}${p.nome}`;
    const titulo =
      g.tipo === 'anunciar' ? `Anunciar ${nome} a ${fmtEuro(g.preco)}` : g.tipo === 'baixar' ? `Baixar ${nome} para ${fmtEuro(g.preco)}` : `Rever ${nome}: o prazo para guardar acabou`;
    const detalhe =
      g.tipo === 'baixar'
        ? `${g.extra}. Mínimo: ${fmtEuro(g.plano.chao)}.`
        : g.tipo === 'anunciar' && unidades > 1
          ? `${g.plano.motivo} (${unidades} em stock: anuncia-se 1 de cada vez.)`
          : g.plano.motivo;
    lista.push({ id, tipo: g.tipo, produtos: g.produtos, unidades, titulo, detalhe, preco: g.preco, capital: g.produtos.reduce((a, x) => a + custoUnitario(x) * unidadesDisponiveis(x, ctx.dados.vendas), 0) });
  }
  const ordem = { rever: 0, baixar: 1, anunciar: 2 };
  return lista.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || b.capital - a.capital);
}

// ---------- Sinal (bolinha tipo semáforo nos cartões) ----------
//
// Cada produto mostra uma bolinha de cor e uma linha curta com a próxima ação, em vez de várias
// etiquetas. A cor responde a "tenho de fazer alguma coisa?":
//   verde    = está a correr (anunciado, dentro do normal);
//   amarelo  = há uma ação (anunciar, baixar o preço);
//   azul     = guardado de propósito (nada a fazer até à data);
//   vermelho = precisa de atenção (anunciado há demasiado tempo, ou o prazo de guardar acabou);
//   cinzento = já não está em stock (vendido, cancelado, devolvido).
// As ações vêm das mesmas tarefas do "O que fazer" do Painel, para dizerem sempre o mesmo.

/** A partir de quantos dias anunciado um produto fica "parado" (vermelho). */
export const DIAS_PARADO = 60;

export type CorSinal = 'verde' | 'amarelo' | 'azul' | 'vermelho' | 'cinzento';

export interface Sinal {
  cor: CorSinal;
  texto: string; // linha curta, ex.: "Anunciar a 89 €"
  porque?: string; // explicação mais longa (aparece ao passar o rato)
}

/** Ordem de urgência, para escolher o sinal de um grupo de produtos iguais (o mais urgente). */
export const URGENCIA: Record<CorSinal, number> = { vermelho: 0, amarelo: 1, azul: 2, verde: 3, cinzento: 4 };

/** "Anunciado há 12 dias", "Anunciado hoje"… */
function textoAnunciado(dias: number | null) {
  if (dias === null) return 'Anunciado';
  if (dias <= 0) return 'Anunciado hoje';
  return `Anunciado há ${dias === 1 ? '1 dia' : `${dias} dias`}`;
}

/**
 * Sinal de cada produto (id → sinal). Calcula as tarefas uma só vez para todos os produtos.
 */
export function sinais(ctx: Contexto): Map<string, Sinal> {
  const porProduto = new Map<string, Tarefa>();
  for (const t of tarefas(ctx)) for (const p of t.produtos) porProduto.set(p.id, t);
  // Produtos (set ou nome) que já têm uma unidade anunciada: as outras unidades esperam a vez
  const jaAnunciados = new Set(
    ctx.dados.produtos.filter((p) => p.estado === 'anunciado' && unidadesDisponiveis(p, ctx.dados.vendas) > 0).map(chaveComparacao),
  );
  const res = new Map<string, Sinal>();
  for (const p of ctx.dados.produtos) {
    // Fora de stock: só informativo
    if (!emInventario(p) || !unidadesDisponiveis(p, ctx.dados.vendas)) {
      const nome = p.estado === 'cancelado' ? 'Cancelado' : p.estado === 'devolvido' ? 'Devolvido' : 'Vendido';
      res.set(p.id, { cor: 'cinzento', texto: nome });
      continue;
    }
    const t = porProduto.get(p.id);
    if (t?.tipo === 'rever') {
      res.set(p.id, { cor: 'vermelho', texto: 'Prazo de guardar acabou', porque: t.detalhe });
      continue;
    }
    if (p.estado === 'anunciado') {
      const dias = p.data_anuncio ? diasEntre(p.data_anuncio, ctx.hoje) : null;
      const parado = dias !== null && dias > DIAS_PARADO;
      if (t?.tipo === 'baixar')
        res.set(p.id, { cor: parado ? 'vermelho' : 'amarelo', texto: parado ? `${dias} dias · baixar para ${fmtEuro(t.preco)}` : `Baixar para ${fmtEuro(t.preco)}`, porque: t.detalhe });
      else res.set(p.id, { cor: parado ? 'vermelho' : 'verde', texto: textoAnunciado(dias), porque: parado ? `Anunciado há mais de ${DIAS_PARADO} dias.` : undefined });
      continue;
    }
    // Por anunciar
    const pl = sugerirPlano(p, ctx);
    if (t?.tipo === 'anunciar') res.set(p.id, { cor: 'amarelo', texto: `Anunciar a ${fmtEuro(t.preco)}`, porque: pl.motivo });
    else if (pl.acao === 'guardar') res.set(p.id, { cor: 'azul', texto: pl.ate ? `Guardar até ${mesAno(pl.ate)}` : 'Guardar', porque: pl.motivo });
    else if (jaAnunciados.has(chaveComparacao(p))) res.set(p.id, { cor: 'verde', texto: 'Outro igual já anunciado', porque: 'Anuncia-se 1 unidade de cada vez.' });
    else res.set(p.id, { cor: 'azul', texto: 'Anunciar adiado', porque: 'A tarefa de anunciar foi adiada no Painel.' });
  }
  return res;
}
