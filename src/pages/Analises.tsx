import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { BarrasHorizontais, BarrasMensais } from '../components/Graficos';
import { Cartao } from '../components/ui';
import { PREDEFINICOES, estatisticas, idadeStock, intervaloDe, lotes } from '../lib/calc';
import type { Intervalo, Predefinicao } from '../lib/calc';
import { fmtEuro, fmtMes, fmtNum, hoje, plural } from '../lib/format';
import { useDados } from '../state';

export function Analises() {
  const { dados, nomeConta } = useDados();
  const abrir = useAbrir();
  const [periodo, setPeriodo] = useState<Predefinicao | 'datas'>('ano');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [conta, setConta] = useState('');
  const [texto, setTexto] = useState('');
  const [verTodosSets, setVerTodosSets] = useState(false);
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
  const sets = verTodosSets ? e.porSet : e.porSet.slice(0, 10);
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

      <Cartao titulo="Comparação por produto / set" acao={<span className="mudo">Agrupado pelo n.º do set ou, se não houver, pelo nome</span>}>
        {e.porSet.length === 0 ? (
          <p className="mudo">Sem produtos.</p>
        ) : (
          <div className="tabela-scroll">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Compradas</th>
                  <th className="num">Vendidas</th>
                  <th className="num">Custo médio</th>
                  <th className="num">Venda média</th>
                  <th className="num">Lucro médio</th>
                  <th className="num">Dias até vender</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((s) => (
                  <tr key={s.chave}>
                    <td>
                      <span className="truncar">{s.nome}</span>
                      {s.setNumero && <small className="mudo"> · {s.setNumero}</small>}
                    </td>
                    <td className="num">{s.compradas}</td>
                    <td className="num">{s.vendidas}</td>
                    <td className="num">{s.custoMedioCompra !== null ? fmtEuro(s.custoMedioCompra) : '—'}</td>
                    <td className="num">{s.precoMedioVenda !== null ? fmtEuro(s.precoMedioVenda) : '—'}</td>
                    <td className={`num ${s.lucroMedio !== null && s.lucroMedio < 0 ? 'negativo' : ''}`}>{s.lucroMedio !== null ? fmtEuro(s.lucroMedio) : '—'}</td>
                    <td className="num">{s.diasMedios ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {e.porSet.length > 10 && (
          <button className="link" onClick={() => setVerTodosSets((x) => !x)}>
            {verTodosSets ? 'Mostrar menos' : `Mostrar todos (${e.porSet.length})`}
          </button>
        )}
      </Cartao>

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
