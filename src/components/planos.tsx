// Interface dos planos e tarefas (a lógica está em lib/plano.ts):
//   - CartaoTarefas: lista "O que fazer" no Painel (anunciar, baixar preço, rever).
//   - SinalProduto: bolinha tipo semáforo + próxima ação nos cartões de produto (lógica em sinais()).
//   - LinhaPlano: plano, preço sugerido e porquê, no detalhe do produto.
//   - FormPlano: mudar o plano à mão (vender / guardar até / seguir a sugestão).
//   - LinhaPokemon: preço de mercado de produtos Pokémon e associação ao produto certo.

import { useMemo, useState } from 'react';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import { chavePokemon, entradaPokemon, idsPokemon, precoPokemon, urlImagemTcg, useMercado } from '../lib/investimento';
import type { ProdutoTcg } from '../lib/investimento';
import { custoUnitario } from '../lib/calc';
import { CHAVE_ADIADAS, CHAVE_PLANOS, CHAVE_POKEMON_IDS, chavePlano, mesAno, planosManuais, sinais, sugerirPlano, tarefas, tarefasAdiadas } from '../lib/plano';
import type { Contexto, Plano, PlanoManual, Sinal, Tarefa } from '../lib/plano';
import type { Produto } from '../lib/types';
import { useDados } from '../state';
import { useAbrir } from './acoes';
import { useCatalogoSets } from './catalogo';
import { Cartao, ImagemReferencia, Janela } from './ui';

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

/** Sinal (cor + próxima ação) de todos os produtos, calculado uma vez por cada mudança nos dados. */
export function useSinais(ctx: Contexto): Map<string, Sinal> {
  return useMemo(() => sinais(ctx), [ctx]);
}

/**
 * Bolinha de cor com a próxima ação, ex.: "● Anunciar a 89 €".
 * A cor dá a leitura rápida; o texto tira a dúvida (e serve a quem não distingue bem as cores).
 */
export function SinalProduto({ sinal }: { sinal: Sinal | undefined }) {
  if (!sinal) return null;
  return (
    <span className={`sinal sinal-${sinal.cor}`} title={sinal.porque}>
      <span className="sinal-bola" aria-hidden="true" />
      <span className="truncar">{sinal.texto}</span>
    </span>
  );
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

/** Onde se lembra, neste dispositivo, se a lista de tarefas está minimizada. */
const CHAVE_MINIMIZADO = 'gv.tarefasMinimizadas';

/** Lista "O que fazer" do Painel. Toca no título para minimizar ou maximizar. */
export function CartaoTarefas() {
  const { dados, guardar, aviso } = useDados();
  const abrir = useAbrir();
  const ctx = useContextoPlano();
  const lista = useMemo(() => tarefas(ctx), [ctx]);
  const [todas, setTodas] = useState(false);
  // Minimizar/maximizar: a escolha fica guardada neste dispositivo (localStorage)
  const [minimizado, setMinimizado] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_MINIMIZADO) === '1';
    } catch {
      return false;
    }
  });
  const alternar = () =>
    setMinimizado((m) => {
      try {
        localStorage.setItem(CHAVE_MINIMIZADO, m ? '0' : '1');
      } catch {
        /* sem armazenamento: fica só até fechar a app */
      }
      return !m;
    });
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
    <Cartao
      className={minimizado ? 'cartao-minimizado' : ''}
      titulo={
        <button className="cartao-alternar" onClick={alternar} aria-expanded={!minimizado}>
          O que fazer
        </button>
      }
      acao={
        <button className="cartao-alternar mudo" onClick={alternar} aria-label={minimizado ? 'Mostrar tarefas' : 'Minimizar tarefas'}>
          {plural(lista.length, 'tarefa', 'tarefas')} <span aria-hidden="true">{minimizado ? '▾' : '▴'}</span>
        </button>
      }
    >
      {!minimizado && (
      <>
      <ul className="lista-tarefas">
        {visiveis.map((t) => (
          <li key={t.id} className={`tarefa tarefa-${t.tipo}`}>
            <button className="tarefa-texto" onClick={() => abrir({ tipo: 'detalhe', id: t.produtos[0].id })}>
              <strong>{t.titulo}</strong>
              <small className="mudo">{t.detalhe}</small>
            </button>
            <div className="tarefa-botoes">
              {t.tipo === 'anunciar' && (
                <button className="btn btn-pequeno btn-primario" onClick={() => abrir({ tipo: 'anunciar', ids: t.produtos.map((p) => p.id), preco: t.preco, unidades: 1 })}>
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
      </>
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

/**
 * Preço de mercado de um produto Pokémon (PokemonPriceTracker) e a associação ao produto certo.
 *
 * A tarefa diária procura cada produto pelo nome. Como os nossos nomes são curtos ("ETB"),
 * a pesquisa pode escolher o produto errado — por isso mostramos o nome encontrado e deixamos
 * indicar o n.º do TCGplayer certo (está no endereço da página do produto em tcgplayer.com).
 * A escolha fica em definicoes.pokemon_ids e é usada na próxima atualização.
 */
export function LinhaPokemon({ p }: { p: Produto }) {
  const { dados, guardar, aviso } = useDados();
  const mercado = useMercado();
  const [editar, setEditar] = useState(false);
  const chave = chavePokemon(p.nome);
  const ids = idsPokemon(dados.definicoes);
  const [id, setId] = useState(ids[chave] ?? '');
  const entrada = entradaPokemon(mercado, p.nome); // o que a pesquisa encontrou (com ou sem preço)
  const pk = precoPokemon(mercado, p.nome, ids, custoUnitario(p)); // o preço que a app usa
  // Candidatos por escolher: a pesquisa não teve a certeza, ou encontrou um preço absurdo
  const candidatos = !ids[chave] ? entrada?.candidatos ?? (entrada?.id && !pk ? [entrada as ProdutoTcg] : []) : [];

  async function gravar(novo: string) {
    const limpo = novo.trim().match(/\d+/)?.[0] ?? ''; // aceita o n.º ou o endereço completo
    const valor = { ...ids };
    if (limpo) valor[chave] = limpo;
    else delete valor[chave];
    await guardar('definicoes', [{ chave: CHAVE_POKEMON_IDS, valor: valor as never }]);
    aviso(limpo ? 'Associado.' : 'Associação removida.');
    setEditar(false);
  }

  return (
    <div className="linha-plano">
      <div>
        <strong>Mercado (TCGplayer, EUA):</strong>{' '}
        {pk?.eur ? (
          <>
            {fmtEuro(pk.eur)} <span className="mudo">({pk.usd} $)</span>
          </>
        ) : (
          <span className="mudo">{ids[chave] ? 'o preço chega na próxima atualização' : 'ainda sem preço'}</span>
        )}
      </div>
      {pk?.nome && (
        <p className="mudo pequeno">
          {pk.auto ? 'Encontrado pela pesquisa: ' : 'Associado: '}
          {pk.nome}
          {pk.set ? ` · ${pk.set}` : ''}
        </p>
      )}
      {candidatos.length > 0 && (
        <div className="candidatos-tcg">
          <p className="pequeno">Qual destes é?</p>
          {candidatos.map((c) => (
            <button key={c.id} className="btn btn-pequeno candidato-tcg" onClick={() => gravar(c.id)}>
              {/* Miniatura do TCGplayer, para ser mais fácil reconhecer o produto certo */}
              <ImagemReferencia url={urlImagemTcg(c.id)} className="procurar-img" />
              <span>
                {c.nome}
                {c.eur ? ` · ${fmtEuro(c.eur)}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      {editar ? (
        <div className="linha-botoes">
          <input placeholder="N.º ou endereço do TCGplayer" value={id} onChange={(e) => setId(e.target.value)} />
          <button className="btn btn-pequeno btn-primario" onClick={() => gravar(id)}>Guardar</button>
          {ids[chave] && <button className="btn btn-pequeno" onClick={() => gravar('')}>Remover</button>}
        </div>
      ) : (
        <button className="link" onClick={() => setEditar(true)}>
          {candidatos.length ? 'Não é nenhum destes' : pk && !pk.auto ? 'Mudar associação' : 'Não é este produto?'}
        </button>
      )}
    </div>
  );
}
