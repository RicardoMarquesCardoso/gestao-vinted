// Ecrã "Vale a pena?", com dois modos:
//   - "Um set": até que preço compensa comprar um set, e quantas unidades (este ficheiro);
//   - "Promoção da loja": X% de desconto sobre o PVP numa lista de sets (components/AvaliarPromocao.tsx).
//
// Um set: escreve-se só o n.º do set. A app:
//   1. mostra o set (nome e imagem do catálogo, lançamento, retirada e PVP);
//   2. pergunta ao eBay os preços desse set NO MOMENTO (função ebay-set no Supabase, API oficial);
//   3. calcula com lib/avaliar.ts (precosCompra) por quanto se vende, em quantos dias, e os
//      preços de compra por escalão (bom / muito bom / oportunidade rara) com as unidades a
//      comprar em cada um, a diversificar: 1 por defeito, mais só em oportunidades raras, e nunca
//      mais de 10% do dinheiro em stock num só set;
//   4. dá links para ver o set na Vinted e nos vendidos do eBay (abertos por nós, à mão).
//
// "Acompanhar" guarda o set em definicoes.sets_avaliar: a tarefa diária passa a ir buscar o eBay
// dele, mesmo sem o termos em stock (útil enquanto a função ao vivo não tiver as chaves).

import { useMemo, useState } from 'react';
import { AvaliarPromocao } from '../components/AvaliarPromocao';
import { useCatalogoSets } from '../components/catalogo';
import { precoEbay, useEbayVivo } from '../components/ebayVivo';
import type { EstadoEbay } from '../components/ebayVivo';
import { Cartao, ImagemReferencia, urlReferencia } from '../components/ui';
import { CHAVE_SETS_AVALIAR, ERRO_TIPICO, precosCompra, urlEbayVendidos, urlVinted } from '../lib/avaliar';
import type { Escalao, NomeEscalao } from '../lib/avaliar';
import { usoConta } from '../lib/calc';
import { fmtEuro, fmtMesAno, hoje, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { regrasPlano } from '../lib/plano';
import { useDados } from '../state';

const SET_VALIDO = /^\d{3,7}(-\d+)?$/;

const NOME_FONTE = { vendas: 'As nossas vendas', ebay: 'eBay', pvp: 'PVP' } as const;
const NOME_ESCALAO: Record<NomeEscalao, string> = { rara: 'Oportunidade rara', otimo: 'Muito bom', bom: 'Bom' };
const BASE_TEMPO = { set: 'pelas nossas vendas deste set', tema: 'pelas vendas do mesmo tema', geral: 'pela média de todas as vendas' } as const;

/** rota: "/avaliar", ou "/avaliar/promo/<id>" para abrir uma promoção recebida (vinda do Painel). */
export function Avaliar({ rota = '/avaliar' }: { rota?: string }) {
  const idPromo = rota.match(/^\/avaliar\/promo\/([\w-]+)/)?.[1];
  const [modo, setModo] = useState<'set' | 'promo'>(idPromo ? 'promo' : 'set');
  return (
    <div className="pagina">
      <h1>Vale a pena?</h1>
      <div className="segmentos" role="radiogroup" aria-label="Modo">
        <button role="radio" aria-checked={modo === 'set'} className={modo === 'set' ? 'ativo' : ''} onClick={() => setModo('set')}>Um set</button>
        <button role="radio" aria-checked={modo === 'promo'} className={modo === 'promo' ? 'ativo' : ''} onClick={() => setModo('promo')}>Promoção da loja</button>
      </div>
      {modo === 'set' ? <UmSet /> : <AvaliarPromocao idInicial={idPromo} />}
    </div>
  );
}

function UmSet() {
  const { dados, store, guardar, lista, aviso } = useDados();
  const mercado = useMercado();
  const procurarSet = useCatalogoSets();
  const [set, setSet] = useState('');
  const h = hoje();
  const n = set.trim();
  const valido = SET_VALIDO.test(n);
  const oficial = valido ? procurarSet(n) : undefined;

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
      <p className="nota">Escreve o n.º do set para ver até que preço compensa comprá-lo, e quantas unidades.</p>

      <label className="campo avaliar-campo">
        <span className="campo-rotulo">N.º do set</span>
        <input inputMode="numeric" value={set} onChange={(e) => setSet(e.target.value.replace(/[^\d-]/g, ''))} placeholder="ex.: 75321" />
      </label>

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
