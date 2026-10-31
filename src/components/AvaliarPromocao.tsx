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
// A app não abre o link da loja: ler páginas de outros sites é bloqueado pelo browser e, num
// servidor, seria recolha automática (termos de uso).

import { useMemo, useState } from 'react';
import { CHAVE_SETS_AVALIAR, avaliarPromocao } from '../lib/avaliar';
import type { LinhaPromo, NomeEscalao } from '../lib/avaliar';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtDataHora, fmtEuro, hoje, lerNumero, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { descontoDe, extraPadrao, lojasRecebidas, promocoesRecebidas, setsDaPromocao } from '../lib/promocoes';
import { useDados } from '../state';
import { useCatalogoSets } from './catalogo';
import { precoEbay, useEbayVivo } from './ebayVivo';
import { Cartao } from './ui';

const NOME_ESCALAO: Record<NomeEscalao, string> = { rara: 'oportunidade rara', otimo: 'muito bom', bom: 'bom' };
/** Valor do seletor para escrever/colar uma lista à mão. */
const MANUAL = '';
const pct = (x: number) => String(Math.round(x * 1000) / 10).replace('.', ',');

export function AvaliarPromocao({ idInicial }: { idInicial?: string }) {
  const { dados, store, guardar, lista, aviso } = useDados();
  const mercado = useMercado();
  const catalogo = useCatalogoSets();
  const lojas = lojasRecebidas(dados.definicoes);
  // Loja inicial: a da promoção aberta a partir do Painel, senão a da lista mais recente
  const inicial = promocoesRecebidas(dados.definicoes).find((p) => p.id === idInicial)?.loja ?? lojas[0]?.loja ?? MANUAL;
  const [loja, setLoja] = useState(inicial);
  const [extra, setExtra] = useState(() => (inicial ? pct(extraPadrao(inicial)) : ''));
  const [texto, setTexto] = useState('');
  const [verTodos, setVerTodos] = useState(false);
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
  // eBay na hora só para os sets com desconto na lista (ou todos, numa lista colada), no máximo 25
  const comDesconto = (s: string) => descontos[s] !== null || (precos[s] !== null && pvps[s] !== null && precos[s]! < pvps[s]!);
  const paraEbay = (promo ? sets.filter(comDesconto) : sets).slice(0, 25);
  const ebay = useEbayVivo(paraEbay, store.modo === 'supabase');
  const chaveEbay = paraEbay.map((s) => precoEbay(ebay[s])?.join('/') ?? '').join(',');

  const linhas = useMemo(
    () =>
      sets.length
        ? avaliarPromocao(sets, promo ? descontoDe(promo) : 0, { dados, mercado, hoje: h }, {
            tema: (n) => catalogo(n)?.tema,
            ebayAoVivo: (n) => precoEbay(ebay[n]),
            precos,
            descontos,
            pvps,
            extra: e,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, precos, descontos, pvps, promo, e, dados, mercado, h, chaveEbay, catalogo.carregado],
  );
  const aComprar = linhas.filter((l) => l.comprar > 0);
  const total = aComprar.reduce((a, l) => a + l.comprar * (l.preco ?? 0), 0);
  const aProcurar = paraEbay.some((s) => ebay[s] === 'a_procurar');
  // Visíveis: os que compensam e os que têm desconto na lista (numa lista colada, todos)
  const visiveis = verTodos || !promo ? linhas : linhas.filter((l) => l.comprar > 0 || comDesconto(l.set));
  const escondidos = linhas.length - visiveis.length;
  // Sets sem preço de venda do eBay nem nosso: acompanhá-los faz a tarefa diária ir buscar o eBay
  const acompanhados = lista(CHAVE_SETS_AVALIAR);
  const semEbay = visiveis.filter((l) => l.precos.venda?.fonte !== 'vendas' && l.precos.venda?.fonte !== 'ebay' && !acompanhados.includes(l.set)).map((l) => l.set);

  async function acompanhar() {
    await guardar('definicoes', [{ chave: CHAVE_SETS_AVALIAR, valor: [...acompanhados, ...semEbay] }]);
    aviso(`${plural(semEbay.length, 'set', 'sets')} a acompanhar: a partir de amanhã a tarefa diária vai buscar o eBay.`);
  }

  function exportar() {
    descarregar(
      `promocao-${(loja || 'lista').toLowerCase().replace(/\W+/g, '-')}-${h}.csv`,
      paraCsv(linhas, [
        { titulo: 'Set', valor: (l) => l.set },
        { titulo: 'Nome', valor: (l) => catalogo(l.set)?.nome ?? '' },
        { titulo: 'Tema', valor: (l) => l.tema },
        { titulo: 'PVP', valor: (l) => l.pvp },
        { titulo: 'PVP de', valor: (l) => (l.pvpOrigem === 'loja' ? 'loja' : l.pvpOrigem === 'brickset' ? 'Brickset' : '') },
        { titulo: 'Preço na loja', valor: (l) => l.precoLoja },
        { titulo: `Preço final (com ${pct(e)}% extra)`, valor: (l) => l.preco },
        { titulo: 'Desconto total sobre o PVP (%)', valor: (l) => (l.descontoAplicado !== null ? Math.round(l.descontoAplicado * 100) : null) },
        { titulo: 'Vende-se por', valor: (l) => (l.precos.venda ? Math.round(l.precos.venda.preco * 100) / 100 : null) },
        { titulo: 'Fonte', valor: (l) => l.precos.venda?.fonte },
        { titulo: 'Lucro', valor: (l) => (l.lucro !== null ? Math.round(l.lucro * 100) / 100 : null) },
        { titulo: 'Lucro %', valor: (l) => (l.margem !== null ? Math.round(l.margem * 100) : null) },
        { titulo: 'Escalão', valor: (l) => (l.escalao ? NOME_ESCALAO[l.escalao] : 'não compensa') },
        { titulo: 'Comprar', valor: (l) => l.comprar },
        { titulo: 'Em stock', valor: (l) => l.precos.emStock },
        { titulo: 'Pagar no máximo (bom)', valor: (l) => l.precos.escaloes.find((x) => x.nome === 'bom')?.precoMax },
        { titulo: 'Compensa a partir de (% da loja)', valor: (l) => (l.descontoMinimo !== null ? Math.round(l.descontoMinimo * 100) : 'nunca') },
        { titulo: 'Nota', valor: (l) => l.motivo },
      ]),
    );
  }

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

      <label className="campo avaliar-campo">
        <span className="campo-rotulo">{promo ? 'Desconto extra (ex.: cartão)' : 'Desconto da loja'}</span>
        <span className="campo-unidade">
          <input inputMode="decimal" value={extra} onChange={(ev) => setExtra(ev.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
          <span className="mudo">% {promo ? 'sobre o preço de cada set' : 'sobre o preço (ou o PVP)'}</span>
        </span>
      </label>

      {sets.length > 0 && (
        <Cartao className="avaliar-resultado">
          <p className="avaliar-resumo">
            {aComprar.length ? (
              <>
                Comprar <strong>{plural(aComprar.length, 'set', 'sets')}</strong> ({plural(aComprar.reduce((a, l) => a + l.comprar, 0), 'unidade', 'unidades')}), <strong>{fmtEuro(total)}</strong> no total.
              </>
            ) : (
              <>Nenhum compensa{e > 0 ? `, mesmo com ${pct(e)}% extra` : ''}.</>
            )}
            {aProcurar && <span className="mudo"> A procurar no eBay…</span>}
          </p>
          <ul className="lista-simples avaliar-promo">
            {visiveis.map((l) => (
              <LinhaSet key={l.set} l={l} nome={catalogo(l.set)?.nome} />
            ))}
          </ul>
          {escondidos > 0 && (
            <button className="link" onClick={() => setVerTodos(true)}>
              Mostrar os outros {escondidos} (sem desconto na lista)
            </button>
          )}
          <div className="linha-botoes">
            <button className="btn" onClick={exportar}>Descarregar para Excel</button>
            {store.modo === 'supabase' && semEbay.length > 0 && (
              <button className="btn" onClick={acompanhar}>Acompanhar os {semEbay.length} sem eBay</button>
            )}
          </div>
          <p className="nota">
            PVP: o da loja, se vier na lista; senão o da LEGO Alemanha (Brickset). "Compensa a partir de" é o desconto da loja sobre o PVP necessário, já contando o extra. Os sets sem eBay nem
            vendas nossas usam o PVP × a % a que costumamos vender, que é conservador.
          </p>
        </Cartao>
      )}
    </>
  );
}

/** Uma linha: bolinha do escalão, nome, preço (na loja → final) → venda esperada, lucro e quantas comprar. */
function LinhaSet({ l, nome }: { l: LinhaPromo; nome?: string }) {
  const classe = l.comprar > 0 && l.escalao ? `avaliar-${l.escalao}` : 'avaliar-nao';
  const comExtra = l.precoLoja !== null && l.preco !== null && l.preco < l.precoLoja;
  return (
    <li className={`avaliar-escalao ${classe}`}>
      <span className="avaliar-bolinha" aria-hidden="true" />
      <span className="linha-principal">
        <span className="truncar">
          <strong>{l.set}</strong> {nome ?? ''}
        </span>
        <small className="mudo">
          {l.preco === null
            ? '—'
            : `${comExtra ? `${fmtEuro(l.precoLoja)} → ` : ''}${fmtEuro(l.preco)}${l.descontoAplicado ? ` (−${Math.round(l.descontoAplicado * 100)}%)` : ''}`}
          {l.precos.venda ? ` · vende ~${fmtEuro(l.precos.venda.preco)}` : ''}
          {l.margem !== null ? ` · ${Math.round(l.margem * 100)}%` : ''}
          {l.comprar > 0 && l.escalao ? ` · ${NOME_ESCALAO[l.escalao]}` : ''}
          {l.motivo ? ` · ${l.motivo}` : ''}
        </small>
      </span>
      <span className="avaliar-comprar">{l.comprar > 0 ? `comprar ${l.comprar}` : 'não'}</span>
    </li>
  );
}
