// Anúncios por plataforma (fase 2, nov/2026).
//
// O QUE MUDOU: até aqui um produto só podia estar anunciado num sítio (estado, conta e preço no
// próprio produto, e o histórico em produtos.anuncios, JSON). Agora o mesmo set anuncia-se uma vez
// em cada plataforma (Vinted, Wallapop, eBay) — decisão do Ricardo, 22/11/2026. Cada anúncio é uma
// linha da tabela `anuncios` (tipo Anuncio): produto, conta, plataforma, preço, início e fim.
//
// COMO A APP USA ISTO:
//   - A tabela é a ÚNICA fonte da verdade de "onde está anunciado".
//   - Ao carregar, ligarAnuncios() calcula para cada produto em stock um RESUMO a partir dos
//     anúncios abertos: estado (anunciado / por anunciar), conta, preço e data do anúncio principal
//     (o da Vinted, se houver). Assim o resto da app (planos, cálculos, análises), que lê estes campos
//     do produto, continua a funcionar sem mudanças. Calcula também produto.anuncios (os períodos),
//     que já era lido para o tempo anunciado.
//   - Ao gravar um produto (state.tsx → guardar), planearGravacao() traduz a mudança em anúncios:
//       · passou/está "anunciado" numa conta → abre o anúncio dessa plataforma (os das outras
//         plataformas continuam abertos); mudou de conta dentro da mesma plataforma → fecha um, abre outro;
//       · mudou o preço → muda em TODOS os anúncios abertos (o preço é o que recebemos, igual em todas);
//       · passou a "por anunciar" (ou devolvido/cancelado) → fecha todos os abertos;
//       · passou a "vendido" → não fecha nada aqui: as vendas usam operacoesVenda (abaixo).
//     A coluna produtos.anuncios (JSON) deixou de se gravar: ficou como cópia antiga até à fase 3.
//   - Vender (operacoesVenda): fecha como "vendido" o anúncio da plataforma onde se vendeu. Se não
//     sobra nenhuma unidade, os anúncios nas outras plataformas passam para outra unidade igual em
//     stock (as fotos são do set); se não houver nenhuma, ficam abertos e aparece a tarefa
//     "Retirar da …" (só aviso: nunca se retira sozinho, regra do Ricardo).

import { diasEntre } from './calc';
import type { Anuncio, Conta, Dados, EstadoProduto, PeriodoAnuncio, Plataforma, Produto } from './types';

// ---------- Plataformas ----------

export const PLATAFORMAS: { valor: Plataforma; nome: string }[] = [
  { valor: 'vinted', nome: 'Vinted' },
  { valor: 'wallapop', nome: 'Wallapop' },
  { valor: 'ebay', nome: 'eBay' },
];

export const nomePlataforma = (p: Plataforma | null | undefined) => PLATAFORMAS.find((x) => x.valor === p)?.nome ?? 'Vinted';

/**
 * Plataforma de uma conta: a guardada na conta ou, em contas antigas, a do nome ("RM1 (Wallapop)").
 * Sem conta: Vinted (era a única até nov/2026).
 */
export function plataformaDaConta(c: Pick<Conta, 'nome'> & { plataforma?: Plataforma } | null | undefined): Plataforma {
  if (c?.plataforma) return c.plataforma;
  if (/\(\s*wallapop\s*\)/i.test(c?.nome ?? '')) return 'wallapop';
  if (/\(\s*ebay\s*\)/i.test(c?.nome ?? '')) return 'ebay';
  return 'vinted';
}

/** Plataforma da conta com este id (sem conta: Vinted). */
export const plataformaDe = (contas: Conta[] | undefined, contaId: string | null | undefined) =>
  plataformaDaConta(contaId ? contas?.find((c) => c.id === contaId) : null);

// ---------- Leitura ----------

export const estaAberto = (a: Pick<Anuncio, 'fim'>) => !a.fim;

/** Anúncios de cada produto (índice calculado uma vez por lista; as listas nunca se alteram no sítio). */
const indices = new WeakMap<Anuncio[], Map<string, Anuncio[]>>();
export function anunciosPorProduto(anuncios: Anuncio[]): Map<string, Anuncio[]> {
  let m = indices.get(anuncios);
  if (!m) {
    m = new Map();
    for (const a of anuncios) m.set(a.produto_id, [...(m.get(a.produto_id) ?? []), a]);
    for (const l of m.values()) l.sort((a, b) => a.inicio.localeCompare(b.inicio));
    indices.set(anuncios, m);
  }
  return m;
}

/** Anúncios ABERTOS de um produto. */
export const abertosDoProduto = (anuncios: Anuncio[] | undefined, produtoId: string) =>
  (anuncios ? anunciosPorProduto(anuncios).get(produtoId) ?? [] : []).filter(estaAberto);

/** O anúncio principal (o que aparece como "a" conta e "o" preço do produto): o da Vinted; senão o mais recente. */
export function anuncioPrincipal(abertos: Anuncio[]): Anuncio | null {
  if (!abertos.length) return null;
  return abertos.find((a) => a.plataforma === 'vinted') ?? [...abertos].sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
}

/** Os anúncios de um produto no formato antigo (períodos), para quem os lê (tempo anunciado, análises). */
export function periodosDe(lista: Anuncio[]): PeriodoAnuncio[] {
  return lista.map((a) => ({
    inicio: a.inicio,
    fim: a.fim,
    ...(a.motivo ? { motivo: a.motivo } : {}),
    conta_id: a.conta_id,
    preco: a.preco,
    precos: a.precos ?? [],
    ...(a.aproximado ? { aproximado: true } : {}),
    plataforma: a.plataforma,
  }));
}

/** Estados em que o produto está em stock (o resumo do anúncio só se calcula nestes). */
const EM_STOCK: EstadoProduto[] = ['por_anunciar', 'anunciado'];

/**
 * Resumo do anúncio de um produto, a partir dos anúncios abertos: estado, conta, preço e data do
 * anúncio principal. Só muda produtos em stock; vendidos/devolvidos/cancelados ficam como estão.
 */
export function resumoDoProduto(
  p: Pick<Produto, 'estado' | 'conta_id' | 'preco_anuncio' | 'data_anuncio'>,
  abertos: Anuncio[],
): Pick<Produto, 'estado' | 'conta_id' | 'preco_anuncio' | 'data_anuncio'> {
  if (!EM_STOCK.includes(p.estado)) return { estado: p.estado, conta_id: p.conta_id, preco_anuncio: p.preco_anuncio, data_anuncio: p.data_anuncio };
  const pr = anuncioPrincipal(abertos);
  if (!pr) return { estado: 'por_anunciar', conta_id: p.conta_id, preco_anuncio: p.preco_anuncio, data_anuncio: null };
  return { estado: 'anunciado', conta_id: pr.conta_id, preco_anuncio: pr.preco ?? p.preco_anuncio, data_anuncio: pr.inicio.slice(0, 10) };
}

const mesmo = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Liga os anúncios aos produtos (ao carregar e depois de cada gravação): cada produto fica com os
 * seus períodos (produto.anuncios) e, se estiver em stock, com o resumo dos anúncios abertos.
 * Um produto só é substituído por um objeto novo se alguma coisa mudou (os cálculos pesados
 * dependem de os objetos iguais continuarem a ser os mesmos).
 */
export function ligarAnuncios(d: Dados): Dados {
  const lista = d.anuncios ?? [];
  const idx = anunciosPorProduto(lista);
  let mudou = false;
  const produtos = d.produtos.map((p) => {
    const meus = idx.get(p.id) ?? [];
    const periodos = periodosDe(meus);
    const resumo = resumoDoProduto(p, meus.filter(estaAberto));
    if (mesmo(p.anuncios, periodos) && mesmo(p.estado, resumo.estado) && mesmo(p.conta_id, resumo.conta_id) && mesmo(p.preco_anuncio, resumo.preco_anuncio) && mesmo(p.data_anuncio, resumo.data_anuncio))
      return p;
    mudou = true;
    return { ...p, ...resumo, anuncios: periodos };
  });
  return mudou ? { ...d, produtos } : d;
}

// ---------- Operações (devolvem as linhas a gravar; nunca alteram as listas no sítio) ----------

export function novoAnuncio(produtoId: string, contaId: string | null, plataforma: Plataforma, preco: number | null, agora: string): Anuncio {
  return { id: crypto.randomUUID(), produto_id: produtoId, conta_id: contaId, plataforma, preco, precos: [], inicio: agora, fim: null, motivo: null, aproximado: false, id_externo: null };
}

export const fecharAnuncio = (a: Anuncio, agora: string, motivo: NonNullable<Anuncio['motivo']>): Anuncio => ({ ...a, fim: agora, motivo });

export const mudarPreco = (a: Anuncio, preco: number | null, agora: string): Anuncio => ({ ...a, preco, precos: [...(a.precos ?? []), { quando: agora, preco }] });

/** Junta alterações à lista (substitui pelo id ou acrescenta). */
export function aplicar(anuncios: Anuncio[], alterados: Anuncio[]): Anuncio[] {
  if (!alterados.length) return anuncios;
  const porId = new Map(alterados.map((a) => [a.id, a]));
  const r = anuncios.map((a) => porId.get(a.id) ?? a);
  for (const a of alterados) if (!anuncios.some((x) => x.id === a.id)) r.push(a);
  return r;
}

/** Um produto completo ou só alguns campos (há gravações parciais). */
type Linha = Partial<Produto> & { id: string };

/**
 * Traduz uma gravação de produtos em anúncios (regras no topo do ficheiro). Devolve:
 *   - linhas: os produtos a gravar, com o resumo do anúncio já certo e SEM produto.anuncios
 *     (a coluna antiga não se grava mais);
 *   - anuncios: as linhas da tabela anuncios a criar ou alterar.
 */
export function planearGravacao(
  linhas: Linha[],
  atuais: Produto[],
  anuncios: Anuncio[],
  contas: Conta[],
  agora: string,
): { linhas: Linha[]; anuncios: Anuncio[] } {
  let lista = anuncios;
  const alterados = new Map<string, Anuncio>();
  const registar = (xs: Anuncio[]) => {
    for (const a of xs) alterados.set(a.id, a);
    lista = aplicar(lista, xs);
  };
  const saida = linhas.map((l) => {
    const { anuncios: _jsonAntigo, ...resto } = l;
    if (l.estado === undefined) return resto as Linha; // gravação parcial sem estado: não mexe nos anúncios
    const antes = atuais.find((x) => x.id === l.id);
    const abertos = abertosDoProduto(lista, l.id);
    if (l.estado === 'anunciado') {
      const conta = 'conta_id' in l ? l.conta_id ?? null : antes?.conta_id ?? null;
      const plataforma = plataformaDe(contas, conta);
      const preco = 'preco_anuncio' in l ? l.preco_anuncio ?? null : antes?.preco_anuncio ?? null;
      const ops: Anuncio[] = [];
      const naPlataforma = abertos.find((a) => a.plataforma === plataforma);
      if (!naPlataforma) ops.push(novoAnuncio(l.id, conta, plataforma, preco, agora));
      else if (conta && naPlataforma.conta_id !== conta) ops.push(fecharAnuncio(naPlataforma, agora, 'outro'), novoAnuncio(l.id, conta, plataforma, preco, agora));
      // O preço é o mesmo em todas as plataformas: mudou → muda em todos os abertos
      const mudouPreco = 'preco_anuncio' in l && preco !== (antes?.preco_anuncio ?? null);
      if (mudouPreco) for (const a of abertos) if (!ops.some((o) => o.id === a.id) && a.preco !== preco) ops.push(mudarPreco(a, preco, agora));
      registar(ops);
    } else if (l.estado !== 'vendido') {
      // Por anunciar (retirado), devolvido ou cancelado: fecham-se todos
      registar(abertos.map((a) => fecharAnuncio(a, agora, l.estado === 'por_anunciar' ? 'retirado' : 'outro')));
    }
    const base = { ...(antes ?? {}), ...resto } as Produto;
    return { ...resto, ...resumoDoProduto(base, abertosDoProduto(lista, l.id)) } as Linha;
  });
  return { linhas: saida, anuncios: [...alterados.values()] };
}

/**
 * Fecha anúncios de um produto em algumas plataformas (retirar só da Wallapop, por exemplo).
 * Devolve os anúncios fechados e o resumo do produto depois disso.
 */
export function retirarDe(p: Produto, plataformas: Plataforma[], anuncios: Anuncio[], agora: string, motivo: NonNullable<Anuncio['motivo']> = 'retirado') {
  const fechados = abertosDoProduto(anuncios, p.id)
    .filter((a) => plataformas.includes(a.plataforma))
    .map((a) => fecharAnuncio(a, agora, motivo));
  const resumo = resumoDoProduto(p, abertosDoProduto(aplicar(anuncios, fechados), p.id));
  return { anuncios: fechados, resumo };
}

/**
 * Anúncios depois de uma venda nova do produto p, na conta contaVenda (regras no topo):
 *   - o anúncio da plataforma da venda fecha como "vendido";
 *   - se sobram unidades de p, os outros anúncios continuam em p;
 *   - se não sobram, os outros passam para outra unidade igual em stock (mesmo `chaveSet`) que ainda
 *     não esteja anunciada nessa plataforma; se não houver, ficam abertos (→ tarefa "Retirar da …").
 * Devolve as linhas de anúncios a gravar, o resumo de p e os resumos das unidades que receberam anúncios.
 */
export function operacoesVenda(args: {
  produto: Produto;
  contaVenda: string | null;
  sobram: number; // unidades de p que ficam por vender depois desta venda
  estadoSemAnuncios: EstadoProduto; // estado de p se não ficar anunciado (vendido / por anunciar)
  produtos: Produto[];
  anuncios: Anuncio[];
  contas: Conta[];
  chaveSet: (p: Produto) => string;
  emStock: (p: Produto) => boolean; // unidade com stock (para receber os anúncios)
  agora: string;
}) {
  const { produto: p, agora } = args;
  const plataforma = plataformaDe(args.contas, args.contaVenda);
  const abertos = abertosDoProduto(args.anuncios, p.id);
  const ops: Anuncio[] = [];
  const vendido = abertos.find((a) => a.plataforma === plataforma);
  if (vendido) ops.push(fecharAnuncio(vendido, agora, 'vendido'));
  const outros = abertos.filter((a) => a !== vendido);
  const destinos = new Map<string, Produto>();
  if (args.sobram <= 0 && outros.length) {
    const k = args.chaveSet(p);
    let lista = aplicar(args.anuncios, ops);
    for (const a of outros) {
      const alvo = args.produtos.find(
        (x) => x.id !== p.id && args.chaveSet(x) === k && args.emStock(x) && !abertosDoProduto(lista, x.id).some((y) => y.plataforma === a.plataforma),
      );
      if (!alvo) continue; // fica aberto no vendido → tarefa "Retirar da …"
      const movido = { ...a, produto_id: alvo.id };
      ops.push(movido);
      lista = aplicar(lista, [movido]);
      destinos.set(alvo.id, alvo);
    }
  }
  const depois = aplicar(args.anuncios, ops);
  const meus = abertosDoProduto(depois, p.id);
  // Com unidades e anúncios ainda abertos, continua anunciado; senão, o estado das vendas
  const estado: EstadoProduto = args.sobram > 0 && meus.length ? 'anunciado' : args.estadoSemAnuncios;
  const resumo = resumoDoProduto({ ...p, estado }, meus);
  // As unidades que receberam anúncios ficam anunciadas (o resumo vem dos anúncios abertos delas)
  const recebidos = [...destinos.values()].map((x) => ({ ...x, ...resumoDoProduto({ ...x, estado: 'anunciado' }, abertosDoProduto(depois, x.id)) }));
  return { anuncios: ops, resumo, outros: recebidos };
}

/**
 * Anúncios a partir dos períodos antigos (produtos.anuncios, JSON): só para o modo de demonstração e
 * os testes, que ainda trazem os dados no formato antigo (a produção foi convertida pela migração).
 */
export function anunciosDosPeriodos(produtos: Produto[], contas: Conta[]): Anuncio[] {
  const r: Anuncio[] = [];
  for (const p of produtos) {
    // Anunciado sem período aberto (dados antigos): o anúncio vem do resumo do próprio produto
    if (p.estado === 'anunciado' && !(p.anuncios ?? []).some((x) => !x.fim))
      r.push({
        ...novoAnuncio(p.id, p.conta_id && contas.some((c) => c.id === p.conta_id) ? p.conta_id : null, plataformaDe(contas, p.conta_id), p.preco_anuncio, `${p.data_anuncio ?? (p.data_compra ?? '2026-01-01')}T12:00:00.000Z`),
        aproximado: true,
      });
    for (const x of p.anuncios ?? [])
      r.push({
        id: crypto.randomUUID(),
        produto_id: p.id,
        conta_id: x.conta_id && contas.some((c) => c.id === x.conta_id) ? x.conta_id : null,
        plataforma: x.plataforma ?? plataformaDe(contas, x.conta_id),
        preco: x.preco ?? null,
        precos: x.precos ?? [],
        inicio: x.inicio,
        fim: x.fim ?? null,
        motivo: x.motivo ?? null,
        aproximado: !!x.aproximado,
        id_externo: null,
      });
  }
  return r;
}

// ---------- Tempo anunciado ----------

/**
 * Total de dias em que o produto esteve anunciado (até hoje, se ainda estiver). Com anúncios em
 * várias plataformas ao mesmo tempo, os dias contam uma só vez (junta os períodos que se sobrepõem).
 */
export function diasAnunciado(p: Pick<Produto, 'anuncios'>, hoje: string): number | null {
  if (!p.anuncios?.length) return null;
  const intervalos = p.anuncios
    .map((x) => [x.inicio.slice(0, 10), (x.fim ?? hoje).slice(0, 10)] as const)
    .filter(([a, b]) => b >= a)
    .sort((a, b) => a[0].localeCompare(b[0]));
  let total = 0;
  let ini: string | null = null;
  let fim: string | null = null;
  for (const [a, b] of intervalos) {
    if (fim === null || a > fim) {
      if (ini !== null && fim !== null) total += diasEntre(ini, fim);
      ini = a;
      fim = b;
    } else if (b > fim) fim = b;
  }
  if (ini !== null && fim !== null) total += diasEntre(ini, fim);
  return total;
}
