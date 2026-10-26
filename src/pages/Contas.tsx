import { useMemo } from 'react';
import { useAbrir } from '../components/acoes';
import { BarraLimite, Cartao, Vazio, Valor } from '../components/ui';
import { liquidoVenda, lucroVenda, usoConta, vendaValida } from '../lib/calc';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import { PERIODOS } from '../lib/types';
import { useDados } from '../state';

export function Contas() {
  const { dados } = useDados();
  const abrir = useAbrir();
  const h = hoje();
  const usos = useMemo(() => dados.contas.map((c) => usoConta(c, dados, h)), [dados, h]);
  const produtoPorId = new Map(dados.produtos.map((p) => [p.id, p]));

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <h1>Contas da Vinted</h1>
        <button className="btn btn-primario" onClick={() => abrir({ tipo: 'conta' })}>+ Conta</button>
      </div>

      {usos.length === 0 ? (
        <Vazio
          titulo="Ainda não há contas"
          texto="Cria uma entrada para cada conta da Vinted que usam, com os respetivos limites."
          acao={<button className="btn btn-primario" onClick={() => abrir({ tipo: 'conta' })}>Criar conta</button>}
        />
      ) : (
        <div className="grelha-contas">
          {usos.map((u) => {
            const c = u.conta;
            const vendas = dados.vendas.filter((v) => v.conta_id === c.id).sort((a, b) => b.data_venda.localeCompare(a.data_venda));
            const validas = vendas.filter(vendaValida);
            const lucro = validas.reduce((a, v) => a + lucroVenda(v, produtoPorId.get(v.produto_id)), 0);
            // Atividade recente: vendas e anúncios, por data
            const atividade = [
              ...vendas.map((v) => ({ data: v.data_venda, texto: `Venda: ${produtoPorId.get(v.produto_id)?.nome ?? '—'}`, valor: liquidoVenda(v), estado: v.estado })),
              ...dados.produtos
                .filter((p) => p.conta_id === c.id && p.data_anuncio)
                .map((p) => ({ data: p.data_anuncio!, texto: `Anúncio: ${p.nome}`, valor: p.preco_anuncio, estado: null })),
            ]
              .sort((a, b) => b.data.localeCompare(a.data))
              .slice(0, 6);
            return (
              <Cartao
                key={c.id}
                className={`conta conta-${u.nivel} ${c.ativa ? '' : 'conta-inativa'}`}
                titulo={
                  <span>
                    {c.nome} {!c.ativa && <span className="chip">inativa</span>}
                    {c.utilizador_vinted && <small className="mudo"> @{c.utilizador_vinted}</small>}
                  </span>
                }
                acao={<button className="btn btn-pequeno" onClick={() => abrir({ tipo: 'conta', id: c.id })}>Editar</button>}
              >
                <p className="mudo conta-periodo">
                  Período: {PERIODOS.find((p) => p.valor === c.periodo)?.nome}
                  {u.periodo.inicio && ` (${fmtData(u.periodo.inicio)} a ${fmtData(u.periodo.fim)})`}
                </p>
                {u.limites.map((l) => (
                  <BarraLimite key={l.nome} l={l} />
                ))}
                <div className="conta-totais">
                  <span>{plural(validas.length, 'venda', 'vendas')} no total</span>
                  <span>lucro <Valor n={lucro} sinal /></span>
                </div>
                {c.notas && <p className="nota">{c.notas}</p>}
                {atividade.length > 0 && (
                  <details className="atividade">
                    <summary>Atividade recente</summary>
                    <ul>
                      {atividade.map((a, i) => (
                        <li key={i}>
                          <span className="mudo">{fmtData(a.data)}</span> <span className="truncar">{a.texto}</span>
                          <span>{a.valor !== null && a.valor !== undefined ? fmtEuro(a.valor) : ''}{a.estado === 'cancelada' ? ' (cancelada)' : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Cartao>
            );
          })}
        </div>
      )}
      <p className="nota">
        Os limites são definidos por vocês em cada conta e servem para acompanhar a atividade. Confirmem sempre as regras atuais da Vinted.
      </p>
    </div>
  );
}
