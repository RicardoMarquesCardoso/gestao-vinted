// Detalhe de um set no "Vale a pena?": nome, imagem e ciclo de vida, por quanto se vende, até que
// preço compensa comprar (por escalão, com as unidades), de onde vem o preço, e as nossas vendas
// desse set. Usado em dois sítios:
//   - "Um set" (pages/Avaliar.tsx), por baixo do campo do n.º do set;
//   - "Promoção da loja": tocar num set da lista abre esta informação numa janela (JanelaSet),
//     com o preço da promoção no topo.
//
// NADA SE GUARDA: tudo é calculado na hora a partir do que a app já tem carregado (as nossas
// vendas, o mercado-sets.json do dia, o catálogo) e do eBay ao vivo, que fica só em memória até se
// fechar a app. Fechar a janela descarta tudo; não ocupa espaço no Supabase.

import { useMemo } from 'react';
import { useCatalogoSets } from './catalogo';
import { precoEbay, useEbayVivo } from './ebayVivo';
import type { EstadoEbay } from './ebayVivo';
import { Cartao, ImagemReferencia, Janela, urlReferencia } from './ui';
import { CHAVE_SETS_AVALIAR, ERRO_TIPICO, precosCompra, urlEbayVendidos, urlVinted } from '../lib/avaliar';
import type { Escalao, NomeEscalao } from '../lib/avaliar';
import { diasEntre, usoConta } from '../lib/calc';
import { fmtData, fmtEuro, fmtMesAno, hoje, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { regrasPlano } from '../lib/plano';
import { useDados } from '../state';

const NOME_FONTE = { vendas: 'As nossas vendas', ebay: 'eBay', pvp: 'PVP' } as const;
const NOME_ESCALAO: Record<NomeEscalao, string> = { rara: 'Oportunidade rara', otimo: 'Muito bom', bom: 'Bom' };
const BASE_TEMPO = { set: 'pelas nossas vendas deste set', tema: 'pelas vendas do mesmo tema', geral: 'pela média de todas as vendas' } as const;

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
  const { dados, store, guardar, lista, aviso } = useDados();
  const mercado = useMercado();
  const procurarSet = useCatalogoSets();
  const h = hoje();
  const valido = true;
  const oficial = procurarSet(n);

  // eBay na hora para este set (pedido meio segundo depois de se parar de escrever), só com sessão real
  const respostas = useEbayVivo(valido ? [n] : [], store.modo === 'supabase');
  const estadoN: EstadoEbay | undefined = valido ? respostas[n] : undefined;
  const aoVivo = precoEbay(estadoN);

  const a = useMemo(
    () => (valido ? precosCompra({ set: n, tema: oficial?.tema, ebayAoVivo: aoVivo }, { dados, mercado, hoje: h }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valido, n, oficial?.tema, aoVivo?.[0], aoVivo?.[1], dados, mercado, h],
  );

  // Vendas que ainda cabem este ano nas contas ativas (cada compra vai gastar uma)
  const vagas = useMemo(() => {
    let total = 0;
    let comLimite = false;
    for (const c of dados.contas.filter((x) => x.ativa)) {
      const l = usoConta(c, dados, h).limites.find((x) => x.nome.startsWith('Vendas'));
      if (l?.restante != null) {
        total += Math.max(l.restante, 0);
        comLimite = true;
      }
    }
    return comLimite ? total : null;
  }, [dados, h]);

  const acompanhados = lista(CHAVE_SETS_AVALIAR);
  const base = n.replace(/-\d+$/, '');
  const aAcompanhar = acompanhados.includes(base);
  const temosOSet = dados.produtos.some((p) => p.set_numero?.trim().replace(/-\d+$/, '') === base);

  async function alternarAcompanhar() {
    const novos = aAcompanhar ? acompanhados.filter((x) => x !== base) : [...acompanhados, base];
    await guardar('definicoes', [{ chave: CHAVE_SETS_AVALIAR, valor: novos }]);
    aviso(aAcompanhar ? 'Deixou de acompanhar este set.' : 'A acompanhar: a partir de amanhã a tarefa diária vai buscar o eBay deste set.');
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
                  <LinhaEscalao key={e.nome} e={e} venda={a.venda!.preco} dias={a.tempo?.dias ?? null} />
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
              <h4 className="secao-form">De onde vem o preço de venda (✓ = o que conta)</h4>
              <ul className="lista-simples avaliar-fontes">
                {a.estimativas.map((e, i) => (
                  <li key={e.fonte} className={i === 0 ? '' : 'mudo'}>
                    <span>
                      <strong>{NOME_FONTE[e.fonte]}</strong>
                      {i === 0 ? ' ✓' : ''} · {e.texto}
                      <small className="mudo"> · erro típico ~{Math.round(ERRO_TIPICO[e.fonte] * 100)}%</small>
                    </span>
                    <span>{fmtEuro(e.preco)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="nota">
            {estadoEbay(store.modo, estadoN ?? null)}
            {a.tempo && ` Tempo até vender ${BASE_TEMPO[a.tempo.base]} (${a.tempo.n}).`}
            {vagas !== null && ` Restam ${vagas} vendas este ano nas contas ativas.`}
          </p>
        </Cartao>
      )}

      <NossasVendas set={base} />

      {valido && !temosOSet && store.modo === 'supabase' && (
        <button className="btn" onClick={alternarAcompanhar}>
          {aAcompanhar ? '★ A acompanhar este set (deixar)' : '☆ Acompanhar este set'}
        </button>
      )}
    </>
  );
}

/**
 * Uma linha por escalão: "Muito bom · até 42 € · comprar 2", com o lucro e a rentabilidade por ano
 * a esse preço. As unidades vendem-se uma de cada vez, por isso com mais unidades o dinheiro fica
 * preso, em média, mais tempo: (n + 1) ÷ 2 vezes o tempo de uma venda.
 */
function LinhaEscalao({ e, venda, dias }: { e: Escalao; venda: number; dias: number | null }) {
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

/** Uma frase sobre o eBay ao vivo, para se saber se o valor do eBay é de agora ou do dia. */
function estadoEbay(modo: string, r: EstadoEbay | null): string {
  if (modo !== 'supabase') return 'Modo demonstração: sem eBay ao vivo.';
  if (r === 'a_procurar') return 'A procurar no eBay…';
  if (!r) return '';
  if (r.erro === 'sem_chaves') return 'eBay ao vivo ainda sem chaves no Supabase: usa-se o eBay da tarefa diária, se existir.';
  if (r.erro) return `eBay ao vivo indisponível (${r.detalhe ?? r.erro}).`;
  if (!r.mediana) return `eBay agora: só ${plural(r.anuncios ?? 0, 'anúncio', 'anúncios')} de novos na Europa, poucos para contar.`;
  return `eBay agora: ${r.anuncios} anúncios de novos na Europa.`;
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
