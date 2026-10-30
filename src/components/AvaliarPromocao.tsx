// "Promoção da loja" (dentro do ecrã Vale a pena?): uma loja vai ter X% em LEGO; que sets comprar?
//
// Escreve-se o desconto e cola-se a lista de sets: os números, ou o texto copiado da página da loja
// (a app encontra os n.º de set sozinha, com extrairSets). Nas lojas grandes (Fnac, Continente,
// Toys R Us…) o preço de partida é o PVP, por isso o preço na promoção = PVP × (1 − desconto).
// Para cada set, lib/avaliar.ts (avaliarPromocao) diz se compensa, em que escalão e quantas
// unidades, a diversificar (por set e por tema). Os que compensam aparecem primeiro.
//
// Cada set pode ter o seu preço ou o seu desconto: se a lista tiver o preço (ex.: "LEGO 75375 …
// 63,74 €") usa-se esse; senão, se tiver um desconto próprio (ex.: "-30%"), PVP × (1 − esse
// desconto); só os restantes usam o desconto geral escrito aqui.
//
// PROMOÇÕES RECEBIDAS: as listas enviadas por outra app (lib/promocoes.ts) aparecem no seletor
// "Promoções recebidas" e abrem-se já preenchidas (o Painel abre aqui com #/avaliar/promo/<id>).
//
// A app não abre o link da loja: ler páginas de outros sites é bloqueado pelo browser e, num
// servidor, seria recolha automática (termos de uso). Copiar o texto da página e colar aqui é
// igualmente rápido: selecionar tudo → copiar → colar.

import { useMemo, useState } from 'react';
import { CHAVE_SETS_AVALIAR, avaliarPromocao } from '../lib/avaliar';
import { promocoesRecebidas, setsDaPromocao } from '../lib/promocoes';
import type { Promocao } from '../lib/promocoes';
import type { LinhaPromo, NomeEscalao } from '../lib/avaliar';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtDataHora, fmtEuro, hoje, lerNumero, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { useDados } from '../state';
import { useCatalogoSets } from './catalogo';
import { precoEbay, useEbayVivo } from './ebayVivo';
import { Cartao } from './ui';

const NOME_ESCALAO: Record<NomeEscalao, string> = { rara: 'oportunidade rara', otimo: 'muito bom', bom: 'bom' };

export function AvaliarPromocao({ idInicial }: { idInicial?: string }) {
  const { dados, store, guardar, lista, aviso } = useDados();
  const mercado = useMercado();
  const catalogo = useCatalogoSets();
  const recebidas = promocoesRecebidas(dados.definicoes);
  const inicial = recebidas.find((p) => p.id === idInicial);
  // Promoção recebida carregada (a lista arrumada "itens" vem dela; o texto pode editar-se)
  const [promo, setPromo] = useState<Promocao | null>(inicial ?? null);
  const [desconto, setDesconto] = useState(inicial ? (inicial.desconto ? String(inicial.desconto).replace('.', ',') : '') : '25');
  const [texto, setTexto] = useState(inicial?.texto ?? '');
  const h = hoje();
  const d = Math.min(Math.max(lerNumero(desconto), 0), 90) / 100;

  function carregar(id: string) {
    const p = recebidas.find((x) => x.id === id) ?? null;
    setPromo(p);
    setTexto(p?.texto ?? '');
    setDesconto(p?.desconto ? String(p.desconto).replace('.', ',') : p ? '' : '25');
  }

  // Sets reconhecidos (os que a Brickset ou o catálogo conhecem) e o preço de cada um, se houver
  const { sets, precos, descontos } = useMemo(
    () => setsDaPromocao({ ...(promo ?? { id: '', recebida: '', loja: '' }), texto }, (n) => !!mercado?.brickset[n] || !!catalogo(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texto, promo, mercado, catalogo.carregado],
  );
  // Sets com preço ou desconto próprio na lista (não precisam do desconto geral)
  const comPreco = sets.filter((s) => precos[s] !== null || descontos[s] !== null).length;
  const ebay = useEbayVivo(sets, store.modo === 'supabase');
  const chaveEbay = sets.map((s) => precoEbay(ebay[s])?.join('/') ?? '').join(',');

  const linhas = useMemo(
    () =>
      sets.length
        ? avaliarPromocao(sets, d, { dados, mercado, hoje: h }, { tema: (n) => catalogo(n)?.tema, ebayAoVivo: (n) => precoEbay(ebay[n]), precos, descontos })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, precos, descontos, d, dados, mercado, h, chaveEbay, catalogo.carregado],
  );
  const aComprar = linhas.filter((l) => l.comprar > 0);
  const total = aComprar.reduce((a, l) => a + l.comprar * (l.preco ?? 0), 0);
  const aProcurar = sets.some((s) => ebay[s] === 'a_procurar');
  // Sets sem preço de venda do eBay nem nosso: acompanhá-los faz a tarefa diária ir buscar o eBay
  const acompanhados = lista(CHAVE_SETS_AVALIAR);
  const semEbay = linhas.filter((l) => l.precos.venda?.fonte !== 'vendas' && l.precos.venda?.fonte !== 'ebay' && !acompanhados.includes(l.set)).map((l) => l.set);

  async function acompanhar() {
    await guardar('definicoes', [{ chave: CHAVE_SETS_AVALIAR, valor: [...acompanhados, ...semEbay] }]);
    aviso(`${plural(semEbay.length, 'set', 'sets')} a acompanhar: a partir de amanhã a tarefa diária vai buscar o eBay.`);
  }

  function exportar() {
    descarregar(
      `promocao-${promo ? promo.loja.toLowerCase().replace(/\W+/g, '-') : `${Math.round(d * 100)}pct`}-${h}.csv`,
      paraCsv(linhas, [
        { titulo: 'Set', valor: (l) => l.set },
        { titulo: 'Nome', valor: (l) => catalogo(l.set)?.nome ?? '' },
        { titulo: 'Tema', valor: (l) => l.tema },
        { titulo: 'PVP', valor: (l) => l.pvp },
        { titulo: 'Preço na promoção', valor: (l) => l.preco },
        { titulo: 'Desconto sobre o PVP (%)', valor: (l) => (l.descontoAplicado !== null ? Math.round(l.descontoAplicado * 100) : null) },
        { titulo: 'Origem do preço', valor: (l) => ({ loja: 'preço da lista', desconto: 'desconto do set', pvp: 'desconto geral' })[l.origemPreco ?? 'x' as never] ?? '' },
        { titulo: 'Vende-se por', valor: (l) => (l.precos.venda ? Math.round(l.precos.venda.preco * 100) / 100 : null) },
        { titulo: 'Fonte', valor: (l) => l.precos.venda?.fonte },
        { titulo: 'Lucro', valor: (l) => (l.lucro !== null ? Math.round(l.lucro * 100) / 100 : null) },
        { titulo: 'Lucro %', valor: (l) => (l.margem !== null ? Math.round(l.margem * 100) : null) },
        { titulo: 'Escalão', valor: (l) => (l.escalao ? NOME_ESCALAO[l.escalao] : 'não compensa') },
        { titulo: 'Comprar', valor: (l) => l.comprar },
        { titulo: 'Em stock', valor: (l) => l.precos.emStock },
        { titulo: 'Pagar no máximo (bom)', valor: (l) => l.precos.escaloes.find((e) => e.nome === 'bom')?.precoMax },
        { titulo: 'Compensa a partir de (%)', valor: (l) => (l.descontoMinimo !== null ? Math.round(l.descontoMinimo * 100) : 'nunca') },
        { titulo: 'Nota', valor: (l) => l.motivo },
      ]),
    );
  }

  return (
    <>
      <p className="nota">
        Nas lojas grandes parte-se do PVP. Escreve o desconto e cola a lista de sets, ou o texto copiado da página da loja (selecionar tudo → copiar → colar): a app encontra os números sozinha.
        Se a lista tiver preços, usa-se o preço de cada set.
      </p>
      {recebidas.length > 0 && (
        <label className="campo">
          <span className="campo-rotulo">Promoções recebidas</span>
          <select value={promo?.id ?? ''} onChange={(e) => carregar(e.target.value)}>
            <option value="">— escrever à mão —</option>
            {recebidas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.loja} · {fmtDataHora(p.recebida)}
                {p.desconto ? ` · ${p.desconto}%` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="campo avaliar-campo">
        <span className="campo-rotulo">
          Desconto geral
          {comPreco === sets.length && sets.length ? ' (não é preciso: todos têm preço ou desconto na lista)' : comPreco ? ' (para os sets sem preço nem desconto na lista)' : ''}
        </span>
        <span className="campo-unidade">
          <input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value.replace(/[^\d.,]/g, ''))} />
          <span className="mudo">%</span>
        </span>
      </label>
      <label className="campo">
        <span className="campo-rotulo">Sets</span>
        <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'75375\n42151\n… ou cola o texto da página da loja'} />
      </label>

      {sets.length > 0 && (
        <Cartao className="avaliar-resultado">
          <p className="avaliar-resumo">
            {plural(sets.length, 'set reconhecido', 'sets reconhecidos')}{comPreco ? ` (${comPreco} com preço ou desconto próprio)` : ''}.{' '}
            {aComprar.length ? (
              <>
                Comprar <strong>{plural(aComprar.length, 'set', 'sets')}</strong> ({plural(aComprar.reduce((a, l) => a + l.comprar, 0), 'unidade', 'unidades')}), <strong>{fmtEuro(total)}</strong> no total.
              </>
            ) : (
              <>Nenhum compensa{comPreco < sets.length && d > 0 ? ` a ${Math.round(d * 100)}%` : ''}.</>
            )}
            {aProcurar && <span className="mudo"> A procurar no eBay…</span>}
          </p>
          <ul className="lista-simples avaliar-promo">
            {linhas.map((l) => (
              <LinhaSet key={l.set} l={l} nome={catalogo(l.set)?.nome} />
            ))}
          </ul>
          <div className="linha-botoes">
            <button className="btn" onClick={exportar}>Descarregar para Excel</button>
            {store.modo === 'supabase' && semEbay.length > 0 && (
              <button className="btn" onClick={acompanhar}>Acompanhar os {semEbay.length} sem eBay</button>
            )}
          </div>
          <p className="nota">
            PVP da LEGO Alemanha (Brickset), normalmente igual ao de Portugal. Os sets sem eBay nem vendas nossas usam o PVP × a % a que costumamos vender, que é conservador:
            raramente compensam. Acompanhá-los traz o eBay a partir de amanhã.
          </p>
        </Cartao>
      )}
    </>
  );
}

/** Uma linha: bolinha do escalão, nome, preço na promoção → venda esperada, lucro e quantas comprar. */
function LinhaSet({ l, nome }: { l: LinhaPromo; nome?: string }) {
  const classe = l.comprar > 0 && l.escalao ? `avaliar-${l.escalao}` : 'avaliar-nao';
  return (
    <li className={`avaliar-escalao ${classe}`}>
      <span className="avaliar-bolinha" aria-hidden="true" />
      <span className="linha-principal">
        <span className="truncar">
          <strong>{l.set}</strong> {nome ?? ''}
        </span>
        <small className="mudo">
          {l.preco !== null ? `${fmtEuro(l.preco)}${l.descontoAplicado !== null ? ` (−${Math.round(l.descontoAplicado * 100)}%)` : ''}` : '—'}
          {l.precos.venda ? ` → vende ~${fmtEuro(l.precos.venda.preco)}` : ''}
          {l.margem !== null ? ` · ${Math.round(l.margem * 100)}%` : ''}
          {l.comprar > 0 && l.escalao ? ` · ${NOME_ESCALAO[l.escalao]}` : ''}
          {l.motivo ? ` · ${l.motivo}` : ''}
        </small>
      </span>
      <span className="avaliar-comprar">{l.comprar > 0 ? `comprar ${l.comprar}` : 'não'}</span>
    </li>
  );
}
