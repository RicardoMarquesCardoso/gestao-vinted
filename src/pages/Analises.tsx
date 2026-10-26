import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { BarrasHorizontais, BarrasMensais } from '../components/Graficos';
import { Cartao } from '../components/ui';
import { PREDEFINICOES, estatisticas, intervaloDe } from '../lib/calc';
import type { Intervalo, Predefinicao } from '../lib/calc';
import { fmtData, fmtEuro, fmtNum, hoje, plural } from '../lib/format';
import { useDados } from '../state';

export function Analises() {
  const { dados, nomeConta } = useDados();
  const abrir = useAbrir();
  const [periodo, setPeriodo] = useState<Predefinicao | 'datas'>('ano');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [conta, setConta] = useState('');
  const [texto, setTexto] = useState('');
  const [verTodosSets, setVerTodosSets] = useState(false);
  const h = hoje();

  const intervalo: Intervalo = periodo === 'datas' ? { inicio: de || null, fim: ate || null } : intervaloDe(periodo, h);
  const e = useMemo(
    () => estatisticas(dados, { intervalo, pessoaId: pessoa || undefined, contaId: conta || undefined, texto: texto.trim() || undefined }, h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, intervalo.inicio, intervalo.fim, pessoa, conta, texto, h],
  );
  const sets = verTodosSets ? e.porSet : e.porSet.slice(0, 10);
  const vendidosRapido = [...e.tempos].sort((a, b) => a.dias - b.dias).slice(0, 5);
  const vendidosLento = e.tempos.slice(0, 5);

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
        <select value={pessoa} onChange={(ev) => setPessoa(ev.target.value)} aria-label="Pessoa">
          <option value="">Todas as pessoas</option>
          {dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
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
        <Cartao titulo="Lucro por conta">
          <BarrasHorizontais linhas={e.porConta.map((l) => ({ nome: l.nome, valor: l.lucro, detalhe: plural(l.vendas, 'venda', 'vendas') }))} />
        </Cartao>
        <Cartao titulo="Lucro por pessoa (quem vendeu)">
          <BarrasHorizontais linhas={e.porPessoa.map((l) => ({ nome: l.nome, valor: l.lucro, detalhe: plural(l.vendas, 'venda', 'vendas') }))} />
        </Cartao>
      </div>

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

      <div className="duas-colunas">
        <Cartao titulo="Venderam mais depressa">
          <ListaTempos itens={vendidosRapido} abrir={(id) => abrir({ tipo: 'detalhe', id })} />
        </Cartao>
        <Cartao titulo="Demoraram mais a vender">
          <ListaTempos itens={vendidosLento} abrir={(id) => abrir({ tipo: 'detalhe', id })} />
        </Cartao>
      </div>

      <Cartao titulo={`Anunciados sem venda (${e.parados.length})`}>
        {e.parados.length === 0 ? (
          <p className="mudo">Nenhum produto anunciado sem venda.</p>
        ) : (
          <ul className="lista-simples">
            {e.parados.map(({ produto, dias, desde }) => (
              <li key={produto.id}>
                <button className="linha-botao" onClick={() => abrir({ tipo: 'detalhe', id: produto.id })}>
                  <span className="linha-principal">
                    <span className="truncar">{produto.nome}</span>
                    <small className="mudo">desde {fmtData(desde)} · {nomeConta(produto.conta_id)}</small>
                  </span>
                  <span className={`dias ${dias > 60 ? 'dias-muitos' : ''}`}>{plural(dias, 'dia', 'dias')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
