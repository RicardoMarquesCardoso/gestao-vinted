// Plano para cada produto em stock (vender já / guardar até X) e lista de tarefas.
//
// Ideia base, para dar mais retorno: o dinheiro que volta depressa pode ser reinvestido.
// Por isso vende-se logo que o lucro previsto compense; só se guarda quando vender agora
// não dá margem suficiente e se espera que o set valorize mais depressa do que a
// rentabilidade mínima pedida.
import { produtoNovo } from './anuncio';
import { chaveComparacao, custoUnitario, diasEntre, emInventario, somarDias, unidadesDisponiveis, vendaValida } from './calc';
import { fmtEuro } from './format';
import { infoMercado, precoPokemon } from './investimento';
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
  fonte: 'vendas' | 'bricklink' | 'pvp' | 'tcgplayer';
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

/** Preço de referência para vender agora: as nossas vendas recentes, a BrickLink ou o PVP. */
export function referencia(p: Produto, ctx: Contexto): Referencia | null {
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
  // Pokémon: preço do TCGplayer (EUA), convertido para euros. É uma referência fraca (outro mercado).
  const pk = ehPokemon(p) ? precoPokemon(ctx.mercado, p.nome) : null;
  if (pk) return { preco: pk.eur, fonte: 'tcgplayer', texto: `TCGplayer (EUA): ~${Math.round(pk.eur)} €` };
  if (m?.pvp && m.retirado === false && novo) return { preco: m.pvp * 0.8, fonte: 'pvp', texto: `ainda à venda (PVP ${Math.round(m.pvp)} €, com desconto ~20%)` };
  return null;
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
  if (margemAgora! >= r.margemVender) return vender(`Já dá ~${pct(margemAgora!)} de lucro (${ref.texto}). Vender liberta o dinheiro para reinvestir.`);

  // Pouca margem agora: ver se guardar compensa
  // Pokémon não tem datas de retirada: usa uma valorização anual fixa. LEGO: depende da fase do set.
  const ret = ehPokemon(p) ? null : dataRetirada(p, ctx);
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
  for (const p of ctx.dados.produtos) {
    if (!emInventario(p) || !unidadesDisponiveis(p, ctx.dados.vendas)) continue;
    const plano = sugerirPlano(p, ctx);
    let tipo: Tarefa['tipo'] | null = null;
    let preco: number | null = null;
    let extra: string | undefined;
    if (plano.manual && plano.acao === 'guardar' && plano.ate && plano.ate <= ctx.hoje) {
      tipo = 'rever';
    } else if (p.estado === 'por_anunciar' && plano.acao === 'vender') {
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
    const nome = `${unidades > 1 ? `${unidades}× ` : ''}${p.nome}`;
    const titulo =
      g.tipo === 'anunciar' ? `Anunciar ${nome} a ${fmtEuro(g.preco)}` : g.tipo === 'baixar' ? `Baixar ${nome} para ${fmtEuro(g.preco)}` : `Rever ${nome}: o prazo para guardar acabou`;
    const detalhe = g.tipo === 'baixar' ? `${g.extra}. Mínimo: ${fmtEuro(g.plano.chao)}.` : g.plano.motivo;
    lista.push({ id, tipo: g.tipo, produtos: g.produtos, unidades, titulo, detalhe, preco: g.preco, capital: g.produtos.reduce((a, x) => a + custoUnitario(x) * unidadesDisponiveis(x, ctx.dados.vendas), 0) });
  }
  const ordem = { rever: 0, baixar: 1, anunciar: 2 };
  return lista.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || b.capital - a.capital);
}
