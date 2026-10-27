import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { BarraLimite, Campo, Cartao, Dinheiro, Janela, Vazio, Valor } from '../components/ui';
import { CHAVE_EXTERNAS, liquidoVenda, lucroVenda, usoConta, vendaValida, vendasExternas } from '../lib/calc';
import type { VendaExterna } from '../lib/calc';
import { fmtData, fmtEuro, hoje, lerNumero, plural } from '../lib/format';
import { PERIODOS } from '../lib/types';
import { useDados } from '../state';

export function Contas() {
  const { dados } = useDados();
  const abrir = useAbrir();
  const h = hoje();
  const usos = useMemo(() => dados.contas.map((c) => usoConta(c, dados, h)), [dados, h]);
  const produtoPorId = new Map(dados.produtos.map((p) => [p.id, p]));
  const [externaPara, setExternaPara] = useState<string | null>(null);

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
                <div className="conta-externas">
                  {u.externas > 0 && (
                    <span className="mudo">
                      Inclui {plural(u.externas, 'venda', 'vendas')} fora da app ({fmtEuro(u.externasValor)})
                    </span>
                  )}
                  <button className="link" onClick={() => setExternaPara(c.id)}>
                    + Venda fora da app
                  </button>
                </div>
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
      {externaPara && <FormExterna contaId={externaPara} aoFechar={() => setExternaPara(null)} />}
    </div>
  );
}

/** Regista uma venda que não é do negócio mas conta para os limites da conta. */
function FormExterna({ contaId, aoFechar }: { contaId: string; aoFechar(): void }) {
  const { dados, guardar, aviso, nomeConta } = useDados();
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje());
  async function submeter() {
    const v = lerNumero(valor);
    if (!(v > 0)) return aviso('Indica o valor.', 'erro');
    const nova: VendaExterna = { conta_id: contaId, data, valor: v };
    await guardar('definicoes', [{ chave: CHAVE_EXTERNAS, valor: [...vendasExternas(dados), nova] as never }]);
    aviso('Venda registada. Conta só para os limites.');
    aoFechar();
  }
  return (
    <Janela
      titulo={`Venda fora da app · ${nomeConta(contaId)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={submeter}>Guardar</button>
        </>
      }
    >
      <p className="nota">Para vendas nesta conta que não são do negócio. Contam para os limites, mas não aparecem nos produtos, no lucro nem nos acertos.</p>
      <div className="grelha-form">
        <Campo rotulo="Valor"><Dinheiro valor={valor} mudar={setValor} /></Campo>
        <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      </div>
    </Janela>
  );
}
