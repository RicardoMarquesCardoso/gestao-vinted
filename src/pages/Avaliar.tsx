// Ecrã "Vale a pena?": avaliar uma compra (por exemplo, um set em promoção) antes de comprar.
//
// Escreve-se o n.º do set e o preço (sem portes, a pedido do Ricardo). A app:
//   1. mostra o set (nome e imagem do catálogo, lançamento, retirada e PVP);
//   2. pergunta ao eBay os preços desse set NO MOMENTO (função ebay-set no Supabase, API oficial);
//   3. calcula com lib/avaliar.ts o preço de venda esperado, o tempo até vender, o lucro,
//      a rentabilidade por ano, o veredicto e o preço máximo a pagar;
//   4. dá links para ver o set na Vinted e nos vendidos do eBay (abertos por nós, à mão).
//
// "Acompanhar" guarda o set em definicoes.sets_avaliar: a tarefa diária passa a ir buscar o eBay
// dele, mesmo sem o termos em stock (útil enquanto a função ao vivo não tiver as chaves).

import { useEffect, useMemo, useState } from 'react';
import { useCatalogoSets } from '../components/catalogo';
import { Cartao, Dinheiro, ImagemReferencia, urlReferencia } from '../components/ui';
import { CHAVE_SETS_AVALIAR, ERRO_TIPICO, avaliarCompra, urlEbayVendidos, urlVinted } from '../lib/avaliar';
import { usoConta } from '../lib/calc';
import { fmtEuro, fmtMesAno, hoje, lerNumero } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { ebayAoVivo } from '../lib/supabase';
import type { RespostaEbay } from '../lib/supabase';
import { useDados } from '../state';

const SET_VALIDO = /^\d{3,7}(-\d+)?$/;
// Respostas do eBay já pedidas nesta sessão (não repetir o pedido ao voltar ao mesmo set)
const cacheEbay = new Map<string, Promise<RespostaEbay>>();

const NOME_FONTE = { vendas: 'As nossas vendas', ebay: 'eBay', pvp: 'PVP' } as const;
const TEXTO_VEREDICTO = { bom: 'Vale a pena', talvez: 'Talvez', mau: 'Não compensa' } as const;
const BASE_TEMPO = { set: 'pelas nossas vendas deste set', tema: 'pelas vendas do mesmo tema', geral: 'pela média de todas as vendas' } as const;

export function Avaliar() {
  const { dados, store, guardar, lista, aviso } = useDados();
  const mercado = useMercado();
  const procurarSet = useCatalogoSets();
  const [set, setSet] = useState('');
  const [preco, setPreco] = useState('');
  const [ebay, setEbay] = useState<{ set: string; r: RespostaEbay | 'a_procurar' } | null>(null);
  const h = hoje();
  const n = set.trim();
  const valido = SET_VALIDO.test(n);
  const oficial = valido ? procurarSet(n) : undefined;

  // Pedir o eBay ao vivo quando se pára de escrever o n.º (meio segundo), só com sessão real
  useEffect(() => {
    if (!valido || store.modo !== 'supabase') return;
    const t = setTimeout(() => {
      setEbay({ set: n, r: 'a_procurar' });
      let pedido = cacheEbay.get(n);
      if (!pedido) {
        pedido = ebayAoVivo(n).catch((e): RespostaEbay => ({ erro: 'ebay', detalhe: e instanceof Error ? e.message : String(e) }));
        cacheEbay.set(n, pedido);
      }
      void pedido.then((r) => setEbay((atual) => (atual?.set === n ? { set: n, r } : atual)));
    }, 500);
    return () => clearTimeout(t);
  }, [n, valido, store.modo]);

  const respostaEbay = ebay?.set === n && ebay.r !== 'a_procurar' ? ebay.r : null;
  const aoVivo: [number, number] | null = respostaEbay?.mediana ? [respostaEbay.mediana, respostaEbay.anuncios ?? 0] : null;
  const valorPreco = lerNumero(preco);

  const a = useMemo(
    () =>
      valido && valorPreco > 0
        ? avaliarCompra({ set: n, preco: valorPreco, tema: oficial?.tema, ebayAoVivo: aoVivo }, { dados, mercado, hoje: h })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valido, n, valorPreco, oficial?.tema, aoVivo?.[0], aoVivo?.[1], dados, mercado, h],
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

  return (
    <div className="pagina">
      <h1>Vale a pena?</h1>
      <p className="nota">Escreve o n.º do set e o preço da promoção para ver por quanto se vende e quanto rende.</p>

      <div className="grelha-form">
        <label className="campo">
          <span className="campo-rotulo">N.º do set</span>
          <input inputMode="numeric" value={set} onChange={(e) => setSet(e.target.value.replace(/[^\d-]/g, ''))} placeholder="ex.: 75321" />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Preço da promoção</span>
          <Dinheiro valor={preco} mudar={setPreco} />
        </label>
      </div>

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

      {a && (
        <Cartao className="avaliar-resultado">
          {a.veredicto ? (
            <>
              <p className={`avaliar-veredicto avaliar-${a.veredicto}`}>
                <span className="avaliar-bolinha" aria-hidden="true" />
                <strong>{TEXTO_VEREDICTO[a.veredicto]}</strong>
              </p>
              <p className="avaliar-motivo">{a.motivo}</p>
              <div className="kpis kpis-cartao">
                <div className="kpi kpi-destaque">
                  <span>Vende-se por</span>
                  <strong>~{fmtEuro(a.venda!.preco)}</strong>
                  <small>{a.tempo ? `em ~${a.tempo.dias} dias` : 'tempo desconhecido'}</small>
                </div>
                <div className="kpi">
                  <span>Lucro</span>
                  <strong className={a.lucro! < 0 ? 'negativo' : ''}>{fmtEuro(a.lucro)}</strong>
                  <small>{a.margem !== null ? `${Math.round(a.margem * 100)}% do custo` : ''}</small>
                </div>
                <div className="kpi">
                  <span>Rende por ano</span>
                  <strong>{a.rentabAnual !== null ? `${Math.round(a.rentabAnual * 100)}%` : '—'}</strong>
                  <small>pelo tempo até vender</small>
                </div>
                <div className="kpi">
                  <span>Pagar no máximo</span>
                  <strong>{fmtEuro(a.precoMaximo)}</strong>
                  <small>para ter o lucro das regras</small>
                </div>
              </div>
            </>
          ) : (
            <p className="mudo">{a.motivo}</p>
          )}

          {a.estimativas.length > 0 && (
            <>
              <h4 className="secao-form">De onde vem o preço (✓ = o que conta)</h4>
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
            {estadoEbay(store.modo, ebay?.set === n ? ebay.r : null)}
            {a.tempo && ` Tempo até vender ${BASE_TEMPO[a.tempo.base]} (${a.tempo.n}).`}
            {vagas !== null && ` Restam ${vagas} vendas este ano nas contas ativas.`}
          </p>
        </Cartao>
      )}

      {valido && !temosOSet && store.modo === 'supabase' && (
        <button className="btn" onClick={alternarAcompanhar}>
          {aAcompanhar ? '★ A acompanhar este set (deixar)' : '☆ Acompanhar este set'}
        </button>
      )}
    </div>
  );
}

/** Uma frase sobre o eBay ao vivo, para se saber se o valor do eBay é de agora ou do dia. */
function estadoEbay(modo: string, r: RespostaEbay | 'a_procurar' | null): string {
  if (modo !== 'supabase') return 'Modo demonstração: sem eBay ao vivo.';
  if (r === 'a_procurar') return 'A procurar no eBay…';
  if (!r) return '';
  if (r.erro === 'sem_chaves') return 'eBay ao vivo ainda sem chaves no Supabase: usa-se o eBay da tarefa diária, se existir.';
  if (r.erro) return `eBay ao vivo indisponível (${r.detalhe ?? r.erro}).`;
  if (!r.mediana) return `eBay agora: só ${r.anuncios ?? 0} anúncios de novos na Europa, poucos para contar.`;
  return `eBay agora: ${r.anuncios} anúncios de novos na Europa.`;
}
