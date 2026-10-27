// Ecrã "Análises": lucro e gastos por período, conta, categoria; investimento (rentabilidade
// por ano, dinheiro parado, valor estimado do stock); tabela por set; lotes de compra;
// idade do stock; tempo até vender. Os cálculos estão em lib/calc.ts e lib/investimento.ts.

import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { BarrasHorizontais, BarrasMensais } from '../components/Graficos';
import { Cartao } from '../components/ui';
import { PREDEFINICOES, estatisticas, idadeStock, intervaloDe, lotes } from '../lib/calc';
import type { Intervalo, Predefinicao } from '../lib/calc';
import { fmtEuro, fmtMes, fmtNum, hoje, plural } from '../lib/format';
import { investimento, useMercado } from '../lib/investimento';
import type { LinhaInvestimento } from '../lib/investimento';
import { useDados } from '../state';

export function Analises() {
  const { dados, nomeConta } = useDados();
  const abrir = useAbrir();
  const [periodo, setPeriodo] = useState<Predefinicao | 'datas'>('ano');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [conta, setConta] = useState('');
  const [texto, setTexto] = useState('');
  const [verSub, setVerSub] = useState(false);
  const [verLotes, setVerLotes] = useState(false);
  const [rapidos, setRapidos] = useState(true);
  const h = hoje();

  const intervalo: Intervalo = periodo === 'datas' ? { inicio: de || null, fim: ate || null } : intervaloDe(periodo, h);
  const e = useMemo(
    () => estatisticas(dados, { intervalo, contaId: conta || undefined, texto: texto.trim() || undefined }, h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, intervalo.inicio, intervalo.fim, conta, texto, h],
  );
  const tempos = rapidos ? [...e.tempos].sort((a, b) => a.dias - b.dias).slice(0, 8) : e.tempos.slice(0, 8);
  const listaLotes = useMemo(() => lotes(dados), [dados]);
  const idade = useMemo(() => idadeStock(dados, h), [dados, h]);
  const subcats = verSub ? e.porSubcategoria : e.porSubcategoria.slice(0, 8);
  const pct = (x: number | null) => (x === null ? '—' : `${fmtNum(x * 100)}%`);

  return (
    <div className="pagina">
      <h1>Análises</h1>
      <div className="filtros">
        <select value={periodo} onChange={(ev) => setPeriodo(ev.target.value as Predefinicao | 'datas')} aria-label="Período">
          {PREDEFINICOES.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
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

      <div className="kpis">
        <div className="kpi kpi-destaque">
          <span>Lucro</span>
          <strong className={e.lucro < 0 ? 'negativo' : ''}>{fmtEuro(e.lucro)}</strong>
          <small>{e.margem !== null ? `margem ${fmtNum(e.margem * 100)}% sobre o custo` : 'sem vendas concluídas'}</small>
        </div>
        <div className="kpi"><span>Recebido</span><strong>{fmtEuro(e.recebido)}</strong><small>{plural(e.vendasConcluidas, 'venda', 'vendas')}</small></div>
        <div className="kpi"><span>Gasto</span><strong>{fmtEuro(e.gasto)}</strong><small>compras no período</small></div>
        <div className="kpi">
          <span>Tempo médio até vender</span>
          <strong>{e.diasMediosVenda !== null ? plural(Math.round(e.diasMediosVenda), 'dia', 'dias') : '—'}</strong>
          <small>da compra à venda</small>
        </div>
      </div>

      <ResumoInvestimentoCartao />

      <Cartao titulo="Lucro por mês">
        <BarrasMensais dados={e.porMes.map((m) => ({ mes: m.mes, valor: m.lucro }))} nome="Lucro por mês" />
      </Cartao>

      <div className="duas-colunas">
        <Cartao titulo="Lucro por categoria">
          <BarrasHorizontais linhas={e.porCategoria.map((l) => ({ nome: l.nome, valor: l.lucro, detalhe: `ROI ${pct(l.roi)} · ${plural(l.vendas, 'venda', 'vendas')}` }))} />
        </Cartao>
        <Cartao titulo="Lucro por conta">
          <BarrasHorizontais linhas={e.porConta.map((l) => ({ nome: l.nome, valor: l.lucro, detalhe: plural(l.vendas, 'venda', 'vendas') }))} />
        </Cartao>
      </div>

      <Cartao titulo="Subcategorias" acao={<span className="mudo">ROI = lucro ÷ custo</span>}>
        {e.porSubcategoria.length === 0 ? (
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
        {e.porSubcategoria.length > 8 && (
          <button className="link" onClick={() => setVerSub((x) => !x)}>
            {verSub ? 'Mostrar menos' : `Mostrar todas (${e.porSubcategoria.length})`}
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
          <div className="segmentos segmentos-mini" role="group">
            <button className={rapidos ? 'ativo' : ''} onClick={() => setRapidos(true)}>Mais rápidos</button>
            <button className={!rapidos ? 'ativo' : ''} onClick={() => setRapidos(false)}>Mais lentos</button>
          </div>
        }
      >
        <ListaTempos itens={tempos} abrir={(id) => abrir({ tipo: 'detalhe', id })} />
      </Cartao>
    </div>
  );
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
  const semBrickset = mercado !== null && !Object.keys(mercado.brickset).length;
  return (
    <Cartao titulo="Investimento" acao={<span className="mudo">Desde sempre</span>}>
      <div className="kpis kpis-cartao">
        <div className="kpi kpi-destaque">
          <span>Rentabilidade por ano</span>
          <strong className={r.rentabAnual !== null && r.rentabAnual < 0 ? 'negativo' : ''}>{pctAno(r.rentabAnual)}</strong>
          <small>lucro ÷ dinheiro preso, em {plural(r.vendasComTempo, 'venda', 'vendas')} com datas</small>
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
      <p className="nota">
        A rentabilidade por ano tem em conta o tempo: 20% de lucro em 2 meses vale mais do que 20% em 2 anos. O valor do stock usa os preços de venda da
        BrickLink (Europa, últimos 6 meses) e, sem isso, a vossa venda média do mesmo set.
        {semBrickset && ' Os dados da Brickset e da BrickLink ainda não estão ligados.'}
        {r.vendasSemTempo > 0 && ` ${plural(r.vendasSemTempo, 'venda não entra', 'vendas não entram')} na rentabilidade por falta de datas.`}
      </p>
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
      <p className="nota">Por ano = rentabilidade anualizada das vendas. * Valor estimado pela vossa venda média (sem dados da BrickLink).</p>
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
