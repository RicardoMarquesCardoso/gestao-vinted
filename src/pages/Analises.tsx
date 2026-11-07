// Ecrã "Análises". No topo, o Balanço (pedido do Ricardo): hoje (caixa, lucro feito, parado e a barra
// do investimento recuperado) e se vender tudo (lucro total e a mesma barra), desde sempre; logo a
// seguir as vendas por semana ou por mês, conforme o período (recebido com o lucro noutra cor + gastos
// a vermelho; "Sempre" por mês). Períodos sem "Este mês" e "Mês passado". Depois: destaques
// (lib/insights.ts: melhor/pior tema, preço final vs. anunciado, tempo anunciado, stock parado,
// vagas nas contas, maior aposta), lucro por mês, rentabilidade vs. tempo por tema (dispersão),
// investimento, por categoria/conta, subcategorias, lotes, idade do stock, por set e tempo até
// vender. Os cálculos estão em lib/calc.ts, lib/investimento.ts e lib/insights.ts.

import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { BarrasHorizontais, BarrasMensais, BarrasSemanas, Dispersao } from '../components/Graficos';
import { useContextoPlano } from '../components/planos';
import { lucroPotencial } from '../lib/plano';
import { desempenhoTemas, destaques } from '../lib/insights';
import type { Destaque } from '../lib/insights';
import { Cartao } from '../components/ui';
import { PREDEFINICOES, correspondeTexto, diasEntre, estatisticas, idadeStock, intervaloDe, lotes } from '../lib/calc';
import type { Intervalo, Predefinicao } from '../lib/calc';
import { fmtEuro, fmtMes, fmtNum, hoje, plural } from '../lib/format';
import { investimento, useMercado } from '../lib/investimento';
import type { LinhaInvestimento } from '../lib/investimento';
import { useDados } from '../state';
import type { Dados } from '../lib/types';

// Períodos do ecrã: sem "Este mês" e "Mês passado" (pedido do Ricardo).
const PERIODOS = PREDEFINICOES.filter((p) => p.valor !== 'mes' && p.valor !== 'mes_anterior');

export function Analises() {
  const { dados, nomeConta } = useDados();
  const abrir = useAbrir();
  const [periodo, setPeriodo] = useState<Predefinicao | 'datas'>('tudo'); // por defeito "Sempre" (pedido do Ricardo)
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [conta, setConta] = useState('');
  const [texto, setTexto] = useState('');
  const [verSub, setVerSub] = useState(false);
  const [verLotes, setVerLotes] = useState(false);
  const [rapidos, setRapidos] = useState(true);
  const h = hoje();

  const intervalo: Intervalo = periodo === 'datas' ? { inicio: de || null, fim: ate || null } : intervaloDe(periodo, h);
  // Sem início ("Sempre") ou mais de um ano: as vendas aparecem por mês; senão por semana.
  const porMes = !intervalo.inicio || diasEntre(intervalo.inicio, intervalo.fim ?? h) > 366;
  const e = useMemo(
    () => estatisticas(dados, { intervalo, contaId: conta || undefined, texto: texto.trim() || undefined }, h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, intervalo.inicio, intervalo.fim, conta, texto, h],
  );
  const lista = useMemo(() => destaques(dados, intervalo, h), [dados, intervalo.inicio, intervalo.fim, h]);
  // Lucro potencial do stock ao preço de referência (lib/plano.ts), com o mesmo filtro de conta/texto
  const ctxPlano = useContextoPlano();
  const potencial = useMemo(
    () => lucroPotencial(ctxPlano, (p) => (!conta || p.conta_id === conta) && correspondeTexto(p, texto.trim() || undefined)),
    [ctxPlano, conta, texto],
  );
  // Temas com pelo menos 2 vendas e dias conhecidos, para a dispersão
  const temas = useMemo(
    () => desempenhoTemas(dados, intervalo).filter((t) => t.vendas >= 2 && t.dias !== null && t.roi !== null).slice(0, 12),
    [dados, intervalo.inicio, intervalo.fim],
  );
  // Cada tabela tem o seu próprio período (pedido do Ricardo), com os mesmos filtros de conta e produto
  const filtroBase = { contaId: conta || undefined, texto: texto.trim() || undefined };
  const pCat = usePeriodoTabela(dados, filtroBase, h);
  const pConta = usePeriodoTabela(dados, filtroBase, h);
  const pSub = usePeriodoTabela(dados, filtroBase, h);
  const pTempo = usePeriodoTabela(dados, filtroBase, h);
  const tempos = rapidos ? [...pTempo.e.tempos].sort((a, b) => a.dias - b.dias).slice(0, 8) : pTempo.e.tempos.slice(0, 8);
  const listaLotes = useMemo(() => lotes(dados), [dados]);
  const idade = useMemo(() => idadeStock(dados, h), [dados, h]);
  const subcats = verSub ? pSub.e.porSubcategoria : pSub.e.porSubcategoria.slice(0, 8);
  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

  return (
    <div className="pagina">
      <h1>Análises</h1>
      <div className="filtros">
        <select value={periodo} onChange={(ev) => setPeriodo(ev.target.value as Predefinicao | 'datas')} aria-label="Período">
          {PERIODOS.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
          <option value="datas">Escolher datas…</option>
        </select>
        {periodo === 'datas' && (
          <>
            <input type="date" value={de} onChange={(ev) => setDe(ev.target.value)} aria-label="De" />
            <input type="date" value={ate} onChange={(ev) => setAte(ev.target.value)} aria-label="Até" />
          </>
        )}
        <select value={conta} onChange={(ev) => setConta(ev.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input type="search" className="filtro-procura" placeholder="Produto ou n.º de set" value={texto} onChange={(ev) => setTexto(ev.target.value)} />
      </div>

      {/* Balanço (pedido do Ricardo): hoje vs. se vender tudo, desde sempre, com a conta/produto do topo */}
      <Balanco dados={dados} filtro={{ contaId: conta || undefined, texto: texto.trim() || undefined }} potencial={potencial} h={h} />

      {/* Pedido do Ricardo: o eixo do tempo segue o período; "Sempre" (ou mais de um ano) por mês, o resto por semana */}
      {porMes ? (
        <Cartao titulo="Vendas por mês">
          <BarrasSemanas dados={e.porMes.map((m) => ({ ...m, semana: m.mes }))} rotulo={fmtMes} nome="Vendas por mês" />
        </Cartao>
      ) : (
        <Cartao titulo="Vendas por semana">
          <BarrasSemanas dados={e.porSemana} />
        </Cartao>
      )}

      {lista.length > 0 && (
        <div className="destaques">
          {lista.map((d) => <CartaoDestaque key={d.id} d={d} />)}
        </div>
      )}

      <Cartao titulo="Lucro por mês">
        <BarrasMensais dados={e.porMes.map((m) => ({ mes: m.mes, valor: m.lucro }))} nome="Lucro por mês" />
      </Cartao>

      <Cartao titulo="Rentabilidade vs. tempo, por tema">
        <Dispersao
          pontos={temas.map((t) => ({ nome: t.nome, x: t.dias!, y: t.roi!, peso: t.vendas, detalhe: `${plural(t.vendas, 'venda', 'vendas')} · lucro ${fmtEuro(t.lucro)}${t.rentabAnual !== null ? ` · ${pct(t.rentabAnual)}/ano` : ''}` }))}
          rotuloX="dias até vender"
          rotuloY="ROI"
          fmtX={(v) => String(Math.round(v))}
          fmtY={(v) => `${Math.round(v * 100)}%`}
        />
      </Cartao>

      <ResumoInvestimentoCartao />

      <div className="duas-colunas">
        <Cartao titulo="Lucro por categoria" acao={pCat.seletor}>
          <BarrasHorizontais linhas={pCat.e.porCategoria.map((l) => ({ nome: l.nome, valor: l.lucro, detalhe: `ROI ${pct(l.roi)} · ${plural(l.vendas, 'venda', 'vendas')}` }))} />
        </Cartao>
        <Cartao titulo="Lucro por conta" acao={pConta.seletor}>
          <BarrasHorizontais linhas={pConta.e.porConta.map((l) => ({ nome: l.nome, valor: l.lucro, detalhe: plural(l.vendas, 'venda', 'vendas') }))} />
        </Cartao>
      </div>

      <Cartao titulo="Subcategorias" acao={pSub.seletor}>
        {pSub.e.porSubcategoria.length === 0 ? (
          <p className="mudo">Sem vendas no período.</p>
        ) : (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Subcategoria</th>
                  <th className="num col-opcional">Vendas</th>
                  <th className="num">Lucro</th>
                  <th className="num">ROI</th>
                </tr>
              </thead>
              <tbody>
                {subcats.map((l) => (
                  <tr key={l.nome}>
                    <td>{l.nome}</td>
                    <td className="num col-opcional">{l.vendas}</td>
                    <td className={`num ${l.lucro < 0 ? 'negativo' : ''}`}>{fmtEuro(l.lucro)}</td>
                    <td className={`num ${l.roi !== null && l.roi < 0 ? 'negativo' : ''}`}>{pct(l.roi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pSub.e.porSubcategoria.length > 8 && (
          <button className="link" onClick={() => setVerSub((x) => !x)}>
            {verSub ? 'Mostrar menos' : `Mostrar todas (${pSub.e.porSubcategoria.length})`}
          </button>
        )}
      </Cartao>

      <Cartao titulo="Lotes de compra" acao={<span className="mudo">Por mês de compra, desde sempre</span>}>
        {listaLotes.length === 0 ? (
          <p className="mudo">Sem compras.</p>
        ) : (
          <ul className="lotes">
            {(verLotes ? listaLotes : listaLotes.slice(0, 6)).map((l) => {
              const vendido = l.unidades ? l.vendidas / l.unidades : 0;
              return (
                <li key={l.mes ?? 'sem'} className="lote">
                  <div className="lote-topo">
                    <strong>{l.mes ? fmtMes(l.mes) : 'Sem data'}</strong>
                    <span>
                      gasto {fmtEuro(l.gasto)} · lucro <span className={l.lucro < 0 ? 'negativo' : 'positivo'}>{fmtEuro(l.lucro)}</span>
                    </span>
                  </div>
                  <div className="limite-barra lote-barra" role="meter" aria-valuemin={0} aria-valuemax={l.unidades} aria-valuenow={l.vendidas} aria-label="Vendido">
                    <div style={{ width: `${Math.round(vendido * 100)}%` }} />
                  </div>
                  <div className="lote-rodape mudo">
                    <span>
                      {l.vendidas}/{l.unidades} vendidos ({Math.round(vendido * 100)}%)
                    </span>
                    <span>
                      {l.unidades - l.vendidas > 0
                        ? `${l.unidades - l.vendidas} por vender${l.porVenderCusto > 0 ? ` (${fmtEuro(l.porVenderCusto)})` : ''}`
                        : 'tudo vendido'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {listaLotes.length > 6 && (
          <button className="link" onClick={() => setVerLotes((x) => !x)}>
            {verLotes ? 'Mostrar menos' : `Mostrar todos (${listaLotes.length})`}
          </button>
        )}
      </Cartao>

      <Cartao titulo="Idade do stock" acao={<span className="mudo">Desde a compra</span>}>
        {idade.faixas.length === 0 ? (
          <p className="mudo">Nada por vender.</p>
        ) : (
          <>
            <BarrasHorizontais linhas={idade.faixas.map((f) => ({ nome: f.nome, valor: f.custo, detalhe: plural(f.unidades, 'unidade', 'unidades') }))} />
            <h4 className="secao-form">Há mais tempo por vender</h4>
            <ul className="lista-simples">
              {idade.antigos.filter((x) => x.dias !== null).slice(0, 6).map(({ produto, dias, unidades }) => (
                <li key={produto.id}>
                  <button className="linha-botao" onClick={() => abrir({ tipo: 'detalhe', id: produto.id })}>
                    <span className="linha-principal">
                      <span className="truncar">{produto.nome}</span>
                      <small className="mudo">
                        {produto.estado === 'anunciado' ? `anunciado em ${nomeConta(produto.conta_id)}` : 'por anunciar'}
                        {unidades > 1 ? ` · ${unidades} un.` : ''}
                      </small>
                    </span>
                    <span className={`dias ${dias! > 365 ? 'dias-muitos' : ''}`}>{dias! > 60 ? `${Math.floor(dias! / 30)} meses` : plural(dias!, 'dia', 'dias')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>

      <PorSet texto={texto} />

      <Cartao
        titulo="Tempo até vender"
        acao={
          <div className="acoes-tabela">
            {pTempo.seletor}
            <div className="segmentos segmentos-mini" role="group">
              <button className={rapidos ? 'ativo' : ''} onClick={() => setRapidos(true)}>Mais rápidos</button>
              <button className={!rapidos ? 'ativo' : ''} onClick={() => setRapidos(false)}>Mais lentos</button>
            </div>
          </div>
        }
      >
        <ListaTempos itens={tempos} abrir={(id) => abrir({ tipo: 'detalhe', id })} />
      </Cartao>
    </div>
  );
}

/**
 * Balanço geral (pedido do Ricardo, nov/2026): "quanto já lucrei, quanto tenho parado e quanto
 * posso vir a ter". Sempre desde o início (um balanço não faz sentido só num período), com os
 * filtros de conta e produto do topo.
 *   HOJE
 *     Caixa = recebido (líquido das vendas) − gasto (compras)       ex.: gastei 100, vendi por 90 → −10 €
 *     Lucro feito = recebido − custo do que se vendeu               ex.: 90 − 50 = +40 €
 *     Parado = custo do stock                                       ex.: 50 €
 *     Barra do investimento recuperado: recebido ÷ gasto            ex.: 90 ÷ 100 = 90%
 *   SE VENDER TUDO
 *     Lucro total = lucro feito + lucro do stock ao preço avaliado (lucroPotencial; as unidades sem
 *     preço contam pelo custo, sem lucro)                            ex.: 40 + 40 = +80 €
 *     A mesma barra, com o recebido + o valor do stock ao preço avaliado ÷ gasto
 *                                                                    ex.: (90 + 90) ÷ 100 = 180%
 * Quando os registos batem certo, a caixa + o valor do stock dá o lucro total.
 */
function Balanco(props: { dados: Dados; filtro: { contaId?: string; texto?: string }; potencial: { lucro: number; custo: number; valor: number }; h: string }) {
  const g = useMemo(
    () => estatisticas(props.dados, { intervalo: { inicio: null, fim: null }, ...props.filtro }, props.h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.dados, props.filtro.contaId, props.filtro.texto, props.h],
  );
  const caixa = g.recebido - g.gasto;
  const total = g.lucro + props.potencial.lucro;
  // Valor do stock se se vender tudo: o custo do stock + o lucro previsto (sem preço conta pelo custo).
  const valorStock = g.inventarioCusto + props.potencial.lucro;
  const sinal = (v: number) => `${v > 0 ? '+' : ''}${fmtEuro(v)}`;
  return (
    <section className="cartao balanco" aria-label="Balanço">
      <div className="balanco-titulo">Hoje</div>
      <div className="balanco-linha">
        <span>Caixa</span>
        <strong className={caixa < 0 ? 'negativo' : 'positivo'}>{sinal(caixa)}</strong>
      </div>
      <div className="balanco-linha">
        <span>Lucro feito</span>
        <strong className={g.lucro < 0 ? 'negativo' : 'positivo'}>{sinal(g.lucro)}</strong>
      </div>
      <div className="balanco-linha">
        <span>Parado em stock</span>
        <strong>{fmtEuro(g.inventarioCusto)}</strong>
      </div>
      <BarraRecuperado recebido={g.recebido} gasto={g.gasto} nome="recebido" />
      <hr />
      <div className="balanco-titulo">Se vender tudo</div>
      <div className="balanco-linha balanco-total">
        <span>Lucro total</span>
        <strong className={total < 0 ? 'negativo' : 'positivo'}>{sinal(total)}</strong>
      </div>
      <BarraRecuperado recebido={g.recebido + valorStock} gasto={g.gasto} nome="recebido + stock" />
    </section>
  );
}

/**
 * Barra do investimento recuperado (pedido do Ricardo): o que se gastou é 100%; a parte verde é o
 * que já voltou (recebido) e a cinzenta o que falta recuperar. Quando já se recebeu mais do que se
 * gastou, a barra mostra o gasto todo recuperado (verde) e o que se recebeu a mais (azul).
 *   ex.: gasto 100, recebido 79 → 79% | verde 79 € · por recuperar 21 €
 *   ex.: gasto 100, recebido 130 → 130% | verde 100 € · a mais 30 €
 */
function BarraRecuperado(props: { recebido: number; gasto: number; nome: string }) {
  const { recebido, gasto } = props;
  if (gasto <= 0) return null;
  const pct = (v: number) => `${Math.round((v / gasto) * 100)}%`;
  const falta = Math.max(gasto - recebido, 0);
  const aMais = Math.max(recebido - gasto, 0);
  const verde = Math.max(Math.min(recebido, gasto), 0);
  return (
    <>
      <div className="balanco-linha balanco-recuperado">
        <span>Investimento recuperado</span>
        <strong>{pct(recebido)}</strong>
      </div>
      <div className="balanco-barra" role="img" aria-label={`Gasto ${fmtEuro(gasto)}, ${props.nome} ${fmtEuro(recebido)}`}>
        <span className="balanco-recebido" style={{ flex: verde }} />
        {falta > 0 && <span className="balanco-falta" style={{ flex: falta }} />}
        {aMais > 0 && <span className="balanco-amais" style={{ flex: aMais }} />}
      </div>
      <div className="balanco-legenda">
        <span><i className="balanco-recebido" /> {props.nome} {fmtEuro(recebido)}</span>
        {falta > 0 && <span><i className="balanco-falta" /> por recuperar {fmtEuro(falta)} ({pct(falta)})</span>}
        {aMais > 0 && <span><i className="balanco-amais" /> a mais {fmtEuro(aMais)} (+{pct(aMais)})</span>}
      </div>
    </>
  );
}

/**
 * Período próprio de uma tabela (pedido do Ricardo): um seletor pequeno no canto do cartão, por
 * defeito "Sempre", e as estatísticas calculadas com esse período (e a conta/produto do topo).
 */
function usePeriodoTabela(dados: Dados, filtro: { contaId?: string; texto?: string }, h: string) {
  const [p, setP] = useState<Predefinicao>('tudo');
  const intervalo = intervaloDe(p, h);
  const e = useMemo(
    () => estatisticas(dados, { intervalo, ...filtro }, h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, intervalo.inicio, intervalo.fim, filtro.contaId, filtro.texto, h],
  );
  const seletor = (
    <select className="seletor-mini" value={p} onChange={(ev) => setP(ev.target.value as Predefinicao)} aria-label="Período da tabela">
      {PERIODOS.map((x) => <option key={x.valor} value={x.valor}>{x.nome}</option>)}
    </select>
  );
  return { e, seletor };
}

/** Lista de produtos com os dias que demoraram a vender. */
function ListaTempos(props: { itens: { produto: { id: string; nome: string }; dias: number }[]; abrir(id: string): void }) {
  if (!props.itens.length) return <p className="mudo">Sem vendas concluídas no período.</p>;
  return (
    <ul className="lista-simples">
      {props.itens.map(({ produto, dias }, i) => (
        <li key={`${produto.id}-${i}`}>
          <button className="linha-botao" onClick={() => props.abrir(produto.id)}>
            <span className="truncar">{produto.nome}</span>
            <span className="dias">{plural(dias, 'dia', 'dias')}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const pctAno = (x: number | null) => (x === null ? '—' : Math.abs(x) >= 10 ? `${x > 0 ? '>' : '<−'}999%` : `${fmtNum(x * 100)}%`);

/** Quanto rende o dinheiro e quanto tempo fica preso (desde sempre, inclui o que já foi vendido). */
function ResumoInvestimentoCartao() {
  const { dados } = useDados();
  const mercado = useMercado();
  const h = hoje();
  const r = useMemo(() => investimento(dados, mercado, h), [dados, mercado, h]);
  const ganho = r.custoComEstimativa > 0 ? r.valorEstimadoStock / r.custoComEstimativa - 1 : null;
  return (
    <Cartao titulo="Investimento" acao={<span className="mudo">Desde sempre</span>}>
      <div className="kpis kpis-cartao">
        <div className="kpi kpi-destaque">
          <span>Rentabilidade por ano</span>
          <strong className={r.rentabAnual !== null && r.rentabAnual < 0 ? 'negativo' : ''}>{pctAno(r.rentabAnual)}</strong>
          <small>{plural(r.vendasComTempo, 'venda', 'vendas')}</small>
        </div>
        <div className="kpi">
          <span>Dinheiro preso por venda</span>
          <strong>{r.diasMedioVenda !== null ? plural(r.diasMedioVenda, 'dia', 'dias') : '—'}</strong>
          <small>em média, da compra à venda · ROI {r.roi !== null ? `${fmtNum(r.roi * 100)}%` : '—'}</small>
        </div>
        <div className="kpi">
          <span>Dinheiro em stock</span>
          <strong>{fmtEuro(r.stockCusto)}</strong>
          <small>{plural(r.stockUnidades, 'unidade', 'unidades')}{r.stockDiasMedio !== null ? ` · há ${plural(r.stockDiasMedio, 'dia', 'dias')} em média` : ''}</small>
        </div>
        <div className="kpi">
          <span>Valor estimado do stock</span>
          <strong>{r.custoComEstimativa > 0 ? fmtEuro(r.valorEstimadoStock) : '—'}</strong>
          <small>
            {ganho !== null ? `${ganho >= 0 ? '+' : ''}${fmtNum(ganho * 100)}% sobre o custo` : 'sem dados'}
            {r.custoComEstimativa > 0 && r.custoComEstimativa < r.stockCusto - 0.01 ? ` · ${fmtNum((r.custoComEstimativa / r.stockCusto) * 100)}% do stock` : ''}
          </small>
        </div>
      </div>
    </Cartao>
  );
}

type OrdemSets = 'rentab' | 'parado' | 'lucro';

/** Tabela por set: o que já se vendeu, o que está parado e o estado do set no mercado. */
function PorSet({ texto }: { texto: string }) {
  const { dados } = useDados();
  const mercado = useMercado();
  const h = hoje();
  const [ordem, setOrdem] = useState<OrdemSets>('rentab');
  const [todos, setTodos] = useState(false);
  const r = useMemo(() => investimento(dados, mercado, h), [dados, mercado, h]);
  const t = texto.trim().toLowerCase();
  const linhas = r.linhas
    .filter((l) => !t || l.nome.toLowerCase().includes(t) || (l.setNumero ?? '').toLowerCase().includes(t))
    .sort((a, b) =>
      ordem === 'parado'
        ? b.custoStock - a.custoStock
        : ordem === 'lucro'
          ? b.lucro - a.lucro
          : (b.rentabAnual ?? -Infinity) - (a.rentabAnual ?? -Infinity) || b.lucro - a.lucro,
    );
  const visiveis = todos ? linhas : linhas.slice(0, 12);
  return (
    <Cartao
      titulo="Por set"
      acao={
        <div className="segmentos segmentos-mini" role="group" aria-label="Ordenar">
          <button className={ordem === 'rentab' ? 'ativo' : ''} onClick={() => setOrdem('rentab')}>Rentabilidade</button>
          <button className={ordem === 'parado' ? 'ativo' : ''} onClick={() => setOrdem('parado')}>Em stock</button>
          <button className={ordem === 'lucro' ? 'ativo' : ''} onClick={() => setOrdem('lucro')}>Lucro</button>
        </div>
      }
    >
      {linhas.length === 0 ? (
        <p className="mudo">Sem produtos.</p>
      ) : (
        <div className="tabela-scroll">
          <table className="tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Vendidas</th>
                <th className="num">Lucro</th>
                <th className="num">Por ano</th>
                <th className="num">Dias até vender</th>
                <th className="num">Em stock</th>
                <th className="num">Dias parado</th>
                <th className="num">Valor estimado</th>
                <th>Set</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.chave}>
                  <td>
                    <span className="truncar">{l.nome}</span>
                    {l.setNumero && <small className="mudo"> · {l.setNumero}</small>}
                  </td>
                  <td className="num">{l.vendidas || '—'}</td>
                  <td className={`num ${l.lucro < 0 ? 'negativo' : ''}`}>{l.vendidas ? fmtEuro(l.lucro) : '—'}</td>
                  <td className={`num ${l.rentabAnual !== null && l.rentabAnual < 0 ? 'negativo' : ''}`}>{pctAno(l.rentabAnual)}</td>
                  <td className="num">{l.diasMedioVenda ?? '—'}</td>
                  <td className="num">{l.emStock ? `${l.emStock} · ${fmtEuro(l.custoStock)}` : '—'}</td>
                  <td className="num">{l.emStock ? l.diasMedioStock ?? '—' : '—'}</td>
                  <td className="num" title={l.fonteValor === 'bricklink' ? 'BrickLink, sem IVA' : l.fonteValor === 'ebay' ? 'eBay Europa: mediana dos preços pedidos, com desconto' : l.fonteValor === 'tcgplayer' ? 'TCGplayer (EUA), convertido para euros' : l.fonteValor === 'vendas' ? 'Pela vossa venda média' : ''}>
                    {l.valorEstimadoStock !== null ? fmtEuro(l.valorEstimadoStock) : '—'}
                    {l.fonteValor === 'vendas' && <small className="mudo"> *</small>}
                  </td>
                  <td><EstadoSet l={l} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {linhas.length > 12 && (
        <button className="link" onClick={() => setTodos((x) => !x)}>
          {todos ? 'Mostrar menos' : `Mostrar todos (${linhas.length})`}
        </button>
      )}
    </Cartao>
  );
}

function EstadoSet({ l }: { l: LinhaInvestimento }) {
  const m = l.mercado;
  if (!m) return <span className="mudo">—</span>;
  const ano = (s: string | null) => (s ? s.slice(0, 4) : '');
  return (
    <span className="estado-set">
      {m.retirado === true ? <span className="chip chip-ok">retirado {ano(m.retirada)}</span> : m.retirado === false ? <span className="chip">à venda</span> : null}
      {m.lancamento && <small className="mudo"> desde {ano(m.lancamento)}</small>}
      {m.pvp ? <small className="mudo"> · PVP {fmtEuro(m.pvp)}</small> : null}
    </span>
  );
}

/** Número do topo com a variação face ao período anterior (▲ verde / ▼ vermelho). pontos: variação em pontos percentuais. */
/** Um cartão de destaque: título curto, número grande e uma linha de pormenor. */
function CartaoDestaque({ d }: { d: Destaque }) {
  return (
    <div className={`destaque destaque-${d.tom}`}>
      <span className="destaque-titulo">
        {d.tom === 'bom' ? '▲ ' : d.tom === 'atencao' ? '! ' : ''}
        {d.titulo}
      </span>
      <strong>{d.valor}</strong>
      <small className="mudo">{d.detalhe}</small>
    </div>
  );
}
