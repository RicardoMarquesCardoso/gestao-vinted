// Ecrã "Vale a pena?" (pages/Avaliar.tsx): que sets compensa comprar numa loja, ou um set em concreto?
//
// UMA SÓ LINHA NO TOPO (pedido do Ricardo, nov/2026; antes havia dois separadores, "Um set" e
// "Promoção da loja"): loja · procurar set · desconto, lado a lado.
//
// ESCOLHER A LOJA: as lojas com listas recebidas de outra app (lib/promocoes.ts, ex.: Continente)
// aparecem no seletor; escolher uma mostra a lista MAIS RECENTE dessa loja (cada set com o seu
// PVP, preço e/ou desconto). "Outra lista" deixa colar uma lista à mão: os números, ou o texto
// copiado da página da loja (a app encontra os n.º de set, os preços e as percentagens sozinha).
//
// PROCURAR UM SET: filtra a lista pelo n.º (começa por…) ou pelo nome. Se o n.º não estiver na
// lista (ou não houver lista), mostra o detalhe do set (components/DetalheSet.tsx): até que preço
// compensa comprá-lo e quantas unidades — o que antes era o separador "Um set".
//
// DESCONTO EXTRA: promoções que a lista não mostra e valem para tudo, ex.: 10% em cartão no
// Continente. Aplica-se sobre o preço de cada set (100 € a −30% = 70 €; com 10% em cartão = 63 €).
// Vem preenchido com o valor da loja (Continente 10%, EXTRA_POR_LOJA) e pode mudar-se quando houver
// uma promoção melhor. Numa lista colada sem preços, é o desconto da loja sobre o PVP.
//
// Para cada set, lib/avaliar.ts (avaliarPromocao) diz se compensa, em que escalão e quantas
// unidades, a diversificar (por set e por tema), e a partir de que desconto passaria a compensar.
// Mostram-se primeiro os que compensam e os que têm desconto; os outros ficam escondidos.
//
// ORDEM (pedido do Ricardo, nov/2026): por defeito, pelos que precisam de MENOS desconto para
// compensar ("precisa de ≥X%"); em alternativa, a recomendação (os que compensam, pelo lucro seguro).
//
// ⚡ marca os que podem esgotar (sinaisEsgotar: sai de
// produção em breve, eBay acima do PVP, ou vendemo-lo depressa), para comprar logo.
//
// TOCAR NUM SET abre o detalhe dele (components/DetalheSet.tsx) numa janela: o preço da promoção,
// os escalões, de onde vem o preço de venda e as nossas vendas do set. É calculado na hora com o
// que a app já tem, por isso não se guarda nada.
//
// EBAY: a lista não pesquisa o eBay sozinha (pedido do Ricardo, nov/2026). Usa as pesquisas já
// guardadas (botão "Procurar no eBay" no detalhe de cada set, no máximo 1 por set a cada 7 dias)
// e o eBay da tarefa diária; para pesquisar um set, toca-se nele e carrega-se no botão.
//
// A app não abre o link da loja: ler páginas de outros sites é bloqueado pelo browser e, num
// servidor, seria recolha automática (termos de uso).

import { useMemo, useState } from 'react';
import { avaliarPromocao, ordenarPorDesconto, retiradoHaMeses, sinaisEsgotar } from '../lib/avaliar';
import type { LinhaPromo, NomeEscalao } from '../lib/avaliar';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtDataHora, fmtEuro, hoje, lerNumero, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { descontoDe, extraPadrao, lojasRecebidas, promocoesRecebidas, setsDaPromocao } from '../lib/promocoes';
import { useDados } from '../state';
import { useCatalogoSets } from './catalogo';
import { Cartao } from './ui';
import { DetalheSet } from './DetalheSet';
import { useAbrir } from './acoes';

const NOME_ESCALAO: Record<NomeEscalao, string> = { rara: 'oportunidade rara', otimo: 'muito bom', bom: 'bom' };
/** Valor do seletor para escrever/colar uma lista à mão. */
const MANUAL = '';
const SET_VALIDO = /^\d{3,7}(-\d+)?$/;
const pct = (x: number) => String(Math.round(x * 1000) / 10).replace('.', ',');

type Ordem = 'desconto' | 'lucro';

export function AvaliarPromocao({ idInicial }: { idInicial?: string }) {
  const { dados } = useDados();
  const abrir = useAbrir();
  const mercado = useMercado();
  const catalogo = useCatalogoSets();
  const lojas = lojasRecebidas(dados.definicoes);
  // Loja inicial: a da promoção aberta a partir do Painel, senão a da lista mais recente
  const inicial = promocoesRecebidas(dados.definicoes).find((p) => p.id === idInicial)?.loja ?? lojas[0]?.loja ?? MANUAL;
  const [loja, setLoja] = useState(inicial);
  const [extra, setExtra] = useState(() => (inicial ? pct(extraPadrao(inicial)) : ''));
  const [texto, setTexto] = useState('');
  const [procura, setProcura] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>('desconto');
  const [soEsgotar, setSoEsgotar] = useState(false);
  // Filtro "Retirado há mais de 6 meses" (pedido do Ricardo); junta-se ao ⚡ se os dois estiverem ligados
  const [soRetirados, setSoRetirados] = useState(false);
  const h = hoje();
  const e = Math.min(Math.max(lerNumero(extra), 0), 90) / 100;

  function escolher(l: string) {
    setLoja(l);
    setExtra(l ? pct(extraPadrao(l)) : '');
    setVerTodos(false);
  }

  const promo = loja ? lojas.find((x) => x.loja === loja)?.ultima ?? null : null;

  // Sets reconhecidos (os que a Brickset ou o catálogo conhecem), com o preço, desconto e PVP de cada um
  const { sets, precos, descontos, pvps } = useMemo(
    () => setsDaPromocao(promo ?? { id: '', recebida: '', loja: '', texto }, (n) => !!mercado?.brickset[n] || !!catalogo(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texto, promo, mercado, catalogo.carregado],
  );
  const comDesconto = (s: string) => descontos[s] !== null || (precos[s] !== null && pvps[s] !== null && precos[s]! < pvps[s]!);
  const tema = (n: string) => catalogo(n)?.tema;

  // Avaliação com os preços da lista (modo normal)
  const linhas = useMemo(
    () =>
      sets.length
        ? avaliarPromocao(sets, promo ? descontoDe(promo) : 0, { dados, mercado, hoje: h }, { tema, precos, descontos, pvps, extra: e })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, precos, descontos, pvps, promo, e, dados, mercado, h, catalogo.carregado],
  );

  const sinais = (l: LinhaPromo) => sinaisEsgotar(l, h);
  // Procurar: por n.º (começa por…) ou pelo nome do set
  const q = procura.trim().toLowerCase();
  const corresponde = (n: string) => !q || (/^\d/.test(q) ? n.startsWith(q) : (catalogo(n)?.nome ?? '').toLowerCase().includes(q));
  const retirado = (l: LinhaPromo) => retiradoHaMeses(l, h, 6);
  const filtrar = (ls: LinhaPromo[]) =>
    ls.filter((l) => corresponde(l.set) && (!soEsgotar || sinais(l).length > 0) && (!soRetirados || retirado(l)));
  // Set procurado que não está na lista: mostra-se o detalhe dele (o antigo "Um set")
  const setSozinho = SET_VALIDO.test(q) && !sets.includes(q) ? q : null;

  // Modo normal: visíveis = os que compensam e os que têm desconto na lista (numa lista colada, todos)
  const ordenadas = ordem === 'desconto' ? ordenarPorDesconto(linhas) : linhas;
  const visiveis = filtrar(verTodos || !promo || q ? ordenadas : ordenadas.filter((l) => l.comprar > 0 || comDesconto(l.set)));
  const escondidos = filtrar(ordenadas).length - visiveis.length;
  const aComprar = linhas.filter((l) => l.comprar > 0);
  const total = aComprar.reduce((x, l) => x + l.comprar * (l.preco ?? 0), 0);

  const nEsgotar = linhas.filter((l) => (l.comprar > 0 || comDesconto(l.set)) && sinais(l).length > 0).length;
  const nRetirados = linhas.filter((l) => (verTodos || !promo || l.comprar > 0 || comDesconto(l.set)) && retirado(l)).length;

  const abrirSet = (l: LinhaPromo) =>
    abrir({
      tipo: 'set',
      set: l.set,
      promo: {
        loja: loja || 'Lista',
        preco: l.preco,
        precoLoja: l.precoLoja,
        descontoAplicado: l.descontoAplicado,
        lucro: l.lucro,
        margem: l.margem,
        comprar: l.comprar,
        escalao: l.escalao,
        descontoMinimo: l.descontoMinimo,
        motivo: l.motivo ?? null,
      },
    });
  const linha = (l: LinhaPromo) => (
    <LinhaSet key={l.set} l={l} nome={catalogo(l.set)?.nome} sinais={sinais(l)} abrir={() => abrirSet(l)} />
  );

  function exportar() {
    const todas = ordenadas.map((l) => ({ l }));
    descarregar(
      `promocao-${(loja || 'lista').toLowerCase().replace(/\W+/g, '-')}-${h}.csv`,
      paraCsv(todas, [
        { titulo: 'Set', valor: ({ l }) => l.set },
        { titulo: 'Nome', valor: ({ l }) => catalogo(l.set)?.nome ?? '' },
        { titulo: 'Tema', valor: ({ l }) => l.tema },
        { titulo: 'Precisa de (% da loja)', valor: ({ l }) => (l.descontoMinimo !== null ? Math.round(l.descontoMinimo * 100) : 'nunca') },
        { titulo: 'Pode esgotar', valor: ({ l }) => sinais(l).join('; ') },
        { titulo: 'PVP', valor: ({ l }) => l.pvp },
        { titulo: 'PVP de', valor: ({ l }) => (l.pvpOrigem === 'loja' ? 'loja' : l.pvpOrigem === 'brickset' ? 'Brickset' : '') },
        { titulo: 'Preço na loja', valor: ({ l }) => l.precoLoja },
        { titulo: `Preço final (com ${pct(e)}% extra)`, valor: ({ l }) => l.preco },
        { titulo: 'Desconto total sobre o PVP (%)', valor: ({ l }) => (l.descontoAplicado !== null ? Math.round(l.descontoAplicado * 100) : null) },
        { titulo: 'Vende-se por', valor: ({ l }) => (l.precos.venda ? Math.round(l.precos.venda.preco * 100) / 100 : null) },
        { titulo: 'Fonte', valor: ({ l }) => l.precos.venda?.fonte },
        { titulo: 'Lucro', valor: ({ l }) => (l.lucro !== null ? Math.round(l.lucro * 100) / 100 : null) },
        { titulo: 'Lucro %', valor: ({ l }) => (l.margem !== null ? Math.round(l.margem * 100) : null) },
        { titulo: 'Escalão', valor: ({ l }) => (l.escalao ? NOME_ESCALAO[l.escalao] : 'não compensa') },
        { titulo: 'Comprar', valor: ({ l }) => l.comprar },
        { titulo: 'Em stock', valor: ({ l }) => l.precos.emStock },
        { titulo: 'Pagar no máximo (bom)', valor: ({ l }) => l.precos.escaloes.find((x) => x.nome === 'bom')?.precoMax },
        { titulo: 'Nota', valor: ({ l }) => l.motivo },
      ]),
    );
  }


  return (
    <>
      {/* Uma linha: loja · procurar set · desconto (pedido do Ricardo) */}
      <div className="avaliar-barra">
        <select aria-label="Loja" value={loja} onChange={(ev) => escolher(ev.target.value)}>
          {lojas.map((x) => (
            <option key={x.loja} value={x.loja}>
              {x.loja}
            </option>
          ))}
          <option value={MANUAL}>Outra lista</option>
        </select>
        <input type="search" aria-label="Procurar set" value={procura} onChange={(ev) => setProcura(ev.target.value)} placeholder="N.º ou nome" />
        <span className="avaliar-barra-desc" title={promo ? 'Desconto extra sobre o preço (ex.: cartão)' : 'Desconto da loja sobre o preço (ou o PVP)'}>
          <input inputMode="decimal" aria-label={promo ? 'Desconto extra' : 'Desconto da loja'} value={extra} onChange={(ev) => setExtra(ev.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
          <span className="mudo">%</span>
        </span>
      </div>

      {promo ? (
        <p className="nota">
          Lista de <strong>{fmtDataHora(promo.recebida)}</strong> · {plural(sets.length, 'set', 'sets')}
          {promo.valida_ate ? ` · válida até ${promo.valida_ate.split('-').reverse().join('/')}` : ''}.
        </p>
      ) : (
        !setSozinho && (
          <label className="campo">
            <span className="campo-rotulo">Sets</span>
            <textarea rows={4} value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder={'75375 63,74 €\n42151 -30%\n10280\n… ou o texto da página da loja'} />
          </label>
        )
      )}

      {setSozinho ? (
        <>
          {sets.length > 0 && <p className="nota">O {setSozinho} não está na lista{promo ? ` do ${loja}` : ''}.</p>}
          <DetalheSet set={setSozinho} />
        </>
      ) : (
        <>
      {sets.length > 0 && (
        <Cartao className="avaliar-resultado">
            <p className="avaliar-resumo">
              {aComprar.length ? (
                <>
                  Comprar <strong>{plural(aComprar.length, 'set', 'sets')}</strong> ({plural(aComprar.reduce((x, l) => x + l.comprar, 0), 'unidade', 'unidades')}), <strong>{fmtEuro(total)}</strong> no total.
                </>
              ) : (
                <>Nenhum compensa{e > 0 ? `, mesmo com ${pct(e)}% extra` : ''}.</>
              )}
            </p>

          <div className="avaliar-filtros">
            <div className="segmentos segmentos-mini" role="radiogroup" aria-label="Ordenar">
              <button role="radio" aria-checked={ordem === 'desconto'} className={ordem === 'desconto' ? 'ativo' : ''} onClick={() => setOrdem('desconto')}>
                Menos desconto necessário
              </button>
              <button role="radio" aria-checked={ordem === 'lucro'} className={ordem === 'lucro' ? 'ativo' : ''} onClick={() => setOrdem('lucro')}>
                Recomendação
              </button>
            </div>
            {nEsgotar > 0 && (
              <button className={`btn btn-mini${soEsgotar ? ' ativo' : ''}`} aria-pressed={soEsgotar} onClick={() => setSoEsgotar((x) => !x)}>
                ⚡ {soEsgotar ? 'Mostrar todos' : `Só os que podem esgotar (${nEsgotar})`}
              </button>
            )}
            {nRetirados > 0 && (
              <button className={`btn btn-mini${soRetirados ? ' ativo' : ''}`} aria-pressed={soRetirados} onClick={() => setSoRetirados((x) => !x)}>
                Retirado há +6 meses ({nRetirados})
              </button>
            )}
          </div>

          <ul className="lista-simples avaliar-promo">{visiveis.map((l) => linha(l))}</ul>
          {q && visiveis.length === 0 && <p className="nota">Nenhum set encontrado.</p>}
          {escondidos > 0 && (
            <button className="link" onClick={() => setVerTodos(true)}>
              Mostrar os outros {escondidos} (sem desconto na lista)
            </button>
          )}
          <div className="linha-botoes">
            <button className="btn" onClick={exportar}>Descarregar para Excel</button>
          </div>
          <p className="nota">
            "Precisa de ≥X%" é o desconto da loja sobre o PVP a partir do qual compensa, já contando o extra
            {e > 0 ? ` de ${pct(e)}%` : ''}. ⚡ Pode esgotar: sai de produção nos próximos meses, no eBay pedem mais do que o PVP, ou nós vendemo-lo depressa (não sabemos o stock da loja). PVP: o da loja, se vier na lista; senão o da
            LEGO Alemanha (Brickset). Os sets sem eBay nem vendas nossas usam o PVP × a % a que costumamos vender, que é conservador.
          </p>
        </Cartao>
      )}
        </>
      )}
    </>
  );
}

/** "precisa de ≥21%", "compensa sem desconto" ou "não compensa". */
function precisaDe(l: LinhaPromo) {
  if (l.descontoMinimo === null) return l.precos.venda ? 'não compensa' : 'sem preço de venda';
  return l.descontoMinimo <= 0 ? 'compensa sem desconto' : `precisa de ≥${Math.round(l.descontoMinimo * 100)}%`;
}

/**
 * Uma linha (pensada para o telemóvel, pedido do Ricardo): por cima o set e quantas comprar ("Não
 * comprar" se não compensa); por baixo, em destaque, três colunas:
 *   PVP · Preço (desconto): o preço final na promoção, já com o extra, e o desconto total sobre o
 *   PVP · Vende por (desconto necessário): a venda esperada e o desconto sobre o PVP a partir do
 *   qual compensa comprar 1 (escalão "bom"; "PVP" se compensa sem desconto).
 * Numa linha pequena e discreta: o lucro. Se houver, os sinais ⚡. O escalão vê-se pela cor da bolinha.
 */
function LinhaSet({ l, nome, sinais, abrir }: { l: LinhaPromo; nome?: string; sinais: string[]; abrir(): void }) {
  const classe = l.comprar > 0 && l.escalao ? `avaliar-${l.escalao}` : 'avaliar-nao';
  // Desconto total sobre o PVP (já com o extra do cartão, se houver)
  const desc = l.descontoAplicado !== null ? Math.round(l.descontoAplicado * 100) : null;
  // Desconto necessário para compensar comprar 1
  const precisa = l.descontoMinimo === null ? null : l.descontoMinimo <= 0 ? 'PVP' : `−${Math.round(l.descontoMinimo * 100)}%`;
  const extras = [
    l.margem !== null ? `lucro ${Math.round(l.margem * 100)}%` : '',
    l.descontoMinimo === null ? precisaDe(l) : '',
    l.comprar === 0 && l.motivo && !/a partir de|Não compensa com nenhum/.test(l.motivo) ? l.motivo : '',
  ].filter(Boolean);
  return (
    <li className={`avaliar-escalao avaliar-linha-promo ${classe} clicavel`} onClick={abrir} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && abrir()}>
      <span className="avaliar-bolinha" aria-hidden="true" />
      <span className="linha-principal">
        <span className="avaliar-topo">
          <span className="truncar">
            <strong>{l.set}</strong> {nome ?? ''}
          </span>
          <span className="avaliar-comprar">{l.comprar > 0 ? `Comprar ${l.comprar}` : 'Não comprar'}</span>
        </span>
        <span className="avaliar-numeros">
          <span>
            <small>PVP</small>
            {l.pvp ? fmtEuro(l.pvp) : '—'}
          </span>
          <span>
            <small>Preço</small>
            {l.preco !== null ? fmtEuro(l.preco) : '—'}
            {desc !== null && l.preco !== null && <> <em>({desc > 0 ? `−${desc}%` : 'PVP'})</em></>}
          </span>
          <span>
            <small>Vende por</small>
            {l.precos.venda ? `~${fmtEuro(l.precos.venda.preco)}` : '—'}
            {precisa && <> <em>({precisa})</em></>}
          </span>
        </span>
        <small className="mudo">{extras.join(' · ')}</small>
        {sinais.length > 0 && <small className="avaliar-esgotar">⚡ {sinais.join(' · ')}</small>}
      </span>
    </li>
  );
}
