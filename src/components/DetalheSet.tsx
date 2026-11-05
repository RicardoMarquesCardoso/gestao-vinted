// Detalhe de um set no "Vale a pena?": nome, imagem e ciclo de vida, por quanto se vende, até que
// preço compensa comprar (por escalão, com as unidades), de onde vem o preço, e as nossas vendas
// desse set. Usado em dois sítios:
//   - "Um set" (pages/Avaliar.tsx), por baixo do campo do n.º do set;
//   - "Promoção da loja": tocar num set da lista abre esta informação numa janela (JanelaSet),
//     com o preço da promoção no topo.
//
// A secção "De onde vem o preço de venda" é curta: uma linha por fonte (nossas vendas, eBay com o
// preço típico e o n.º de anúncios, PVP), com ✓ na que conta. Sem notas técnicas (pedido do Ricardo).
//
// EBAY NO BOTÃO (pedido do Ricardo, nov/2026): "Procurar no eBay" pede o eBay deste set à
// função ebay-set do Supabase, que guarda o resultado em definicoes.ebay_pesquisas. Os sets do
// Continente também vão sendo procurados sozinhos (função ebay-rotacao). Só se pode
// voltar a procurar o mesmo set passados 7 dias (lib/avaliar.ts, proximaPesquisa). Abrir o
// detalhe não pesquisa nada.
//
// Tudo o resto é calculado na hora a partir do que a app já tem carregado (as nossas vendas, o
// mercado-sets.json do dia, o catálogo, as pesquisas guardadas); não se guarda mais nada.

import { useMemo, useState } from 'react';
import { useCatalogoSets } from './catalogo';
import { Cartao, ImagemReferencia, Janela, urlReferencia } from './ui';
import { descontoPara, pesquisaEbay, precosCompra, proximaPesquisa, urlEbayVendidos, urlVinted } from '../lib/avaliar';
import type { Escalao, NomeEscalao } from '../lib/avaliar';
import { diasEntre } from '../lib/calc';
import { fmtData, fmtEuro, fmtMesAno, hoje, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { regrasPlano } from '../lib/plano';
import { ebayAoVivo } from '../lib/supabase';
import { useDados } from '../state';

const NOME_FONTE = { vendas: 'As nossas vendas', ebay: 'eBay', pvp: 'PVP' } as const;
const NOME_ESCALAO: Record<NomeEscalao, string> = { rara: 'Oportunidade rara', otimo: 'Muito bom', bom: 'Bom' };

/** O preço de um set numa promoção, para mostrar no topo do detalhe (vem da linha da lista). */
export interface PrecoPromo {
  loja: string;
  preco: number | null;
  precoLoja: number | null;
  descontoAplicado: number | null;
  lucro: number | null;
  margem: number | null;
  comprar: number;
  escalao: NomeEscalao | null;
  descontoMinimo: number | null;
  motivo: string | null;
}

/** Janela com o detalhe de um set (aberta a partir da lista de uma promoção). */
export function JanelaSet({ set, promo, aoFechar }: { set: string; promo?: PrecoPromo; aoFechar(): void }) {
  return (
    <Janela titulo={`Set ${set}`} aoFechar={aoFechar}>
      <DetalheSet set={set} promo={promo} />
    </Janela>
  );
}

/** Toda a informação de um set (n.º já válido). promo: o preço numa promoção, se vier de uma lista. */
export function DetalheSet({ set: n, promo }: { set: string; promo?: PrecoPromo }) {
  const { dados, store, recarregar, aviso } = useDados();
  const mercado = useMercado();
  const procurarSet = useCatalogoSets();
  const h = hoje();
  const valido = true;
  const oficial = procurarSet(n);

  const a = useMemo(
    () => (valido ? precosCompra({ set: n, tema: oficial?.tema }, { dados, mercado, hoje: h }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valido, n, oficial?.tema, dados, mercado, h],
  );

  const base = n.replace(/-\d+$/, '');
  const defs = dados.definicoes as unknown as { chave: string; valor: unknown }[];
  const pesquisa = pesquisaEbay(defs, base);
  const proxima = proximaPesquisa(pesquisa, h);
  const [aProcurar, setAProcurar] = useState(false);

  // Procurar no eBay: uma pesquisa, guardada para os dois; não se repete antes de 7 dias
  async function procurarEbay() {
    if (proxima || aProcurar) return;
    setAProcurar(true);
    try {
      const r = await ebayAoVivo(base);
      if (r.erro === 'sem_chaves') return aviso('Faltam as chaves do eBay nos segredos das Edge Functions do Supabase.');
      if (r.erro) return aviso(`O eBay não respondeu (${r.detalhe ?? r.erro}). Tenta mais tarde.`);
      // A função ebay-set já guardou a pesquisa (definicoes.ebay_pesquisas); basta recarregar
      await recarregar();
      aviso(r.mediana ? `eBay: ~${Math.round(r.mediana)} € em ${r.anuncios} anúncios.` : `eBay: só ${plural(r.anuncios ?? 0, 'anúncio', 'anúncios')}, poucos para contar.`);
    } catch (e) {
      aviso(`O eBay não respondeu (${e instanceof Error ? e.message : String(e)}).`);
    } finally {
      setAProcurar(false);
    }
  }

  const m = a?.mercado;
  const ciclo = m
    ? [
        m.lancamento && `lançado ${fmtMesAno(m.lancamento)}`,
        m.retirada ? (m.retirado ? `retirado ${fmtMesAno(m.retirada)}` : `retirada prevista ${fmtMesAno(m.retirada)}`) : null,
        m.pvp && `PVP ${fmtEuro(m.pvp)}`,
      ].filter(Boolean).join(' · ')
    : '';
  // O escalão "bom" dá o preço acima do qual não compensa
  const bom = a?.escaloes.find((e) => e.nome === 'bom');

  return (
    <>
      {valido && (
        <div className="avaliar-set">
          <ImagemReferencia url={urlReferencia({ marca: 'LEGO', set_numero: base })} className="avaliar-img" />
          <div>
            <strong>{oficial?.nome ?? (procurarSet.carregado ? 'Set não encontrado no catálogo' : '…')}</strong>
            <small className="mudo">{[oficial?.tema, oficial?.ano, ciclo].filter(Boolean).join(' · ')}</small>
            <small className="avaliar-links">
              <a href={urlVinted(base)} target="_blank" rel="noreferrer">Ver na Vinted</a>
              <a href={urlEbayVendidos(base)} target="_blank" rel="noreferrer">Vendidos no eBay</a>
              <a href={`https://brickset.com/sets/${base}-1`} target="_blank" rel="noreferrer">Brickset</a>
            </small>
          </div>
        </div>
      )}

      {promo && <CartaoPromo promo={promo} />}

      {a && (
        <Cartao className="avaliar-resultado">
          {a.venda && bom ? (
            <>
              <p className="avaliar-resumo">
                Vende-se por <strong>~{fmtEuro(a.venda.preco)}</strong>
                {a.tempo ? <> em <strong>~{a.tempo.dias} dias</strong></> : null}.
                {a.emStock > 0 && <> Já têm <strong>{a.emStock}</strong> em stock ({fmtEuro(a.custoNoSet)}).</>}
              </p>
              <ul className="lista-simples avaliar-escaloes">
                {a.escaloes.map((e) => (
                  <LinhaEscalao key={e.nome} e={e} venda={a.venda!.preco} dias={a.tempo?.dias ?? null} pvp={m?.pvp ?? null} />
                ))}
              </ul>
              <p className="avaliar-motivo">
                Acima de <strong>{fmtEuro(bom.precoMax)}</strong> não compensa. Diversificar: 1 unidade por defeito, mais só com descontos grandes, e nunca mais de{' '}
                {Math.round(regrasPlano(dados.definicoes).maxCapitalPorSet * 100)}% do dinheiro em stock{a.capitalStock > 0 ? ` (${fmtEuro(a.capitalStock)})` : ''} num só set.
              </p>
            </>
          ) : (
            <p className="mudo">Sem dados para estimar o preço de venda deste set.</p>
          )}

          {a.estimativas.length > 0 && (
            <>
              <h4 className="secao-form">De onde vem o preço de venda</h4>
              <ul className="lista-simples avaliar-fontes">
                {a.estimativas.map((e, i) => (
                  <li key={e.fonte} className={i === 0 ? '' : 'mudo'}>
                    <span>
                      <strong>{NOME_FONTE[e.fonte]}</strong>
                      {i === 0 ? ' ✓' : ''} · {e.texto}
                    </span>
                    <span>{fmtEuro(e.preco)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {pesquisa && !pesquisa.mediana && (
            <p className="nota">eBay a {fmtData(pesquisa.data).slice(0, 5)}: só {plural(pesquisa.anuncios, 'anúncio', 'anúncios')} de novos, poucos para contar.</p>
          )}
        </Cartao>
      )}

      <NossasVendas set={base} />

      {valido && store.modo === 'supabase' && (
        <button className="btn" onClick={procurarEbay} disabled={!!proxima || aProcurar}>
          {aProcurar
            ? 'A procurar no eBay…'
            : proxima
              ? `eBay procurado a ${fmtData(pesquisa!.data).slice(0, 5)} · de novo a partir de ${fmtData(proxima).slice(0, 5)}`
              : 'Procurar no eBay'}
        </button>
      )}
    </>
  );
}

/**
 * Uma linha por escalão: "Muito bom · até 42 € · comprar 2", com o lucro e a rentabilidade por ano
 * a esse preço. As unidades vendem-se uma de cada vez, por isso com mais unidades o dinheiro fica
 * preso, em média, mais tempo: (n + 1) ÷ 2 vezes o tempo de uma venda.
 * À frente do preço, o desconto sobre o PVP preciso para lá chegar (pedido do Ricardo): "até 25 € (−38%)".
 */
function LinhaEscalao({ e, venda, dias, pvp }: { e: Escalao; venda: number; dias: number | null; pvp: number | null }) {
  const desc = descontoPara(pvp, e.precoMax);
  const lucro = venda - e.precoMax;
  const margem = e.precoMax > 0 ? lucro / e.precoMax : null;
  const diasMedios = dias !== null ? (Math.max(dias, 7) * (Math.max(e.comprar, 1) + 1)) / 2 : null;
  const rentab = margem !== null && diasMedios ? (margem * 365) / diasMedios : null;
  return (
    <li className={`avaliar-escalao avaliar-${e.nome}`}>
      <span className="avaliar-bolinha" aria-hidden="true" />
      <span className="linha-principal">
        <span>
          <strong>{NOME_ESCALAO[e.nome]}</strong> · até <strong>{fmtEuro(e.precoMax)}</strong>
          {desc !== null && <span className="mudo">{desc > 0 ? ` (−${Math.round(desc * 100)}%)` : ' (PVP)'}</span>}
        </span>
        <small className="mudo">
          lucro ≥ {fmtEuro(lucro)} ({Math.round(e.margem * 100)}%){rentab !== null ? ` · ~${Math.round(rentab * 100)}%/ano` : ''}
          {e.limite ? ` · ${e.limite}` : ''}
        </small>
      </span>
      <span className="avaliar-comprar">{e.comprar > 0 ? `comprar ${e.comprar}` : 'não comprar'}</span>
    </li>
  );
}

/** O preço na promoção e o que dá: "63,74 € (−25%) · lucro ~12 € (19%) · comprar 1". */
function CartaoPromo({ promo: p }: { promo: PrecoPromo }) {
  const compra = p.comprar > 0 && p.escalao;
  return (
    <Cartao className="avaliar-resultado">
      <div className={`avaliar-escalao avaliar-${compra ? p.escalao : 'nao'}`}>
        <span className="avaliar-bolinha" aria-hidden="true" />
        <span className="linha-principal">
          <span>
            {p.loja}:{' '}
            {p.preco === null ? (
              'sem preço na lista'
            ) : (
              <>
                {p.precoLoja !== null && p.precoLoja > p.preco ? `${fmtEuro(p.precoLoja)} → ` : ''}
                <strong>{fmtEuro(p.preco)}</strong>
                {p.descontoAplicado ? ` (−${Math.round(p.descontoAplicado * 100)}%)` : ''}
              </>
            )}
          </span>
          <small className="mudo">
            {p.lucro !== null && p.margem !== null ? `lucro ~${fmtEuro(p.lucro)} (${Math.round(p.margem * 100)}%)` : ''}
            {compra ? ` · ${NOME_ESCALAO[p.escalao!].toLowerCase()}` : ''}
            {' · '}
            {p.descontoMinimo !== null ? `compensa a partir de ${Math.round(p.descontoMinimo * 100)}%` : 'não compensa com nenhum desconto'}
            {p.motivo ? ` · ${p.motivo}` : ''}
          </small>
        </span>
        <span className="avaliar-comprar">{compra ? `comprar ${p.comprar}` : 'não'}</span>
      </div>
    </Cartao>
  );
}

/** As nossas vendas deste set (as mais recentes): data, preço e dias desde a compra. */
function NossasVendas({ set }: { set: string }) {
  const { dados } = useDados();
  const vendas = useMemo(() => {
    const produtos = new Map(dados.produtos.filter((p) => p.set_numero?.trim().replace(/-\d+$/, '') === set).map((p) => [p.id, p]));
    return dados.vendas
      .filter((v) => produtos.has(v.produto_id) && v.estado === 'concluida')
      .map((v) => {
        const p = produtos.get(v.produto_id)!;
        return { v, p, dias: p.data_compra ? diasEntre(p.data_compra, v.data_venda) : null };
      })
      .sort((a, b) => b.v.data_venda.localeCompare(a.v.data_venda));
  }, [dados.produtos, dados.vendas, set]);
  if (!vendas.length) return null;
  return (
    <Cartao titulo={`As nossas vendas deste set (${vendas.length})`}>
      <ul className="lista-simples">
        {vendas.slice(0, 6).map(({ v, p, dias }) => (
          <li key={v.id}>
            <span>
              {fmtData(v.data_venda)}
              <small className="mudo">
                {' '}· {p.condicao ?? 'novo'}
                {dias !== null ? ` · ${plural(dias, 'dia', 'dias')} em stock` : ''}
              </small>
            </span>
            <span>{fmtEuro(v.preco_venda / Math.max(v.quantidade, 1))}</span>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
