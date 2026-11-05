// "Promoção da loja" (dentro do ecrã Vale a pena?): que sets compensa comprar numa loja?
//
// ESCOLHER A LOJA: as lojas com listas recebidas de outra app (lib/promocoes.ts, ex.: Continente)
// aparecem como botões; escolher uma mostra a lista MAIS RECENTE dessa loja (cada set com o seu
// PVP, preço e/ou desconto). "Outra lista" deixa colar uma lista à mão: os números, ou o texto
// copiado da página da loja (a app encontra os n.º de set, os preços e as percentagens sozinha).
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
// SIMULAR UMA PROMOÇÃO ANUNCIADA (ex.: "amanhã Lego de 35% a 50% no Continente"): com "de … a …%"
// preenchido, avalia TODOS os sets da lista com esse desconto da loja (lib/avaliar.ts,
// simularPromocao) e mostra: os que compensam já com o mais baixo, os que só compensam com mais
// (até ao mais alto) e, escondidos, os outros. ⚡ marca os que podem esgotar (sinaisEsgotar: sai de
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
import { avaliarPromocao, ordenarPorDesconto, simularPromocao, sinaisEsgotar } from '../lib/avaliar';
import type { LinhaPromo, NomeEscalao } from '../lib/avaliar';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtDataHora, fmtEuro, hoje, lerNumero, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { descontoDe, extraPadrao, lojasRecebidas, promocoesRecebidas, setsDaPromocao } from '../lib/promocoes';
import { useDados } from '../state';
import { useCatalogoSets } from './catalogo';
import { Cartao } from './ui';
import { useAbrir } from './acoes';

const NOME_ESCALAO: Record<NomeEscalao, string> = { rara: 'oportunidade rara', otimo: 'muito bom', bom: 'bom' };
/** Valor do seletor para escrever/colar uma lista à mão. */
const MANUAL = '';
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
  const [verTodos, setVerTodos] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>('desconto');
  const [simDe, setSimDe] = useState('');
  const [simA, setSimA] = useState('');
  const [soEsgotar, setSoEsgotar] = useState(false);
  const h = hoje();
  const e = Math.min(Math.max(lerNumero(extra), 0), 90) / 100;
  const limitar = (x: string) => Math.min(Math.max(lerNumero(x), 0), 90) / 100;
  const de = limitar(simDe);
  const a = limitar(simA);
  const simulando = de > 0 || a > 0;

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
      sets.length && !simulando
        ? avaliarPromocao(sets, promo ? descontoDe(promo) : 0, { dados, mercado, hoje: h }, { tema, precos, descontos, pvps, extra: e })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, precos, descontos, pvps, promo, e, dados, mercado, h, catalogo.carregado, simulando],
  );
  // Simulação: todos os sets com o mesmo desconto da loja, de "de" a "a"
  const sim = useMemo(
    () => (sets.length && simulando ? simularPromocao(sets, de || a, a || de, { dados, mercado, hoje: h }, { tema, pvps, extra: e }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, pvps, de, a, e, dados, mercado, h, catalogo.carregado, simulando],
  );

  const sinais = (l: LinhaPromo) => sinaisEsgotar(l, h);
  const filtrar = (ls: LinhaPromo[]) => (soEsgotar ? ls.filter((l) => sinais(l).length > 0) : ls);

  // Modo normal: visíveis = os que compensam e os que têm desconto na lista (numa lista colada, todos)
  const ordenadas = ordem === 'desconto' ? ordenarPorDesconto(linhas) : linhas;
  const visiveis = filtrar(verTodos || !promo ? ordenadas : ordenadas.filter((l) => l.comprar > 0 || comDesconto(l.set)));
  const escondidos = filtrar(ordenadas).length - visiveis.length;
  const aComprar = linhas.filter((l) => l.comprar > 0);
  const total = aComprar.reduce((x, l) => x + l.comprar * (l.preco ?? 0), 0);

  // Simulação: comprar já (ao desconto mais baixo) e quantos podem esgotar
  const simComprar = sim?.compensaJa.filter((l) => l.comprar > 0) ?? [];
  const simTotal = simComprar.reduce((x, l) => x + l.comprar * (l.preco ?? 0), 0);
  const nEsgotar = sim ? [...sim.compensaJa, ...sim.comMais].filter((l) => sinais(l).length > 0).length : linhas.filter((l) => (l.comprar > 0 || comDesconto(l.set)) && sinais(l).length > 0).length;

  const abrirSet = (l: LinhaPromo) =>
    abrir({
      tipo: 'set',
      set: l.set,
      promo: {
        loja: sim ? `${loja || 'Lista'} (simulação a −${Math.round((l.descontoAplicado ?? 0) * 100)}%)` : loja || 'Lista',
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
  const linha = (l: LinhaPromo, comprarA?: number) => (
    <LinhaSet key={l.set} l={l} nome={catalogo(l.set)?.nome} sinais={sinais(l)} comprarA={comprarA} abrir={() => abrirSet(l)} />
  );

  function exportar() {
    const grupos: [string, LinhaPromo[]][] = sim
      ? [[`Compensa com ${pct(sim.de)}%`, sim.compensaJa], [`Só até ${pct(sim.a)}%`, sim.comMais], ['Não compensa', sim.resto]]
      : [['', ordenadas]];
    const todas: { g: string; l: LinhaPromo }[] = grupos.flatMap(([g, ls]) => ls.map((l) => ({ g, l })));
    descarregar(
      `promocao-${(loja || 'lista').toLowerCase().replace(/\W+/g, '-')}${sim ? `-simulacao-${pct(sim.de)}-${pct(sim.a)}` : ''}-${h}.csv`,
      paraCsv(todas, [
        ...(sim ? [{ titulo: 'Grupo', valor: (x: { g: string; l: LinhaPromo }) => x.g }] : []),
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

  const deTxt = sim ? `${pct(sim.de)}%` : '';
  const aTxt = sim ? `${pct(sim.a)}%` : '';

  return (
    <>
      {/* Loja: as que já enviaram listas, ou uma lista escrita/colada à mão */}
      <div className="segmentos segmentos-lojas" role="radiogroup" aria-label="Loja">
        {lojas.map((x) => (
          <button key={x.loja} role="radio" aria-checked={loja === x.loja} className={loja === x.loja ? 'ativo' : ''} onClick={() => escolher(x.loja)}>
            {x.loja}
          </button>
        ))}
        <button role="radio" aria-checked={loja === MANUAL} className={loja === MANUAL ? 'ativo' : ''} onClick={() => escolher(MANUAL)}>
          Outra lista
        </button>
      </div>

      {promo ? (
        <p className="nota">
          Lista de <strong>{fmtDataHora(promo.recebida)}</strong> · {plural(sets.length, 'set', 'sets')}
          {promo.valida_ate ? ` · válida até ${promo.valida_ate.split('-').reverse().join('/')}` : ''}.
        </p>
      ) : (
        <>
          <p className="nota">
            Cola a lista de sets: os números, ou o texto copiado da página da loja (selecionar tudo → copiar → colar). A app encontra os números, os preços e as percentagens sozinha.
          </p>
          <label className="campo">
            <span className="campo-rotulo">Sets</span>
            <textarea rows={5} value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder={'75375 63,74 €\n42151 -30%\n10280\n… ou o texto da página da loja'} />
          </label>
        </>
      )}

      <div className="avaliar-campos">
        <label className="campo avaliar-campo">
          <span className="campo-rotulo">{promo ? 'Desconto extra (ex.: cartão)' : 'Desconto da loja'}</span>
          <span className="campo-unidade">
            <input inputMode="decimal" value={extra} onChange={(ev) => setExtra(ev.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
            <span className="mudo">% {promo ? 'sobre o preço' : 'sobre o preço (ou o PVP)'}</span>
          </span>
        </label>
        <div className="campo avaliar-campo avaliar-sim">
          <span className="campo-rotulo">Simular promoção anunciada</span>
          <span className="campo-unidade">
            <input inputMode="decimal" aria-label="Desconto mínimo" value={simDe} onChange={(ev) => setSimDe(ev.target.value.replace(/[^\d.,]/g, ''))} placeholder="de" />
            <span className="mudo">a</span>
            <input inputMode="decimal" aria-label="Desconto máximo" value={simA} onChange={(ev) => setSimA(ev.target.value.replace(/[^\d.,]/g, ''))} placeholder="até" />
            <span className="mudo">%</span>
            {simulando && (
              <button className="link" onClick={() => (setSimDe(''), setSimA(''))}>
                limpar
              </button>
            )}
          </span>
        </div>
      </div>

      {sets.length > 0 && (
        <Cartao className="avaliar-resultado">
          {sim ? (
            <p className="avaliar-resumo">
              {simComprar.length ? (
                <>
                  Com <strong>{deTxt}</strong>: comprar <strong>{plural(simComprar.length, 'set', 'sets')}</strong> ({plural(simComprar.reduce((x, l) => x + l.comprar, 0), 'unidade', 'unidades')}),{' '}
                  <strong>{fmtEuro(simTotal)}</strong>.
                </>
              ) : (
                <>Com {deTxt}, nenhum compensa.</>
              )}
              {sim.a > sim.de && sim.comMais.length > 0 && (
                <>
                  {' '}
                  Com {aTxt}, mais {plural(sim.comMais.length, 'set', 'sets')}.
                </>
              )}
            </p>
          ) : (
            <p className="avaliar-resumo">
              {aComprar.length ? (
                <>
                  Comprar <strong>{plural(aComprar.length, 'set', 'sets')}</strong> ({plural(aComprar.reduce((x, l) => x + l.comprar, 0), 'unidade', 'unidades')}), <strong>{fmtEuro(total)}</strong> no total.
                </>
              ) : (
                <>Nenhum compensa{e > 0 ? `, mesmo com ${pct(e)}% extra` : ''}.</>
              )}
            </p>
          )}

          <div className="avaliar-filtros">
            {!sim && (
              <div className="segmentos segmentos-mini" role="radiogroup" aria-label="Ordenar">
                <button role="radio" aria-checked={ordem === 'desconto'} className={ordem === 'desconto' ? 'ativo' : ''} onClick={() => setOrdem('desconto')}>
                  Menos desconto necessário
                </button>
                <button role="radio" aria-checked={ordem === 'lucro'} className={ordem === 'lucro' ? 'ativo' : ''} onClick={() => setOrdem('lucro')}>
                  Recomendação
                </button>
              </div>
            )}
            {nEsgotar > 0 && (
              <button className={`btn btn-mini${soEsgotar ? ' ativo' : ''}`} aria-pressed={soEsgotar} onClick={() => setSoEsgotar((x) => !x)}>
                ⚡ {soEsgotar ? 'Mostrar todos' : `Só os que podem esgotar (${nEsgotar})`}
              </button>
            )}
          </div>

          {sim ? (
            <>
              <h4 className="secao-form">Compensam já com {deTxt} · {filtrar(sim.compensaJa).length}</h4>
              {filtrar(sim.compensaJa).length ? <ul className="lista-simples avaliar-promo">{filtrar(sim.compensaJa).map((l) => linha(l))}</ul> : <p className="nota">Nenhum.</p>}
              {sim.a > sim.de && (
                <>
                  <h4 className="secao-form">Só com mais desconto, até {aTxt} · {filtrar(sim.comMais).length}</h4>
                  {filtrar(sim.comMais).length ? (
                    <ul className="lista-simples avaliar-promo">{filtrar(sim.comMais).map((l) => linha(l, Math.round((l.descontoAplicado ?? 0) * 100)))}</ul>
                  ) : (
                    <p className="nota">Nenhum.</p>
                  )}
                </>
              )}
              {verTodos ? (
                <>
                  <h4 className="secao-form">Não compensam nem com {aTxt} · {filtrar(sim.resto).length}</h4>
                  <ul className="lista-simples avaliar-promo">{filtrar(sim.resto).map((l) => linha(l))}</ul>
                </>
              ) : (
                filtrar(sim.resto).length > 0 && (
                  <button className="link" onClick={() => setVerTodos(true)}>
                    Mostrar os outros {filtrar(sim.resto).length} (não compensam nem com {aTxt})
                  </button>
                )
              )}
            </>
          ) : (
            <>
              <ul className="lista-simples avaliar-promo">{visiveis.map((l) => linha(l))}</ul>
              {escondidos > 0 && (
                <button className="link" onClick={() => setVerTodos(true)}>
                  Mostrar os outros {escondidos} (sem desconto na lista)
                </button>
              )}
            </>
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
  );
}

/** "precisa de ≥21%", "compensa sem desconto" ou "não compensa". */
function precisaDe(l: LinhaPromo) {
  if (l.descontoMinimo === null) return l.precos.venda ? 'não compensa' : 'sem preço de venda';
  return l.descontoMinimo <= 0 ? 'compensa sem desconto' : `precisa de ≥${Math.round(l.descontoMinimo * 100)}%`;
}

/**
 * Uma linha (pensada para o telemóvel, pedido do Ricardo): por cima o set e quantas comprar; por
 * baixo, em destaque, os três números que importam: PVP, desconto e preço esperado de venda. Numa
 * linha pequena e discreta: de quanto desconto precisa e o lucro. Se houver, os sinais ⚡.
 * O escalão já se vê pela cor da bolinha, por isso não se escreve.
 * comprarA: na simulação, o desconto a que se avaliou (para "comprar 1 a 50%").
 */
function LinhaSet({ l, nome, sinais, comprarA, abrir }: { l: LinhaPromo; nome?: string; sinais: string[]; comprarA?: number; abrir(): void }) {
  const classe = l.comprar > 0 && l.escalao ? `avaliar-${l.escalao}` : 'avaliar-nao';
  const comExtra = l.precoLoja !== null && l.preco !== null && l.preco < l.precoLoja;
  // Desconto total sobre o PVP (já com o extra do cartão, se houver)
  const desc = l.descontoAplicado !== null ? Math.round(l.descontoAplicado * 100) : null;
  const extras = [
    precisaDe(l),
    l.margem !== null ? `lucro ${Math.round(l.margem * 100)}%` : '',
    comExtra ? `com extra: ${fmtEuro(l.preco)}` : '',
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
          <span className="avaliar-comprar">{l.comprar > 0 ? `comprar ${l.comprar}${comprarA ? ` a ${comprarA}%` : ''}` : 'não'}</span>
        </span>
        <span className="avaliar-numeros">
          <span>
            <small>PVP</small>
            {l.pvp ? fmtEuro(l.pvp) : '—'}
          </span>
          <span>
            <small>Desconto</small>
            {desc !== null && l.preco !== null ? `−${desc}%` : '—'}
          </span>
          <span>
            <small>Vende</small>
            {l.precos.venda ? `~${fmtEuro(l.precos.venda.preco)}` : '—'}
          </span>
        </span>
        <small className="mudo">{extras.join(' · ')}</small>
        {sinais.length > 0 && <small className="avaliar-esgotar">⚡ {sinais.join(' · ')}</small>}
      </span>
    </li>
  );
}
