import { useEffect, useState } from 'react';
import { Cartao, useConfirmar } from '../components/ui';
import { descarregar } from '../lib/csv';
import { fmtDataHora, hoje } from '../lib/format';
import { dadosExemplo, eExemplo } from '../lib/sample';
import type { TabelaDados } from '../lib/store';
import type { Historico } from '../lib/types';
import { LISTAS_PADRAO } from '../lib/types';
import { useDados } from '../state';
import { navegar } from '../router';
import { useCasosNomes } from './ReverNomes';
import { CHAVE_MODELO_ANUNCIO, MODELO_PADRAO, modeloAnuncio } from '../lib/anuncio';
import type { ModeloAnuncio } from '../lib/anuncio';

const NOMES_TABELA: Record<string, string> = {
  pessoas: 'Pessoa', contas: 'Conta', compras: 'Compra', produtos: 'Produto', vendas: 'Venda', definicoes: 'Lista',
};
const NOMES_ACAO = { criar: 'criou', editar: 'editou', apagar: 'apagou' };

export function Definicoes(props: { aoSair(): void }) {
  const { dados, guardar, apagar, store, aviso, lista, recarregar } = useDados();
  const confirmar = useConfirmar();
  const [novaPessoa, setNovaPessoa] = useState('');
  const [aTrabalhar, setATrabalhar] = useState(false);

  async function adicionarPessoa() {
    const nome = novaPessoa.trim();
    if (!nome) return;
    await guardar('pessoas', [{ id: crypto.randomUUID(), nome }]);
    setNovaPessoa('');
  }

  async function renomearPessoa(id: string, nome: string) {
    if (nome.trim()) await guardar('pessoas', [{ id, nome: nome.trim() }]);
  }

  async function apagarPessoa(id: string, nome: string) {
    const usada = dados.compras.some((c) => c.pessoa_id === id) || dados.vendas.some((v) => v.pessoa_id === id) || dados.produtos.some((p) => p.pessoa_id === id);
    const ok = await confirmar({
      titulo: 'Remover pessoa',
      texto: usada ? `${nome} tem compras ou vendas associadas, que vão ficar sem pessoa indicada. Remover mesmo assim?` : `Remover ${nome}?`,
      botao: 'Remover',
      perigo: true,
    });
    if (ok) await apagar('pessoas', id);
  }

  async function carregarExemplo() {
    const ok = await confirmar({
      titulo: 'Carregar dados de exemplo',
      texto: 'Vão ser acrescentadas 2 pessoas, 2 contas, compras, produtos e vendas de exemplo. Os teus dados não são alterados, e podes apagar os exemplos depois, de uma vez.',
      botao: 'Carregar',
    });
    if (!ok) return;
    setATrabalhar(true);
    try {
      const ex = dadosExemplo(hoje());
      const ordem: TabelaDados[] = ['pessoas', 'contas', 'compras', 'produtos', 'vendas'];
      for (const t of ordem) await guardar(t, ex[t]);
      const emFalta = ex.definicoes.filter((d) => !dados.definicoes.some((x) => x.chave === d.chave));
      await guardar('definicoes', emFalta);
      aviso('Dados de exemplo carregados.');
    } catch (e) {
      aviso(`Erro: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setATrabalhar(false);
    }
  }

  async function apagarExemplo() {
    const ok = await confirmar({
      titulo: 'Apagar dados de exemplo',
      texto: 'Vão ser apagados só os registos de exemplo. Os registos que criaste ficam intactos.',
      botao: 'Apagar exemplos',
      perigo: true,
    });
    if (!ok) return;
    setATrabalhar(true);
    try {
      const ordem: TabelaDados[] = ['vendas', 'produtos', 'compras', 'contas', 'pessoas'];
      for (const t of ordem) for (const r of (dados[t] as { id: string }[]).filter(eExemplo)) await apagar(t, r.id);
      aviso('Dados de exemplo apagados.');
      await recarregar();
    } catch (e) {
      aviso(`Erro: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setATrabalhar(false);
    }
  }

  const temExemplos = [dados.pessoas, dados.contas, dados.compras, dados.produtos, dados.vendas].some((l) => (l as { id: string }[]).some(eExemplo));

  return (
    <div className="pagina">
      <h1>Definições</h1>

      <Cartao titulo="Sessão">
        <p>
          {store.modo === 'demo' ? (
            <>Estás no <strong>modo de demonstração</strong>: os dados ficam só neste browser e não são partilhados.</>
          ) : (
            <>Sessão iniciada como <strong>{store.utilizador}</strong>. Os dados estão sincronizados no Supabase.</>
          )}
        </p>
        <button className="btn" onClick={props.aoSair}>{store.modo === 'demo' ? 'Sair do modo de demonstração' : 'Terminar sessão'}</button>
      </Cartao>

      <Cartao titulo="Instalar no telemóvel">
        <p><strong>iPhone (Safari):</strong> botão Partilhar → "Adicionar ao ecrã principal".</p>
        <p><strong>Android (Chrome):</strong> menu ⋮ → "Instalar app" ou "Adicionar ao ecrã principal".</p>
      </Cartao>

      <CartaoReverNomes />

      <CartaoTextoAnuncios />

      <Cartao titulo="Pessoas">
        <p className="nota">Quem paga as compras e quem faz as vendas.</p>
        <ul className="lista-edicao">
          {dados.pessoas.map((p) => (
            <li key={p.id}>
              <input defaultValue={p.nome} onBlur={(e) => e.target.value !== p.nome && renomearPessoa(p.id, e.target.value)} aria-label="Nome" />
              <button className="btn-icone" onClick={() => apagarPessoa(p.id, p.nome)} aria-label={`Remover ${p.nome}`}>✕</button>
            </li>
          ))}
        </ul>
        <div className="linha-adicionar">
          <input value={novaPessoa} onChange={(e) => setNovaPessoa(e.target.value)} placeholder="Nome" onKeyDown={(e) => e.key === 'Enter' && adicionarPessoa()} />
          <button className="btn" onClick={adicionarPessoa}>Adicionar</button>
        </div>
      </Cartao>

      <Cartao titulo="Exportar dados">
        <p className="nota">
          Em Inventário, Compras e Vendas há um botão "Exportar CSV" que exporta a lista com os filtros aplicados (abre no Excel). Aqui podes
          descarregar uma cópia de segurança completa.
        </p>
        <button className="btn" onClick={() => descarregar(`vinteduo-copia-${hoje()}.json`, JSON.stringify(dados, null, 2), 'application/json')}>
          Descarregar cópia de segurança (JSON)
        </button>
      </Cartao>

      <details className="mais-detalhes avancado">
        <summary>Avançado</summary>
      <Cartao titulo="Listas e categorias">
        <p className="nota">Sugestões que aparecem nos formulários. Um valor por linha. Os limites de cada conta definem-se em Contas.</p>
        <div className="grelha-listas">
          {Object.entries(LISTAS_PADRAO).map(([chave, l]) => (
            <EditorLista key={chave} nome={l.nome} valores={lista(chave)} guardar={(valor) => guardar('definicoes', [{ chave, valor }])} />
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Dados de exemplo">
        <p className="nota">Para experimentar a app com compras, vendas e contas fictícias.</p>
        <div className="botoes">
          <button className="btn" onClick={carregarExemplo} disabled={aTrabalhar}>Carregar dados de exemplo</button>
          {temExemplos && (
            <button className="btn btn-perigo-texto" onClick={apagarExemplo} disabled={aTrabalhar}>Apagar dados de exemplo</button>
          )}
        </div>
      </Cartao>

      <HistoricoAlteracoes />
      </details>
    </div>
  );
}

function EditorLista(props: { nome: string; valores: string[]; guardar(v: string[]): Promise<void> }) {
  const [texto, setTexto] = useState(props.valores.join('\n'));
  useEffect(() => setTexto(props.valores.join('\n')), [props.valores]);
  const alterado = texto !== props.valores.join('\n');
  return (
    <label className="campo">
      <span className="campo-rotulo">{props.nome}</span>
      <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
      {alterado && (
        <button
          className="btn btn-pequeno btn-primario"
          onClick={(e) => {
            e.preventDefault();
            void props.guardar([...new Set(texto.split('\n').map((s) => s.trim()).filter(Boolean))]);
          }}
        >
          Guardar
        </button>
      )}
    </label>
  );
}

function HistoricoAlteracoes() {
  const { store, dados, ultimaAtualizacao } = useDados();
  const [itens, setItens] = useState<Historico[] | null>(null);
  const [mostrar, setMostrar] = useState(30);
  useEffect(() => {
    store.historico().then(setItens).catch(() => setItens([]));
  }, [store, ultimaAtualizacao, dados]);

  const descrever = (h: Historico) => {
    const registo = (h.depois ?? h.antes) as Record<string, unknown> | null;
    if (h.tabela === 'vendas') {
      const pid = (registo?.produto_id as string) ?? dados.vendas.find((v) => v.id === h.registo_id)?.produto_id;
      return `de ${dados.produtos.find((p) => p.id === pid)?.nome ?? 'produto'}`;
    }
    if (h.tabela === 'compras') {
      const c = dados.compras.find((x) => x.id === h.registo_id);
      const data = (registo?.data as string) ?? c?.data;
      return data ? `de ${data.split('-').reverse().join('/')}` : '';
    }
    if (h.tabela === 'definicoes') return h.registo_id;
    const nomeAtual =
      (dados.produtos.find((p) => p.id === h.registo_id)?.nome ?? dados.contas.find((c) => c.id === h.registo_id)?.nome ?? dados.pessoas.find((p) => p.id === h.registo_id)?.nome) ||
      (registo && (registo.nome as string)) ||
      '';
    return nomeAtual;
  };

  return (
    <Cartao titulo="Histórico de alterações">
      {itens === null ? (
        <p className="mudo">A carregar…</p>
      ) : itens.length === 0 ? (
        <p className="mudo">Ainda sem alterações registadas.</p>
      ) : (
        <>
          <ul className="historico">
            {itens.slice(0, mostrar).map((h) => (
              <li key={h.id}>
                <details>
                  <summary>
                    <span className="mudo">{fmtDataHora(h.quando)}</span> · <strong>{h.utilizador ?? '—'}</strong> {NOMES_ACAO[h.acao]}{' '}
                    {(NOMES_TABELA[h.tabela] ?? h.tabela).toLowerCase()} {descrever(h)}
                  </summary>
                  <div className="historico-diff">
                    {h.acao === 'editar' &&
                      Object.keys((h.depois as object) ?? {}).map((k) => (
                        <div key={k}>
                          <code>{k}</code>: {formatar((h.antes as Record<string, unknown>)?.[k])} → {formatar((h.depois as Record<string, unknown>)?.[k])}
                        </div>
                      ))}
                    {h.acao !== 'editar' && <pre>{JSON.stringify(h.depois ?? h.antes, null, 1)}</pre>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {itens.length > mostrar && (
            <button className="link" onClick={() => setMostrar((m) => m + 50)}>
              Ver mais
            </button>
          )}
        </>
      )}
    </Cartao>
  );
}

const formatar = (v: unknown) => (v === null || v === undefined || v === '' ? '(vazio)' : Array.isArray(v) ? `${v.length} item(s)` : String(v));

function CartaoReverNomes() {
  const { casos, pronto } = useCasosNomes();
  const alertas = casos.filter((c) => c.tipo === 'diferente' || c.tipo === 'desconhecido').length;
  return (
    <Cartao titulo="Nomes dos sets">
      <p className="nota">
        {!pronto
          ? 'A comparar com o catálogo oficial…'
          : casos.length
            ? `${casos.length} set(s) com nome diferente do oficial${alertas ? `, ${alertas} a confirmar (⚠️)` : ''}.`
            : 'Os nomes coincidem com os oficiais.'}
      </p>
      <button className="btn" onClick={() => navegar('/rever-nomes')} disabled={!pronto}>
        Rever nomes
      </button>
    </Cartao>
  );
}

function CartaoTextoAnuncios() {
  const { dados, guardar, aviso } = useDados();
  const guardado = modeloAnuncio(dados.definicoes);
  const [m, setM] = useState<ModeloAnuncio>(guardado);
  const chaveGuardado = JSON.stringify(guardado);
  useEffect(() => setM(JSON.parse(chaveGuardado) as ModeloAnuncio), [chaveGuardado]);
  const mudou = JSON.stringify(m) !== chaveGuardado;
  async function gravar(novo: ModeloAnuncio) {
    await guardar('definicoes', [{ chave: CHAVE_MODELO_ANUNCIO, valor: novo as never }]);
    aviso('Texto dos anúncios guardado.');
  }
  return (
    <Cartao titulo="Texto dos anúncios">
      <p className="mudo">
        Aparece ao anunciar, pronto a copiar para a Vinted. Podes usar <code>{'{numero}'}</code>, <code>{'{nome}'}</code> e <code>{'{tema}'}</code>.
      </p>
      <label className="campo">
        <span className="campo-rotulo">Título</span>
        <input value={m.titulo} onChange={(e) => setM({ ...m, titulo: e.target.value })} />
      </label>
      <label className="campo">
        <span className="campo-rotulo">Descrição para produtos novos</span>
        <textarea rows={6} value={m.novo} onChange={(e) => setM({ ...m, novo: e.target.value })} />
      </label>
      <label className="campo">
        <span className="campo-rotulo">Descrição para produtos usados</span>
        <textarea rows={5} value={m.usado} onChange={(e) => setM({ ...m, usado: e.target.value })} />
      </label>
      <div className="linha-botoes">
        <button className="btn btn-primario" disabled={!mudou} onClick={() => gravar(m)}>Guardar</button>
        <button className="btn" onClick={() => setM(MODELO_PADRAO)}>Repor o texto original</button>
      </div>
    </Cartao>
  );
}
