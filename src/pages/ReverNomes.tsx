import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { compararNomes, mesmoTema, useCatalogoSets } from '../components/catalogo';
import type { InfoSet } from '../components/catalogo';
import { Cartao, ImagemReferencia, Vazio, urlReferencia, useConfirmar } from '../components/ui';
import { plural } from '../lib/format';
import type { Produto } from '../lib/types';
import { useDados } from '../state';

export const CHAVE_MANTIDOS = 'nomes_mantidos';

interface Caso {
  set: string;
  produtos: Produto[];
  nomes: string[];
  oficial: InfoSet | undefined;
  tipo: 'parecido' | 'traduzido' | 'diferente' | 'desconhecido';
  talvez: InfoSet[]; // sets que parecem corresponder melhor ao nosso nome
  temaSugerido: string | null;
}

/** Sets cujo nome (ou subcategoria) difere do catálogo oficial, e sets que não existem no catálogo. */
export function useCasosNomes(): { casos: Caso[]; pronto: boolean } {
  const { dados, lista } = useDados();
  const procurar = useCatalogoSets();
  const pronto = !!procurar('10316'); // o catálogo já carregou
  const mantidos = new Set(lista(CHAVE_MANTIDOS));
  const casos = useMemo(() => {
    if (!pronto) return [];
    const porSet = new Map<string, Produto[]>();
    for (const p of dados.produtos) {
      const s = (p.set_numero ?? '').trim();
      if (!/^\d{3,7}$/.test(s) || (p.marca && !/lego/i.test(p.marca))) continue;
      porSet.set(s, [...(porSet.get(s) ?? []), p]);
    }
    const r: Caso[] = [];
    for (const [set, produtos] of porSet) {
      if (mantidos.has(set)) continue;
      const oficial = procurar(set);
      const nomes = [...new Set(produtos.map((p) => p.nome.trim()))];
      if (!oficial) {
        r.push({ set, produtos, nomes, oficial, tipo: 'desconhecido', temaSugerido: null, talvez: [] });
        continue;
      }
      const tipos = nomes.map((n) => compararNomes(n, oficial.nome));
      const temaDiferente = oficial.tema && produtos.some((p) => !p.tema || (mesmoTema(p.tema, oficial.tema) && p.tema !== oficial.tema));
      if (tipos.every((t) => t === 'igual') && !temaDiferente) continue;
      // Nome sem palavras em comum: tradução nossa, ou n.º errado se o nome corresponde a outro set do mesmo tema
      const talvez = tipos.includes('diferente')
        ? nomes.flatMap((n) => procurar.parecidos(n, oficial.tema, oficial.ano, set)).filter((x, i, a) => a.findIndex((y) => y.numero === x.numero) === i).slice(0, 2)
        : [];
      r.push({
        set,
        produtos,
        nomes,
        oficial,
        tipo: talvez.length ? 'diferente' : tipos.includes('diferente') ? 'traduzido' : 'parecido',
        temaSugerido: temaDiferente ? oficial.tema : null,
        talvez,
      });
    }
    const ordem = { diferente: 0, desconhecido: 1, traduzido: 2, parecido: 3 };
    return r.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || a.set.localeCompare(b.set));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.produtos, pronto, lista]);
  return { casos, pronto };
}

export function ReverNomes() {
  const { guardar, aviso, lista } = useDados();
  const abrir = useAbrir();
  const confirmar = useConfirmar();
  const { casos, pronto } = useCasosNomes();
  const [aGuardar, setAGuardar] = useState(false);

  async function usarOficial(c: Caso) {
    if (!c.oficial) return;
    const tema = c.oficial.tema;
    await guardar(
      'produtos',
      c.produtos.map((p) => ({ ...p, nome: c.oficial!.nome, tema: tema && (!p.tema || mesmoTema(p.tema, tema)) ? tema : p.tema })),
    );
  }

  async function mudarNumero(c: Caso, t: InfoSet) {
    await guardar('produtos', c.produtos.map((p) => ({ ...p, set_numero: t.numero })));
    aviso(`N.º do set corrigido para ${t.numero}.`);
  }

  async function manter(c: Caso) {
    await guardar('definicoes', [{ chave: CHAVE_MANTIDOS, valor: [...new Set([...lista(CHAVE_MANTIDOS), c.set])] }]);
  }

  async function usarTodosParecidos() {
    const parecidos = casos.filter((c) => c.tipo === 'parecido');
    const ok = await confirmar({
      titulo: 'Usar os nomes oficiais',
      texto: `Vais substituir o nome de ${plural(parecidos.length, 'set', 'sets')} parecidos pelo nome oficial (em inglês). Os casos assinalados como "não corresponde" ficam para rever um a um.`,
      botao: 'Substituir',
    });
    if (!ok) return;
    setAGuardar(true);
    try {
      for (const c of parecidos) await usarOficial(c);
      aviso('Nomes atualizados.');
    } finally {
      setAGuardar(false);
    }
  }

  const nParecidos = casos.filter((c) => c.tipo === 'parecido').length;
  const traduzidos = casos.filter((c) => c.tipo === 'traduzido');

  async function manterTraduzidos() {
    await guardar('definicoes', [{ chave: CHAVE_MANTIDOS, valor: [...new Set([...lista(CHAVE_MANTIDOS), ...traduzidos.map((c) => c.set)])] }]);
    aviso('Os vossos nomes ficam como estão.');
  }

  return (
    <div className="pagina">
      <div className="pagina-topo-icones">
        <h1>Rever nomes</h1>
      </div>
      <p className="nota">
        Compara o nome que usam com o nome oficial de cada set LEGO. Os casos com ⚠️ parecem ter o n.º do set errado: o vosso nome corresponde a outro
        set.
      </p>

      {!pronto ? (
        <p className="mudo">A carregar o catálogo…</p>
      ) : casos.length === 0 ? (
        <Vazio titulo="Está tudo certo" texto="Os nomes coincidem com os oficiais, ou já escolheram manter os vossos." />
      ) : (
        <>
          {nParecidos > 1 && (
            <button className="btn btn-largo rever-todos" onClick={usarTodosParecidos} disabled={aGuardar}>
              Usar o nome oficial nos {nParecidos} parecidos
            </button>
          )}
          {traduzidos.length > 1 && (
            <button className="btn btn-largo rever-todos" onClick={manterTraduzidos} disabled={aGuardar}>
              Manter os {traduzidos.length} nomes em português
            </button>
          )}
          <div className="rever-lista">
            {casos.map((c) => (
              <Cartao key={c.set} className={`rever rever-${c.tipo}`}>
                <div className="rever-topo">
                  <ImagemReferencia url={urlReferencia({ marca: 'LEGO', set_numero: c.set })} className="rever-img" />
                  <div className="rever-texto">
                    <div className="rever-set">
                      Set {c.set} · {plural(c.produtos.length, 'unidade', 'unidades')}
                      {c.tipo === 'diferente' && <span className="chip chip-alerta">⚠️ não corresponde</span>}
                      {c.tipo === 'desconhecido' && <span className="chip chip-alerta">⚠️ n.º não encontrado</span>}
                    </div>
                    <div>
                      <span className="mudo">Vosso: </span>
                      {c.nomes.join(' / ')}
                    </div>
                    {c.oficial && (
                      <div>
                        <span className="mudo">Oficial: </span>
                        <strong>{c.oficial.nome}</strong>
                        <span className="mudo">
                          {' '}
                          ({[c.oficial.tema, c.oficial.ano].filter(Boolean).join(', ')})
                        </span>
                      </div>
                    )}
                    {c.talvez.length > 0 && (
                      <div className="rever-talvez">
                        Talvez seja: {c.talvez.map((t) => `${t.numero} ${t.nome}${t.ano ? ` (${t.ano})` : ''}`).join(' ou ')}
                      </div>
                    )}
                    {c.temaSugerido && (
                      <div className="mudo">
                        Subcategoria: {[...new Set(c.produtos.map((p) => p.tema || '—'))].join(' / ')} → <strong>{c.temaSugerido}</strong>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rever-acoes">
                  {c.talvez.map((t) => (
                    <button key={t.numero} className="btn btn-pequeno btn-primario" onClick={() => mudarNumero(c, t)}>
                      Mudar para {t.numero}
                    </button>
                  ))}
                  {c.oficial && c.tipo !== 'diferente' && (
                    <button className="btn btn-pequeno btn-primario" onClick={() => usarOficial(c)}>
                      Usar oficial
                    </button>
                  )}
                  <button className="btn btn-pequeno" onClick={() => abrir({ tipo: 'produto', id: c.produtos[0].id })}>
                    Corrigir
                  </button>
                  <span className="espaco" />
                  <button className="btn btn-pequeno btn-perigo-texto rever-manter" onClick={() => manter(c)}>
                    Manter o nosso
                  </button>
                </div>
              </Cartao>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
