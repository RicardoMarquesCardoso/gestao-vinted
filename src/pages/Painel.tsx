import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { BarrasMensais } from '../components/Graficos';
import { BarraLimite, Cartao, EtiquetaVenda, Vazio, Valor } from '../components/ui';
import { PREDEFINICOES, estatisticas, intervaloDe, liquidoVenda, lucroVenda, usoConta } from '../lib/calc';
import type { Predefinicao } from '../lib/calc';
import { fmtData, fmtEuro, fmtNum, hoje, plural } from '../lib/format';
import { navegar } from '../router';
import { useDados } from '../state';

export function Painel() {
  const { dados, nomeConta } = useDados();
  const abrir = useAbrir();
  const [periodo, setPeriodo] = useState<Predefinicao>('mes');
  const h = hoje();
  const e = useMemo(() => estatisticas(dados, { intervalo: intervaloDe(periodo, h) }, h), [dados, periodo, h]);
  const e12 = useMemo(() => estatisticas(dados, { intervalo: intervaloDe('tudo', h) }, h), [dados, h]);
  const alertas = useMemo(
    () => dados.contas.filter((c) => c.ativa).map((c) => usoConta(c, dados, h)).filter((u) => u.nivel === 'aviso' || u.nivel === 'excedido'),
    [dados, h],
  );
  const produtoPorId = new Map(dados.produtos.map((p) => [p.id, p]));
  const recentes = [...dados.vendas].sort((a, b) => b.data_venda.localeCompare(a.data_venda)).slice(0, 6);
  const ultimosMeses = e12.porMes.slice(-12).map((m) => ({ mes: m.mes, valor: m.lucro }));

  if (!dados.produtos.length && !dados.compras.length) {
    return (
      <div className="pagina">
        <h1>Painel</h1>
        <Vazio
          titulo="Ainda não há dados"
          texto="Começa por registar uma compra, ou carrega os dados de exemplo em Definições para ver como a app funciona."
          acao={
            <div className="botoes">
              <button className="btn btn-primario" onClick={() => abrir({ tipo: 'compra' })}>
                Registar compra
              </button>
              <button className="btn" onClick={() => navegar('/definicoes')}>
                Ir para Definições
              </button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <h1>Painel</h1>
        <select value={periodo} onChange={(ev) => setPeriodo(ev.target.value as Predefinicao)} aria-label="Período">
          {PREDEFINICOES.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="acoes-rapidas">
        <button className="btn btn-primario" onClick={() => abrir({ tipo: 'venda' })}>+ Venda</button>
        <button className="btn" onClick={() => abrir({ tipo: 'compra' })}>+ Compra</button>
        <button className="btn" onClick={() => abrir({ tipo: 'produto' })}>+ Produto</button>
      </div>

      <div className="kpis">
        <div className="kpi kpi-destaque">
          <span>Lucro</span>
          <strong className={e.lucro < 0 ? 'negativo' : ''}>{fmtEuro(e.lucro)}</strong>
          <small>{plural(e.vendasConcluidas, 'venda concluída', 'vendas concluídas')}{e.margem !== null ? ` · margem ${fmtNum(e.margem * 100)}%` : ''}</small>
        </div>
        <div className="kpi">
          <span>Recebido</span>
          <strong>{fmtEuro(e.recebido)}</strong>
          <small>{e.vendasPendentes ? `+ ${fmtEuro(e.aReceber)} pendente` : 'sem vendas pendentes'}</small>
        </div>
        <div className="kpi">
          <span>Gasto em compras</span>
          <strong>{fmtEuro(e.gasto)}</strong>
          <small>no período</small>
        </div>
        <div className="kpi">
          <span>Em inventário</span>
          <strong>{fmtEuro(e.inventarioCusto)}</strong>
          <small>{plural(e.inventarioUnidades, 'unidade', 'unidades')} por vender</small>
        </div>
      </div>

      {alertas.length > 0 && (
        <Cartao titulo="⚠️ Alertas de limites" className="cartao-alerta">
          {alertas.map((u) => (
            <div key={u.conta.id} className="alerta-conta">
              <button className="link" onClick={() => navegar('/contas')}>
                {u.conta.nome}
              </button>
              {u.limites
                .filter((l) => l.nivel === 'aviso' || l.nivel === 'excedido')
                .map((l) => (
                  <BarraLimite key={l.nome} l={l} />
                ))}
            </div>
          ))}
        </Cartao>
      )}

      <div className="duas-colunas">
        <Cartao titulo="Lucro por mês" acao={<button className="link" onClick={() => navegar('/analises')}>Análises →</button>}>
          <BarrasMensais dados={ultimosMeses} nome="Lucro por mês" />
        </Cartao>

        <Cartao titulo="Vendas recentes" acao={<button className="link" onClick={() => navegar('/vendas')}>Ver todas →</button>}>
          {recentes.length === 0 ? (
            <p className="mudo">Sem vendas.</p>
          ) : (
            <ul className="lista-simples">
              {recentes.map((v) => {
                const p = produtoPorId.get(v.produto_id);
                return (
                  <li key={v.id}>
                    <button className="linha-botao" onClick={() => abrir({ tipo: 'venda', id: v.id })}>
                      <span className="linha-principal">
                        <span className="truncar">{p?.nome ?? 'Produto apagado'}</span>
                        <small className="mudo">{fmtData(v.data_venda)} · {nomeConta(v.conta_id)}</small>
                      </span>
                      <span className="linha-direita">
                        <EtiquetaVenda estado={v.estado} />
                        <span className="coluna-valores">
                          {fmtEuro(liquidoVenda(v))}
                          <Valor n={lucroVenda(v, p)} sinal />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>

      <Cartao titulo="Anunciados há mais tempo" acao={<button className="link" onClick={() => navegar('/inventario')}>Inventário →</button>}>
        {e12.parados.length === 0 ? (
          <p className="mudo">Nenhum produto anunciado.</p>
        ) : (
          <ul className="lista-simples">
            {e12.parados.slice(0, 5).map(({ produto, dias }) => (
              <li key={produto.id}>
                <button className="linha-botao" onClick={() => abrir({ tipo: 'detalhe', id: produto.id })}>
                  <span className="linha-principal">
                    <span className="truncar">{produto.nome}</span>
                    <small className="mudo">{nomeConta(produto.conta_id)}{produto.preco_anuncio ? ` · ${fmtEuro(produto.preco_anuncio)}` : ''}</small>
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
