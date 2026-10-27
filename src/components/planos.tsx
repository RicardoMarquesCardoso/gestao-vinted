import { useMemo, useState } from 'react';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { CHAVE_ADIADAS, CHAVE_PLANOS, chavePlano, mesAno, planosManuais, sugerirPlano, tarefas, tarefasAdiadas } from '../lib/plano';
import type { Contexto, Plano, PlanoManual, Tarefa } from '../lib/plano';
import type { Produto } from '../lib/types';
import { useDados } from '../state';
import { useAbrir } from './acoes';
import { useCatalogoSets } from './catalogo';
import { Cartao, Janela } from './ui';

/** Contexto para sugerir planos: dados, mercado e catálogo. */
export function useContextoPlano(): Contexto {
  const { dados } = useDados();
  const mercado = useMercado();
  const catalogo = useCatalogoSets();
  const h = hoje();
  return useMemo(
    () => ({ dados, mercado, hoje: h, anoSet: (n: string) => catalogo(n)?.ano ?? null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados, mercado, h, catalogo.carregado],
  );
}

export function textoPlano(pl: Plano) {
  return pl.acao === 'guardar' ? (pl.ate ? `guardar até ${mesAno(pl.ate)}` : 'guardar') : 'vender';
}

/** Etiqueta curta com o plano, para os cartões de produto. */
export function EtiquetaPlano({ p, ctx }: { p: Produto; ctx: Contexto }) {
  const pl = sugerirPlano(p, ctx);
  return <span className={`chip chip-plano chip-plano-${pl.acao}`} title={pl.motivo}>{textoPlano(pl)}</span>;
}

/** Linha no detalhe do produto: plano, preço sugerido e porquê. */
export function LinhaPlano({ p }: { p: Produto }) {
  const ctx = useContextoPlano();
  const abrir = useAbrir();
  const pl = sugerirPlano(p, ctx);
  return (
    <div className="linha-plano">
      <div>
        <strong>Plano: {textoPlano(pl)}</strong>
        {pl.precoSugerido !== null && <span> · {pl.acao === 'guardar' ? 'preço alvo' : 'anunciar a'} {fmtEuro(pl.precoSugerido)}</span>}
        <span className="mudo"> · mínimo {fmtEuro(pl.chao)}</span>
        {pl.manual && <span className="chip">decidido por vocês</span>}
      </div>
      <p className="mudo pequeno">{pl.motivo}</p>
      <button className="link" onClick={() => abrir({ tipo: 'plano', ids: [p.id] })}>Mudar plano</button>
    </div>
  );
}

/** Lista "O que fazer" do Painel. */
export function CartaoTarefas() {
  const { dados, guardar, aviso } = useDados();
  const abrir = useAbrir();
  const ctx = useContextoPlano();
  const lista = useMemo(() => tarefas(ctx), [ctx]);
  const [todas, setTodas] = useState(false);
  if (!lista.length) return null;
  const visiveis = todas ? lista : lista.slice(0, 5);

  async function adiar(t: Tarefa) {
    const h = hoje();
    const atuais = Object.fromEntries(Object.entries(tarefasAdiadas(dados.definicoes)).filter(([, ate]) => ate > h));
    const ate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    await guardar('definicoes', [{ chave: CHAVE_ADIADAS, valor: { ...atuais, [t.id]: ate } as never }]);
    aviso(`Adiado até ${fmtData(ate)}.`);
  }
  async function baixei(t: Tarefa) {
    await guardar('produtos', t.produtos.map((p) => ({ ...p, preco_anuncio: t.preco })));
    aviso('Preço atualizado.');
  }

  return (
    <Cartao titulo="O que fazer" acao={<span className="mudo">{plural(lista.length, 'tarefa', 'tarefas')}</span>}>
      <ul className="lista-tarefas">
        {visiveis.map((t) => (
          <li key={t.id} className={`tarefa tarefa-${t.tipo}`}>
            <button className="tarefa-texto" onClick={() => abrir({ tipo: 'detalhe', id: t.produtos[0].id })}>
              <strong>{t.titulo}</strong>
              <small className="mudo">{t.detalhe}</small>
            </button>
            <div className="tarefa-botoes">
              {t.tipo === 'anunciar' && (
                <button className="btn btn-pequeno btn-primario" onClick={() => abrir({ tipo: 'anunciar', ids: t.produtos.map((p) => p.id), preco: t.preco })}>
                  Anunciar
                </button>
              )}
              {t.tipo === 'baixar' && (
                <button className="btn btn-pequeno btn-primario" onClick={() => baixei(t)}>
                  Já baixei
                </button>
              )}
              {t.tipo === 'rever' && (
                <button className="btn btn-pequeno btn-primario" onClick={() => abrir({ tipo: 'plano', ids: t.produtos.map((p) => p.id) })}>
                  Decidir
                </button>
              )}
              <button className="btn btn-pequeno" onClick={() => adiar(t)} title="Esconder durante 14 dias">
                Adiar
              </button>
            </div>
          </li>
        ))}
      </ul>
      {lista.length > 5 && (
        <button className="link" onClick={() => setTodas((x) => !x)}>
          {todas ? 'Mostrar menos' : `Mostrar todas (${lista.length})`}
        </button>
      )}
    </Cartao>
  );
}

/** Mudar o plano de um produto (vale para todas as unidades iguais: mesmo set e condição). */
export function FormPlano({ ids, aoFechar }: { ids: string[]; aoFechar(): void }) {
  const { dados, guardar, aviso } = useDados();
  const ctx = useContextoPlano();
  const p = dados.produtos.find((x) => x.id === ids[0]);
  const chave = p ? chavePlano(p) : '';
  const atual = planosManuais(dados.definicoes)[chave];
  const sugestao = p ? sugerirPlano(p, { ...ctx, dados: { ...dados, definicoes: dados.definicoes.map((d) => (d.chave === CHAVE_PLANOS ? { ...d, valor: {} as never } : d)) } }) : null;
  const [escolha, setEscolha] = useState<'auto' | 'vender' | 'guardar'>(atual?.acao ?? 'auto');
  const [ate, setAte] = useState((atual?.ate ?? sugestao?.ate ?? '').slice(0, 7));

  if (!p || !sugestao) return null;

  async function gravar() {
    const planos = { ...planosManuais(dados.definicoes) };
    if (escolha === 'auto') delete planos[chave];
    else {
      if (escolha === 'guardar' && !ate) return aviso('Indica até quando guardar.', 'erro');
      const novo: PlanoManual = { acao: escolha, ate: escolha === 'guardar' ? `${ate}-01` : null, quando: hoje() };
      planos[chave] = novo;
    }
    await guardar('definicoes', [{ chave: CHAVE_PLANOS, valor: planos as never }]);
    aviso('Plano guardado.');
    aoFechar();
  }

  return (
    <Janela
      titulo={`Plano: ${p.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={gravar}>Guardar</button>
        </>
      }
    >
      <div className="opcoes-plano">
        <label className="opcao">
          <input type="radio" checked={escolha === 'auto'} onChange={() => setEscolha('auto')} />
          <span>
            <strong>Seguir a sugestão: {textoPlano(sugestao)}</strong>
            <small className="mudo">{sugestao.motivo}</small>
          </span>
        </label>
        <label className="opcao">
          <input type="radio" checked={escolha === 'vender'} onChange={() => setEscolha('vender')} />
          <span>
            <strong>Vender</strong>
            <small className="mudo">Sugere anunciar a {sugestao.precoSugerido !== null ? fmtEuro(sugestao.precoSugerido) : '—'} (mínimo {fmtEuro(sugestao.chao)}).</small>
          </span>
        </label>
        <label className="opcao">
          <input type="radio" checked={escolha === 'guardar'} onChange={() => setEscolha('guardar')} />
          <span>
            <strong>Guardar até</strong>
            <input type="month" value={ate} min={hoje().slice(0, 7)} onChange={(e) => { setAte(e.target.value); setEscolha('guardar'); }} />
          </span>
        </label>
      </div>
      <p className="nota">Vale para {plural(dados.produtos.filter((x) => chavePlano(x) === chave).length, 'produto igual', 'produtos iguais')} (mesmo set e condição).</p>
    </Janela>
  );
}
