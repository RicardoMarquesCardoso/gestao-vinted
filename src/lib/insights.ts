// Destaques das Análises: frases curtas com números, calculadas a partir das vendas, do stock e
// dos anúncios (sem textos a explicar, pedido do Ricardo: só os dados que interessam).
//
// - periodoAnterior: o período com que se compara (para as setas ▲▼ nos números do topo).
// - desempenhoTemas: por tema (ou marca), vendas, lucro, ROI, dias até vender e rentabilidade por
//   ano. É o que alimenta o gráfico "Rentabilidade vs. tempo" e os destaques melhor/pior tema.
// - destaques: a lista de cartões (melhor e pior tema, preço final vs. anunciado, tempo anunciado,
//   stock parado, ritmo das contas, maior aposta).

import { custoUnitario, diasEntre, emInventario, lucroVenda, somarDias, unidadesDisponiveis, usoConta, vendaValida } from './calc';
import type { Intervalo } from './calc';
import { fmtEuro, plural } from './format';
import type { Dados, Produto, Venda } from './types';

/** Mediana de uma lista de números (null se vazia). */
export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const dentro = (d: string, i: Intervalo) => (!i.inicio || d >= i.inicio) && (!i.fim || d <= i.fim);

/**
 * Período com que se compara: períodos longos (6 meses ou mais, ex.: "Este ano") comparam-se com
 * as mesmas datas do ano anterior; os curtos com o período igual imediatamente antes.
 * "Sempre" (sem início) não tem comparação.
 */
export function periodoAnterior(i: Intervalo, hoje: string): Intervalo | null {
  if (!i.inicio) return null;
  const fim = i.fim ?? hoje;
  const dias = diasEntre(i.inicio, fim);
  if (dias >= 180) {
    const menosUmAno = (d: string) => `${+d.slice(0, 4) - 1}${d.slice(4)}`;
    return { inicio: menosUmAno(i.inicio), fim: menosUmAno(fim) };
  }
  return { inicio: somarDias(i.inicio, -(dias + 1)), fim: somarDias(i.inicio, -1) };
}

/** Variação relativa entre dois valores (null se não dá para comparar). */
export const variacao = (agora: number, antes: number) => (antes > 0 ? agora / antes - 1 : null);

export interface DesempenhoTema {
  nome: string;
  vendas: number; // unidades vendidas
  lucro: number;
  custo: number;
  roi: number | null; // lucro ÷ custo
  dias: number | null; // mediana dos dias da compra à venda
  rentabAnual: number | null; // lucro ÷ (custo × dias ÷ 365)
}

/** Tema de um produto para as análises: o tema, ou a marca quando não há tema. */
const temaDe = (p: Produto) => (p.tema && p.tema.trim()) || (p.marca && p.marca.trim()) || 'Sem categoria';

/** Desempenho por tema das vendas concluídas no período. */
export function desempenhoTemas(d: Pick<Dados, 'produtos' | 'vendas'>, i: Intervalo): DesempenhoTema[] {
  const produtos = new Map(d.produtos.map((p) => [p.id, p]));
  const grupos = new Map<string, { vendas: number; lucro: number; custo: number; dias: number[]; capitalDias: number }>();
  for (const v of d.vendas) {
    const p = produtos.get(v.produto_id);
    if (!p || !vendaValida(v) || !dentro(v.data_venda, i)) continue;
    const k = temaDe(p);
    const g = grupos.get(k) ?? { vendas: 0, lucro: 0, custo: 0, dias: [], capitalDias: 0 };
    const custo = custoUnitario(p) * v.quantidade;
    g.vendas += v.quantidade;
    g.lucro += lucroVenda(v, p);
    g.custo += custo;
    if (p.data_compra) {
      const dias = Math.max(diasEntre(p.data_compra, v.data_venda), 1);
      g.dias.push(dias);
      g.capitalDias += custo * dias;
    }
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .map(([nome, g]) => ({
      nome,
      vendas: g.vendas,
      lucro: g.lucro,
      custo: g.custo,
      roi: g.custo > 0 ? g.lucro / g.custo : null,
      dias: mediana(g.dias),
      rentabAnual: g.capitalDias > 0 ? g.lucro / (g.capitalDias / 365) : null,
    }))
    .sort((a, b) => b.lucro - a.lucro);
}

export interface Destaque {
  id: string;
  tom: 'bom' | 'atencao' | 'neutro';
  titulo: string;
  valor: string;
  detalhe: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const MIN_VENDAS_TEMA = 3;

/** Preço por que se vendeu ÷ preço anunciado nessa altura (do período de anúncio fechado com a venda). */
function racioAnunciado(v: Venda, p: Produto): number | null {
  const periodo = [...(p.anuncios ?? [])]
    .filter((a) => a.fim && a.motivo === 'vendido' && a.fim.slice(0, 10) <= v.data_venda && a.fim.slice(0, 10) >= somarDias(v.data_venda, -7))
    .pop();
  const anunciado = periodo ? (periodo.precos?.length ? periodo.precos[periodo.precos.length - 1].preco : periodo.preco) : null;
  const unitario = v.preco_venda / Math.max(v.quantidade, 1);
  if (!anunciado || anunciado <= 0 || unitario <= 0) return null;
  const r = unitario / anunciado;
  return r > 0.3 && r < 1.5 ? r : null; // ignora registos sem sentido
}

/**
 * Os destaques do período (melhor/pior tema, negociação, tempo anunciado) e do momento
 * (stock parado, ritmo das contas, maior aposta). Só aparecem os que têm dados suficientes.
 */
export function destaques(d: Dados, i: Intervalo, hoje: string): Destaque[] {
  const r: Destaque[] = [];
  const produtos = new Map(d.produtos.map((p) => [p.id, p]));

  // 1. Melhor e pior tema por rentabilidade por ano (com pelo menos 3 vendas)
  const temas = desempenhoTemas(d, i).filter((t) => t.vendas >= MIN_VENDAS_TEMA && t.rentabAnual !== null);
  if (temas.length >= 2) {
    const ord = [...temas].sort((a, b) => b.rentabAnual! - a.rentabAnual!);
    const melhor = ord[0];
    const pior = ord[ord.length - 1];
    const det = (t: DesempenhoTema) => `ROI ${pct(t.roi ?? 0)}${t.dias !== null ? ` em ~${Math.round(t.dias)} dias` : ''} · ${plural(t.vendas, 'venda', 'vendas')}`;
    r.push({ id: 'melhor', tom: 'bom', titulo: `Melhor tema: ${melhor.nome}`, valor: `${pct(melhor.rentabAnual!)}/ano`, detalhe: det(melhor) });
    r.push({ id: 'pior', tom: pior.rentabAnual! < 0.2 ? 'atencao' : 'neutro', titulo: `Pior tema: ${pior.nome}`, valor: `${pct(pior.rentabAnual!)}/ano`, detalhe: det(pior) });
  }

  // 2. Negociação: a que % do preço anunciado se vende
  const racios: number[] = [];
  const diasAnunciado: number[] = [];
  for (const v of d.vendas) {
    const p = produtos.get(v.produto_id);
    if (!p || !vendaValida(v) || !dentro(v.data_venda, i)) continue;
    const x = racioAnunciado(v, p);
    if (x !== null) racios.push(x);
    const per = [...(p.anuncios ?? [])].filter((a) => a.fim && a.motivo === 'vendido' && !a.aproximado && a.fim.slice(0, 10) <= v.data_venda && a.fim.slice(0, 10) >= somarDias(v.data_venda, -7)).pop();
    if (per) diasAnunciado.push(Math.max(diasEntre(per.inicio.slice(0, 10), per.fim!.slice(0, 10)), 0));
  }
  const mr = mediana(racios);
  if (mr !== null && racios.length >= 3)
    r.push({ id: 'negociacao', tom: 'neutro', titulo: 'Preço final vs. anunciado', valor: pct(mr), detalhe: `mediana de ${plural(racios.length, 'venda', 'vendas')}` });
  const md = mediana(diasAnunciado);
  if (md !== null && diasAnunciado.length >= 3)
    r.push({ id: 'anunciado', tom: 'neutro', titulo: 'Anunciado até vender', valor: plural(Math.round(md), 'dia', 'dias'), detalhe: `mediana de ${plural(diasAnunciado.length, 'venda', 'vendas')}` });

  // 3. Stock parado há mais de 90 dias (desde a compra)
  let custoStock = 0;
  let custoParado = 0;
  let unidParadas = 0;
  const porSet = new Map<string, { nome: string; custo: number }>();
  for (const p of d.produtos) {
    if (!emInventario(p)) continue;
    const u = unidadesDisponiveis(p, d.vendas);
    if (!u) continue;
    const c = custoUnitario(p) * u;
    custoStock += c;
    if (p.data_compra && diasEntre(p.data_compra, hoje) > 90) {
      custoParado += c;
      unidParadas += u;
    }
    const k = (p.set_numero || p.nome).trim().toLowerCase();
    const g = porSet.get(k) ?? { nome: p.nome, custo: 0 };
    g.custo += c;
    porSet.set(k, g);
  }
  if (custoStock > 0 && unidParadas > 0)
    r.push({
      id: 'parado',
      tom: custoParado / custoStock > 0.3 ? 'atencao' : 'neutro',
      titulo: 'Em stock há mais de 90 dias',
      valor: fmtEuro(custoParado),
      detalhe: `${plural(unidParadas, 'unidade', 'unidades')} · ${pct(custoParado / custoStock)} do stock`,
    });

  // 4. Ritmo das contas: vendas que ainda cabem este ano e se o ritmo atual lá chega
  const ano = hoje.slice(0, 4);
  const diasAno = diasEntre(`${ano}-01-01`, hoje) + 1;
  const diasRestantes = diasEntre(hoje, `${ano}-12-31`);
  let vagas = 0;
  let comLimite = false;
  const aoLimite: string[] = [];
  for (const c of d.contas.filter((x) => x.ativa)) {
    const l = usoConta(c, d, hoje).limites.find((x) => x.nome.startsWith('Vendas'));
    if (l?.limite == null || l.restante == null) continue;
    comLimite = true;
    vagas += Math.max(l.restante, 0);
    const ritmo = l.usado / diasAno;
    if (l.restante <= 0 || ritmo * diasRestantes >= l.restante) aoLimite.push(c.nome);
  }
  if (comLimite)
    r.push({
      id: 'vagas',
      tom: aoLimite.length ? 'atencao' : 'neutro',
      titulo: 'Vendas que ainda cabem este ano',
      valor: String(vagas),
      detalhe: aoLimite.length ? `no ritmo atual chegam ao limite: ${aoLimite.join(', ')}` : 'todas as contas abaixo do ritmo do limite',
    });

  // 5. Maior aposta: o set com mais dinheiro em stock
  const maior = [...porSet.values()].sort((a, b) => b.custo - a.custo)[0];
  if (maior && custoStock > 0)
    r.push({
      id: 'maior',
      tom: maior.custo / custoStock > 0.15 ? 'atencao' : 'neutro',
      titulo: 'Maior aposta em stock',
      valor: pct(maior.custo / custoStock),
      detalhe: `${maior.nome} · ${fmtEuro(maior.custo)}`,
    });

  return r;
}
