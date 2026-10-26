import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { Campo, Cartao, Dinheiro, Janela, Valor, useConfirmar } from '../components/ui';
import { calcularAcertos } from '../lib/acertos';
import type { LinhaVenda } from '../lib/acertos';
import { fmtData, fmtEuro, hoje, lerNumero } from '../lib/format';
import type { Acerto } from '../lib/types';
import { CONJUNTA } from '../lib/types';
import { useDados } from '../state';

export function Acertos() {
  const { dados, guardar, apagar, aviso, nomeParte } = useDados();
  const confirmar = useConfirmar();
  const abrir = useAbrir();
  const [manual, setManual] = useState(false);
  const [verDetalhe, setVerDetalhe] = useState(false);
  const r = useMemo(() => calcularAcertos(dados), [dados]);
  const partes = [...dados.pessoas.map((p) => p.id), CONJUNTA];
  const historico = [...dados.acertos].sort((a, b) => b.data.localeCompare(a.data) || (b.criado_em ?? '').localeCompare(a.criado_em ?? ''));

  async function marcarFeita(de: string, para: string, valor: number) {
    const ok = await confirmar({
      titulo: 'Transferência feita?',
      texto: `Confirmas que ${nomeParte(de)} já transferiu ${fmtEuro(valor)} para ${nomeParte(para)}?`,
      botao: 'Sim, está feita',
    });
    if (!ok) return;
    try {
      await guardar('acertos', [{ id: crypto.randomUUID(), data: hoje(), de, para, valor, notas: null } satisfies Acerto]);
      aviso('Transferência registada.');
    } catch (e) {
      aviso(`Erro: ${e instanceof Error ? e.message : e}`, 'erro');
    }
  }

  async function anular(a: Acerto) {
    const ok = await confirmar({
      titulo: 'Anular transferência',
      texto: `Anular o registo de ${fmtEuro(a.valor)} de ${nomeParte(a.de)} para ${nomeParte(a.para)} (${fmtData(a.data)})? O valor volta a aparecer por acertar.`,
      botao: 'Anular',
      perigo: true,
    });
    if (ok) await apagar('acertos', a.id).catch((e) => aviso(`Erro: ${e instanceof Error ? e.message : e}`, 'erro'));
  }

  const descreverObrigacoes = (l: LinhaVenda) =>
    l.obrigacoes.length
      ? l.obrigacoes
          .map((o) =>
            o.motivo === 'custo'
              ? `devolve ${fmtEuro(o.valor)} ${o.para === CONJUNTA ? 'à conta conjunta' : `a ${nomeParte(o.para)}`}`
              : o.valor >= 0
                ? `passa ${fmtEuro(o.valor)} de lucro para a conta conjunta`
                : `recebe ${fmtEuro(-o.valor)} da conta conjunta (prejuízo)`,
          )
          .join(' e ')
      : 'nada a acertar';

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <h1>Acertos</h1>
        <button className="btn" onClick={() => setManual(true)}>Registar transferência</button>
      </div>
      <p className="nota acertos-regra">
        Em cada venda concluída, quem recebeu o dinheiro devolve o custo a quem pagou e passa o lucro para a conta conjunta.
      </p>

      <Cartao titulo="Por acertar" className="cartao-acertar">
        {r.transferencias.length === 0 ? (
          <p className="tudo-acertado">✓ Está tudo acertado.</p>
        ) : (
          <ul className="transferencias">
            {r.transferencias.map((t) => (
              <li key={`${t.de}-${t.para}`}>
                <div className="transf-texto">
                  <span className="transf-partes">
                    <strong>{nomeParte(t.de)}</strong> <span className="seta">→</span> <strong>{nomeParte(t.para)}</strong>
                  </span>
                  <span className="transf-valor">{fmtEuro(t.valor)}</span>
                </div>
                <button className="btn btn-pequeno btn-primario" onClick={() => marcarFeita(t.de, t.para, t.valor)}>
                  Marcar como feita
                </button>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {r.problemas.length > 0 && (
        <Cartao titulo={`⚠️ ${r.problemas.length} venda(s) sem informação suficiente`} className="cartao-alerta">
          <ul className="lista-simples">
            {r.problemas.map((l) => (
              <li key={l.venda.id}>
                <button className="linha-botao" onClick={() => abrir({ tipo: 'venda', id: l.venda.id })}>
                  <span className="linha-principal">
                    <span className="truncar">{l.produto?.nome ?? 'Produto apagado'}</span>
                    <small className="mudo">{l.problema}</small>
                  </span>
                  <span className="mudo">Corrigir ›</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="nota">Dica: indica o titular de cada conta em Contas → Editar.</p>
        </Cartao>
      )}

      <div className="duas-colunas">
        <Cartao titulo="Saldos">
          <ul className="saldos">
            {partes.map((id) => {
              const s = r.saldos.get(id) ?? 0;
              return (
                <li key={id}>
                  <span>{nomeParte(id)}</span>
                  <span className={s > 0 ? 'positivo' : s < 0 ? 'negativo' : 'mudo'}>
                    {s > 0 ? `recebe ${fmtEuro(s)}` : s < 0 ? `paga ${fmtEuro(-s)}` : 'acertado'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Cartao>
        <Cartao titulo="Dinheiro em stock">
          <p className="nota">Custo dos produtos ainda por vender. É devolvido a quem pagou quando forem vendidos.</p>
          <ul className="saldos">
            {partes.map((id) => (
              <li key={id}>
                <span>{nomeParte(id)}</span>
                <span>{fmtEuro(r.emStock.get(id) ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      <Cartao
        titulo="Detalhe por venda"
        acao={<button className="link" onClick={() => setVerDetalhe((x) => !x)}>{verDetalhe ? 'Esconder' : `Ver ${r.linhas.length} vendas`}</button>}
      >
        {verDetalhe &&
          (r.linhas.length === 0 ? (
            <p className="mudo">Ainda sem vendas concluídas.</p>
          ) : (
            <ul className="lista-simples">
              {[...r.linhas]
                .sort((a, b) => b.venda.data_venda.localeCompare(a.venda.data_venda))
                .map((l) => (
                  <li key={l.venda.id}>
                    <button className="linha-botao" onClick={() => abrir({ tipo: 'venda', id: l.venda.id })}>
                      <span className="linha-principal">
                        <span className="truncar">{l.produto?.nome ?? 'Produto apagado'}</span>
                        <small className="mudo">
                          {fmtData(l.venda.data_venda)} · pagou {l.pagou.map((p) => nomeParte(p.id)).join(' + ') || '—'} · recebeu {nomeParte(l.recebeu)}
                        </small>
                        <small>{l.problema ?? (nomeParte(l.recebeu) + ' ' + descreverObrigacoes(l))}</small>
                      </span>
                      <span className="coluna-valores">
                        {fmtEuro(l.liquido)}
                        <Valor n={l.lucro} sinal />
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          ))}
      </Cartao>

      <Cartao titulo="Transferências feitas">
        {historico.length === 0 ? (
          <p className="mudo">Ainda nenhuma.</p>
        ) : (
          <ul className="lista-simples">
            {historico.map((a) => (
              <li key={a.id} className="linha-acerto">
                <span className="linha-principal">
                  <span>
                    {nomeParte(a.de)} → {nomeParte(a.para)}
                  </span>
                  <small className="mudo">
                    {fmtData(a.data)}
                    {a.notas ? ` · ${a.notas}` : ''}
                  </small>
                </span>
                <span className="linha-direita">
                  <strong>{fmtEuro(a.valor)}</strong>
                  <button className="btn-icone" onClick={() => anular(a)} aria-label="Anular transferência">✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {manual && <FormAcerto partes={partes} aoFechar={() => setManual(false)} />}
    </div>
  );
}

function FormAcerto({ partes, aoFechar }: { partes: string[]; aoFechar(): void }) {
  const { guardar, aviso, nomeParte } = useDados();
  const [de, setDe] = useState(partes[0] ?? '');
  const [para, setPara] = useState(CONJUNTA);
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje());
  const [notas, setNotas] = useState('');

  async function submeter() {
    const v = lerNumero(valor);
    if (!(v > 0)) return aviso('Indica o valor.', 'erro');
    if (de === para) return aviso('Escolhe partes diferentes.', 'erro');
    try {
      await guardar('acertos', [{ id: crypto.randomUUID(), data, de, para, valor: v, notas: notas.trim() || null } satisfies Acerto]);
      aviso('Transferência registada.');
      aoFechar();
    } catch (e) {
      aviso(`Erro: ${e instanceof Error ? e.message : e}`, 'erro');
    }
  }

  const seletor = (v: string, mudar: (x: string) => void) => (
    <select value={v} onChange={(e) => mudar(e.target.value)}>
      {partes.map((p) => (
        <option key={p} value={p}>{nomeParte(p)}</option>
      ))}
    </select>
  );

  return (
    <Janela
      titulo="Registar transferência"
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={submeter}>Guardar</button>
        </>
      }
    >
      <p className="nota">Para registar uma transferência que não está na lista "Por acertar", por exemplo um valor parcial.</p>
      <div className="grelha-form">
        <Campo rotulo="De">{seletor(de, setDe)}</Campo>
        <Campo rotulo="Para">{seletor(para, setPara)}</Campo>
        <Campo rotulo="Valor"><Dinheiro valor={valor} mudar={setValor} /></Campo>
        <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Notas" largo><input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ex.: MB WAY" /></Campo>
      </div>
    </Janela>
  );
}
