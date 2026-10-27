// Todos os cálculos de custos, lucro, limites e estatísticas.
// Funções puras, sem acesso à interface, para poderem ser testadas.

import { dataLocal } from './format';
import type { Compra, Conta, Dados, EstadoProduto, Produto, Venda } from './types';

export const arred = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const soma = (xs: number[]) => arred(xs.reduce((a, b) => a + b, 0));

// ---------- Produtos e vendas ----------

export const custoTotalProduto = (p: Produto) => arred((p.preco_compra || 0) + (p.custos_adicionais || 0));
export const custoUnitario = (p: Produto) => custoTotalProduto(p) / Math.max(p.quantidade || 1, 1);

export const vendaValida = (v: Venda) => v.estado === 'pendente' || v.estado === 'concluida';

export const liquidoVenda = (v: Venda) =>
  arred((v.preco_venda || 0) - (v.comissao || 0) - (v.portes || 0) - (v.outros_custos || 0));

export const custoVenda = (v: Venda, p: Produto | undefined) =>
  p ? arred(custoUnitario(p) * (v.quantidade || 1)) : 0;

export const lucroVenda = (v: Venda, p: Produto | undefined) =>
  vendaValida(v) ? arred(liquidoVenda(v) - custoVenda(v, p)) : 0;

export function unidadesVendidas(produtoId: string, vendas: Venda[], ignorarVendaId?: string) {
  return vendas
    .filter((v) => v.produto_id === produtoId && vendaValida(v) && v.id !== ignorarVendaId)
    .reduce((a, v) => a + (v.quantidade || 1), 0);
}

export function unidadesDisponiveis(p: Produto, vendas: Venda[]) {
  if (p.estado === 'devolvido' || p.estado === 'cancelado') return 0;
  return Math.max((p.quantidade || 1) - unidadesVendidas(p.id, vendas), 0);
}

/** Estado que o produto deve ter depois de as vendas mudarem. */
export function estadoAposVendas(p: Produto, vendas: Venda[]): EstadoProduto {
  if (p.estado === 'devolvido' || p.estado === 'cancelado') return p.estado;
  const vendidas = unidadesVendidas(p.id, vendas);
  if (vendidas >= (p.quantidade || 1)) return 'vendido';
  if (p.estado === 'vendido') return p.data_anuncio ? 'anunciado' : 'por_anunciar';
  return p.estado;
}

export const emInventario = (p: Produto) => p.estado === 'por_anunciar' || p.estado === 'anunciado';

/** Chave para comparar produtos iguais: número do set ou, se não houver, o nome. */
export function chaveComparacao(p: Pick<Produto, 'set_numero' | 'nome'>) {
  const set = (p.set_numero || '').trim();
  if (set) return `set:${set.toLowerCase()}`;
  return `nome:${p.nome.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

// ---------- Compras ----------

export const totalCompra = (c: Compra) => arred((c.valor_artigos || 0) + (c.portes || 0) + (c.outros_custos || 0));

export interface ItemCompra {
  quantidade: number;
  preco: number; // usado no modo "individual"
}

/**
 * Distribui o valor de uma compra pelos produtos.
 * - "igual": o valor dos artigos é dividido pelas unidades;
 * - "individual": cada produto tem o seu preço.
 * Os portes e outros custos são sempre distribuídos em proporção ao preço de cada produto
 * (ou às unidades, se os preços forem todos zero). Os cêntimos que sobram vão para o último.
 */
export function distribuirCompra(
  c: Pick<Compra, 'valor_artigos' | 'portes' | 'outros_custos' | 'distribuicao'>,
  itens: ItemCompra[],
): { preco_compra: number; custos_adicionais: number }[] {
  if (!itens.length) return [];
  const qtds = itens.map((i) => Math.max(i.quantidade || 1, 1));
  const totalQtd = qtds.reduce((a, b) => a + b, 0);

  const precos =
    c.distribuicao === 'igual'
      ? repartir(c.valor_artigos || 0, qtds.map((q) => q / totalQtd))
      : itens.map((i) => arred(i.preco || 0));

  const base = precos.reduce((a, b) => a + b, 0);
  const pesos = base > 0 ? precos.map((p) => p / base) : qtds.map((q) => q / totalQtd);
  const extras = repartir((c.portes || 0) + (c.outros_custos || 0), pesos);

  return precos.map((p, i) => ({ preco_compra: p, custos_adicionais: extras[i] }));
}

/** Reparte um valor por pesos, garantindo que a soma dá exatamente o total. */
export function repartir(total: number, pesos: number[]): number[] {
  const partes = pesos.map((w) => arred(total * w));
  const diferenca = arred(total - partes.reduce((a, b) => a + b, 0));
  if (partes.length) partes[partes.length - 1] = arred(partes[partes.length - 1] + diferenca);
  return partes;
}

// ---------- Datas ----------

export function diasEntre(de: string, ate: string) {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function somarDias(d: string, n: number) {
  const x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  x.setDate(x.getDate() + n);
  return dataLocal(x);
}

export interface Intervalo {
  inicio: string | null; // inclusivo
  fim: string | null; // inclusivo
}

export const dentro = (d: string | null | undefined, i: Intervalo) =>
  (!i.inicio && !i.fim) || (!!d && (!i.inicio || d.slice(0, 10) >= i.inicio) && (!i.fim || d.slice(0, 10) <= i.fim));

export type Predefinicao = 'mes' | 'mes_anterior' | '30d' | '90d' | 'ano' | 'tudo';

export const PREDEFINICOES: { valor: Predefinicao; nome: string }[] = [
  { valor: 'mes', nome: 'Este mês' },
  { valor: 'mes_anterior', nome: 'Mês passado' },
  { valor: '30d', nome: 'Últimos 30 dias' },
  { valor: '90d', nome: 'Últimos 90 dias' },
  { valor: 'ano', nome: 'Este ano' },
  { valor: 'tudo', nome: 'Sempre' },
];

export function intervaloDe(p: Predefinicao, hoje: string): Intervalo {
  const a = hoje.slice(0, 4);
  const m = hoje.slice(5, 7);
  switch (p) {
    case 'mes':
      return { inicio: `${a}-${m}-01`, fim: hoje };
    case 'mes_anterior': {
      const fim = somarDias(`${a}-${m}-01`, -1);
      return { inicio: `${fim.slice(0, 7)}-01`, fim };
    }
    case '30d':
      return { inicio: somarDias(hoje, -29), fim: hoje };
    case '90d':
      return { inicio: somarDias(hoje, -89), fim: hoje };
    case 'ano':
      return { inicio: `${a}-01-01`, fim: hoje };
    default:
      return { inicio: null, fim: null };
  }
}

// ---------- Limites das contas ----------

export function periodoConta(c: Conta, hoje: string): Intervalo & { descricao: string } {
  const a = hoje.slice(0, 4);
  const m = hoje.slice(5, 7);
  switch (c.periodo) {
    case 'semanal': {
      const d = new Date(+a, +m - 1, +hoje.slice(8, 10));
      const desdeSegunda = (d.getDay() + 6) % 7;
      const inicio = somarDias(hoje, -desdeSegunda);
      return { inicio, fim: somarDias(inicio, 6), descricao: 'esta semana' };
    }
    case 'anual':
      return { inicio: `${a}-01-01`, fim: `${a}-12-31`, descricao: 'este ano' };
    case 'rolante': {
      const n = Math.max(c.periodo_dias || 30, 1);
      return { inicio: somarDias(hoje, -(n - 1)), fim: hoje, descricao: `últimos ${n} dias` };
    }
    case 'personalizado':
      return { inicio: c.periodo_inicio, fim: c.periodo_fim, descricao: 'período definido' };
    default: {
      const fim = somarDias(`${m === '12' ? +a + 1 : a}-${m === '12' ? '01' : String(+m + 1).padStart(2, '0')}-01`, -1);
      return { inicio: `${a}-${m}-01`, fim, descricao: 'este mês' };
    }
  }
}

export type Nivel = 'ok' | 'aviso' | 'excedido' | 'sem_limite';

export interface UsoLimite {
  nome: string;
  usado: number;
  limite: number | null;
  restante: number | null;
  pct: number;
  nivel: Nivel;
  dinheiro: boolean;
}

function uso(nome: string, usado: number, limite: number | null, alertaPct: number, dinheiro = false): UsoLimite {
  if (limite === null || limite === undefined || limite <= 0) {
    return { nome, usado, limite: null, restante: null, pct: 0, nivel: 'sem_limite', dinheiro };
  }
  const pct = (usado / limite) * 100;
  const nivel: Nivel = pct >= 100 ? 'excedido' : pct >= alertaPct ? 'aviso' : 'ok';
  return { nome, usado, limite, restante: arred(Math.max(limite - usado, 0)), pct, nivel, dinheiro };
}

export interface UsoConta {
  conta: Conta;
  periodo: Intervalo & { descricao: string };
  limites: UsoLimite[];
  nivel: Nivel;
  anunciosAtivos: number;
  vendasPeriodo: number;
  valorPeriodo: number;
}

export function usoConta(c: Conta, d: Pick<Dados, 'produtos' | 'vendas'>, hoje: string): UsoConta {
  const periodo = periodoConta(c, hoje);
  const anunciosAtivos = d.produtos.filter((p) => p.conta_id === c.id && p.estado === 'anunciado').length;
  const vendas = d.vendas.filter((v) => v.conta_id === c.id && vendaValida(v) && dentro(v.data_venda, periodo));
  const vendasPeriodo = vendas.length;
  const valorPeriodo = soma(vendas.map((v) => v.preco_venda));
  const alerta = c.alerta_pct || 80;
  const limites = [
    uso('Anúncios ativos', anunciosAtivos, c.limite_anuncios, alerta),
    uso(`Vendas (${periodo.descricao})`, vendasPeriodo, c.limite_vendas, alerta),
    uso(`Valor vendido (${periodo.descricao})`, valorPeriodo, c.limite_valor, alerta, true),
  ];
  const ordem: Nivel[] = ['sem_limite', 'ok', 'aviso', 'excedido'];
  const nivel = limites.reduce<Nivel>((n, l) => (ordem.indexOf(l.nivel) > ordem.indexOf(n) ? l.nivel : n), 'sem_limite');
  return { conta: c, periodo, limites, nivel, anunciosAtivos, vendasPeriodo, valorPeriodo };
}

// ---------- Estatísticas ----------

export interface Filtro {
  intervalo: Intervalo;
  pessoaId?: string;
  contaId?: string;
  texto?: string;
}

export interface LinhaGrupo {
  chave: string;
  nome: string;
  vendas: number;
  unidades: number;
  receita: number; // valor líquido
  lucro: number;
}

export interface LinhaSet {
  chave: string;
  nome: string;
  setNumero: string | null;
  compradas: number;
  vendidas: number;
  custoMedioCompra: number | null; // por unidade
  precoMedioVenda: number | null; // por unidade, preço de venda
  lucroMedio: number | null; // por unidade
  diasMedios: number | null;
}

export interface LinhaCategoria {
  nome: string;
  vendas: number;
  custo: number;
  lucro: number;
  roi: number | null; // lucro / custo
}

export interface Estatisticas {
  gasto: number;
  recebido: number;
  aReceber: number;
  lucro: number;
  vendasConcluidas: number;
  vendasPendentes: number;
  inventarioUnidades: number;
  inventarioCusto: number;
  inventarioProdutos: number;
  diasMediosVenda: number | null;
  margem: number | null; // lucro / custo das vendas
  porMes: { mes: string; lucro: number; receita: number; gasto: number }[];
  porConta: LinhaGrupo[];
  porPessoa: LinhaGrupo[];
  porCategoria: LinhaCategoria[];
  porSubcategoria: LinhaCategoria[];
  porSet: LinhaSet[];
  tempos: { produto: Produto; dias: number; venda: Venda }[];
  parados: { produto: Produto; dias: number; desde: string }[];
}

function correspondeTexto(p: Produto | undefined, texto?: string) {
  if (!texto) return true;
  if (!p) return false;
  const t = texto.toLowerCase();
  return [p.nome, p.set_numero, p.tema, p.marca, p.descricao].some((x) => (x || '').toLowerCase().includes(t));
}

export function estatisticas(d: Dados, f: Filtro, hoje: string): Estatisticas {
  const produtoPorId = new Map(d.produtos.map((p) => [p.id, p]));
  const compraPorId = new Map(d.compras.map((c) => [c.id, c]));

  // Gastos: compras (com todos os produtos) + produtos registados sem compra.
  const comprasFiltradas = d.compras.filter((c) => {
    if (!dentro(c.data, f.intervalo)) return false;
    if (f.pessoaId && c.pessoa_id !== f.pessoaId) return false;
    if (f.texto || f.contaId) {
      const ps = d.produtos.filter((p) => p.compra_id === c.id);
      if (f.texto && !ps.some((p) => correspondeTexto(p, f.texto))) return false;
      if (f.contaId && !ps.some((p) => p.conta_id === f.contaId)) return false;
    }
    return true;
  });
  const produtosSoltos = d.produtos.filter(
    (p) =>
      !p.compra_id &&
      dentro(p.data_compra, f.intervalo) &&
      (!f.pessoaId || p.pessoa_id === f.pessoaId) &&
      (!f.contaId || p.conta_id === f.contaId) &&
      correspondeTexto(p, f.texto),
  );
  const gasto = arred(
    // Com filtro de texto ou conta só conta o custo dos produtos correspondentes.
    (f.texto || f.contaId
      ? soma(
          comprasFiltradas.flatMap((c) =>
            d.produtos
              .filter((p) => p.compra_id === c.id && correspondeTexto(p, f.texto) && (!f.contaId || p.conta_id === f.contaId))
              .map(custoTotalProduto),
          ),
        )
      : soma(comprasFiltradas.map(totalCompra))) + soma(produtosSoltos.map(custoTotalProduto)),
  );

  // Vendas
  const vendasFiltradas = d.vendas.filter(
    (v) =>
      vendaValida(v) &&
      dentro(v.data_venda, f.intervalo) &&
      (!f.pessoaId || v.pessoa_id === f.pessoaId) &&
      (!f.contaId || v.conta_id === f.contaId) &&
      correspondeTexto(produtoPorId.get(v.produto_id), f.texto),
  );
  const concluidas = vendasFiltradas.filter((v) => v.estado === 'concluida');
  const pendentes = vendasFiltradas.filter((v) => v.estado === 'pendente');
  const recebido = soma(concluidas.map(liquidoVenda));
  const aReceber = soma(pendentes.map(liquidoVenda));
  const lucro = soma(concluidas.map((v) => lucroVenda(v, produtoPorId.get(v.produto_id))));
  const custoVendido = soma(concluidas.map((v) => custoVenda(v, produtoPorId.get(v.produto_id))));

  // Inventário (estado atual, não depende do período)
  const inventario = d.produtos.filter(
    (p) =>
      emInventario(p) &&
      (!f.pessoaId || p.pessoa_id === f.pessoaId) &&
      (!f.contaId || p.conta_id === f.contaId) &&
      correspondeTexto(p, f.texto),
  );
  let inventarioUnidades = 0;
  let inventarioCusto = 0;
  for (const p of inventario) {
    const u = unidadesDisponiveis(p, d.vendas);
    inventarioUnidades += u;
    inventarioCusto += custoUnitario(p) * u;
  }

  // Tempo entre compra e venda (vendas concluídas)
  const tempos = concluidas
    .map((v) => {
      const p = produtoPorId.get(v.produto_id);
      const dataCompra = p?.data_compra || (p?.compra_id ? compraPorId.get(p.compra_id)?.data : null);
      if (v.notas?.includes('data de venda desconhecida')) return null; // importadas sem data: distorciam a média
      return p && dataCompra ? { produto: p, venda: v, dias: Math.max(diasEntre(dataCompra, v.data_venda), 0) } : null;
    })
    .filter((x): x is { produto: Produto; venda: Venda; dias: number } => !!x)
    .sort((a, b) => b.dias - a.dias);
  const diasMediosVenda = tempos.length ? tempos.reduce((a, t) => a + t.dias, 0) / tempos.length : null;

  // Por mês
  const meses = new Map<string, { lucro: number; receita: number; gasto: number }>();
  const mes = (k: string) => {
    let m = meses.get(k);
    if (!m) meses.set(k, (m = { lucro: 0, receita: 0, gasto: 0 }));
    return m;
  };
  for (const v of concluidas) {
    const m = mes(v.data_venda.slice(0, 7));
    m.lucro += lucroVenda(v, produtoPorId.get(v.produto_id));
    m.receita += liquidoVenda(v);
  }
  if (!f.texto && !f.contaId) for (const c of comprasFiltradas) mes(c.data.slice(0, 7)).gasto += totalCompra(c);
  for (const p of produtosSoltos) if (p.data_compra) mes(p.data_compra.slice(0, 7)).gasto += custoTotalProduto(p);
  const porMes = [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, m]) => ({ mes: k, lucro: arred(m.lucro), receita: arred(m.receita), gasto: arred(m.gasto) }));

  // Agrupamentos
  const agrupar = (chaveDe: (v: Venda) => string | null, nomeDe: (k: string) => string): LinhaGrupo[] => {
    const g = new Map<string, LinhaGrupo>();
    for (const v of concluidas) {
      const k = chaveDe(v) ?? '—';
      let l = g.get(k);
      if (!l) g.set(k, (l = { chave: k, nome: k === '—' ? 'Sem indicação' : nomeDe(k), vendas: 0, unidades: 0, receita: 0, lucro: 0 }));
      l.vendas += 1;
      l.unidades += v.quantidade || 1;
      l.receita = arred(l.receita + liquidoVenda(v));
      l.lucro = arred(l.lucro + lucroVenda(v, produtoPorId.get(v.produto_id)));
    }
    return [...g.values()].sort((a, b) => b.lucro - a.lucro);
  };
  const nomeConta = (id: string) => d.contas.find((c) => c.id === id)?.nome ?? 'Conta apagada';
  const nomePessoa = (id: string) => d.pessoas.find((p) => p.id === id)?.nome ?? 'Pessoa apagada';
  const porConta = agrupar((v) => v.conta_id, nomeConta);
  const porPessoa = agrupar((v) => v.pessoa_id, nomePessoa);

  // Por categoria (marca) e subcategoria (tema), com ROI
  const porCat = (chave: (p: Produto) => string) => {
    const g = new Map<string, LinhaCategoria>();
    for (const v of concluidas) {
      const p = produtoPorId.get(v.produto_id);
      if (!p) continue;
      const k = chave(p);
      let l = g.get(k);
      if (!l) g.set(k, (l = { nome: k, vendas: 0, custo: 0, lucro: 0, roi: null }));
      l.vendas += v.quantidade || 1;
      l.custo = arred(l.custo + custoVenda(v, p));
      l.lucro = arred(l.lucro + lucroVenda(v, p));
    }
    return [...g.values()].map((l) => ({ ...l, roi: l.custo > 0 ? l.lucro / l.custo : null })).sort((a, b) => b.lucro - a.lucro);
  };
  const porCategoria = porCat((p) => p.marca?.trim() || 'Sem categoria');
  const porSubcategoria = porCat((p) => [p.marca?.trim() || 'Sem categoria', p.tema?.trim()].filter(Boolean).join(' › '));

  // Comparação de produtos iguais (todos os produtos que correspondem aos filtros)
  const sets = new Map<
    string,
    { nome: string; setNumero: string | null; compradas: number; custo: number; vendidas: number; precoVenda: number; lucro: number; dias: number[] }
  >();
  for (const p of d.produtos) {
    if (!correspondeTexto(p, f.texto)) continue;
    if (f.pessoaId && p.pessoa_id !== f.pessoaId) continue;
    if (p.estado === 'cancelado') continue;
    const k = chaveComparacao(p);
    let s = sets.get(k);
    if (!s) sets.set(k, (s = { nome: p.nome, setNumero: p.set_numero?.trim() || null, compradas: 0, custo: 0, vendidas: 0, precoVenda: 0, lucro: 0, dias: [] }));
    s.compradas += p.quantidade || 1;
    s.custo += custoTotalProduto(p);
  }
  for (const v of concluidas) {
    const p = produtoPorId.get(v.produto_id);
    if (!p) continue;
    const s = sets.get(chaveComparacao(p));
    if (!s) continue;
    s.vendidas += v.quantidade || 1;
    s.precoVenda += v.preco_venda;
    s.lucro += lucroVenda(v, p);
  }
  for (const t of tempos) sets.get(chaveComparacao(t.produto))?.dias.push(t.dias);
  const porSet: LinhaSet[] = [...sets.entries()]
    .map(([chave, s]) => ({
      chave,
      nome: s.nome,
      setNumero: s.setNumero,
      compradas: s.compradas,
      vendidas: s.vendidas,
      custoMedioCompra: s.compradas ? arred(s.custo / s.compradas) : null,
      precoMedioVenda: s.vendidas ? arred(s.precoVenda / s.vendidas) : null,
      lucroMedio: s.vendidas ? arred(s.lucro / s.vendidas) : null,
      diasMedios: s.dias.length ? Math.round(s.dias.reduce((a, b) => a + b, 0) / s.dias.length) : null,
    }))
    .sort((a, b) => b.vendidas - a.vendidas || b.compradas - a.compradas || a.nome.localeCompare(b.nome));

  // Produtos anunciados sem venda, há quanto tempo
  const parados = d.produtos
    .filter(
      (p) =>
        p.estado === 'anunciado' &&
        (!f.pessoaId || p.pessoa_id === f.pessoaId) &&
        (!f.contaId || p.conta_id === f.contaId) &&
        correspondeTexto(p, f.texto),
    )
    .map((p) => {
      const desde = p.data_anuncio || p.data_compra || (p.criado_em || hoje).slice(0, 10);
      return { produto: p, desde, dias: Math.max(diasEntre(desde, hoje), 0) };
    })
    .sort((a, b) => b.dias - a.dias);

  return {
    gasto,
    recebido,
    aReceber,
    lucro,
    vendasConcluidas: concluidas.length,
    vendasPendentes: pendentes.length,
    inventarioUnidades,
    inventarioCusto: arred(inventarioCusto),
    inventarioProdutos: inventario.length,
    diasMediosVenda,
    margem: custoVendido > 0 ? lucro / custoVendido : null,
    porMes,
    porConta,
    porPessoa,
    porCategoria,
    porSubcategoria,
    porSet,
    tempos,
    parados,
  };
}

// ---------- Lotes de compra (por mês de compra) ----------

export interface Lote {
  mes: string | null; // AAAA-MM, ou null sem data
  unidades: number;
  vendidas: number;
  gasto: number;
  recebido: number; // líquido das vendas concluídas
  lucro: number; // lucro realizado
  porVenderCusto: number;
}

export function lotes(d: Pick<Dados, 'produtos' | 'vendas'>): Lote[] {
  const m = new Map<string, Lote>();
  const vendasDe = new Map<string, Venda[]>();
  for (const v of d.vendas) if (v.estado === 'concluida') vendasDe.set(v.produto_id, [...(vendasDe.get(v.produto_id) ?? []), v]);
  for (const p of d.produtos) {
    if (p.estado === 'cancelado') continue;
    const k = p.data_compra ? p.data_compra.slice(0, 7) : '';
    let l = m.get(k);
    if (!l) m.set(k, (l = { mes: k || null, unidades: 0, vendidas: 0, gasto: 0, recebido: 0, lucro: 0, porVenderCusto: 0 }));
    l.unidades += p.quantidade || 1;
    l.gasto = arred(l.gasto + custoTotalProduto(p));
    for (const v of vendasDe.get(p.id) ?? []) {
      l.vendidas += v.quantidade || 1;
      l.recebido = arred(l.recebido + liquidoVenda(v));
      l.lucro = arred(l.lucro + lucroVenda(v, p));
    }
    if (emInventario(p)) l.porVenderCusto = arred(l.porVenderCusto + custoUnitario(p) * unidadesDisponiveis(p, d.vendas));
  }
  return [...m.values()].sort((a, b) => (b.mes ?? '').localeCompare(a.mes ?? ''));
}

// ---------- Idade do stock ----------

export interface FaixaIdade {
  nome: string;
  unidades: number;
  custo: number;
}

export interface IdadeStock {
  faixas: FaixaIdade[];
  antigos: { produto: Produto; dias: number | null; unidades: number }[];
}

export function idadeStock(d: Pick<Dados, 'produtos' | 'vendas'>, hoje: string): IdadeStock {
  const faixas: FaixaIdade[] = [
    { nome: 'Menos de 3 meses', unidades: 0, custo: 0 },
    { nome: '3 a 6 meses', unidades: 0, custo: 0 },
    { nome: '6 a 12 meses', unidades: 0, custo: 0 },
    { nome: 'Mais de 1 ano', unidades: 0, custo: 0 },
    { nome: 'Sem data de compra', unidades: 0, custo: 0 },
  ];
  const antigos: IdadeStock['antigos'] = [];
  for (const p of d.produtos) {
    if (!emInventario(p)) continue;
    const u = unidadesDisponiveis(p, d.vendas);
    if (!u) continue;
    const dias = p.data_compra ? Math.max(diasEntre(p.data_compra, hoje), 0) : null;
    const f = dias === null ? 4 : dias < 91 ? 0 : dias < 183 ? 1 : dias < 366 ? 2 : 3;
    faixas[f].unidades += u;
    faixas[f].custo = arred(faixas[f].custo + custoUnitario(p) * u);
    antigos.push({ produto: p, dias, unidades: u });
  }
  antigos.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
  return { faixas: faixas.filter((f) => f.unidades > 0), antigos };
}
