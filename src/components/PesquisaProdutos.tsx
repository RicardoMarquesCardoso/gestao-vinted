// Caixa de pesquisa dos ecrãs Produtos e Análises, com sugestões enquanto se escreve.
//
// Como funciona:
// - À medida que se escreve, aparece uma lista por baixo com até 4 categorias/subcategorias
//   (ex.: "LEGO" ou "LEGO › Speed Champions") e até 6 produtos cujo nome ou n.º de set encaixa.
// - Tocar numa categoria liga-a como filtro (aparece um "chip" com × para a tirar) e limpa o texto.
// - Tocar num produto põe o n.º do set (ou o nome) na pesquisa, para a lista mostrar só esse.
// - As sugestões vêm só dos produtos que os filtros de cima (Por anunciar, Vendidos…) deixam ver,
//   para nunca sugerir algo que depois não aparece.
// - A comparação ignora maiúsculas e acentos ("pokemon" encontra "Pokémon").

import { useMemo, useState } from 'react';
import { chaveComparacao } from '../lib/calc';
import type { Produto } from '../lib/types';
import { naCategoria, normalizar, temaDe } from '../lib/categorias';
import type { FiltroCategoria } from '../lib/categorias';

// As funções de comparação vivem em lib/categorias.ts (usadas também nos cálculos das Análises).
export { naCategoria, normalizar, temaDe } from '../lib/categorias';
export type { FiltroCategoria } from '../lib/categorias';

export function PesquisaProdutos(props: {
  texto: string;
  mudarTexto(t: string): void;
  categoria: FiltroCategoria | null;
  mudarCategoria(f: FiltroCategoria | null): void;
  /** Produtos que os filtros de estado deixam ver (base das sugestões). */
  produtos: Produto[];
  /** Texto da caixa vazia (por defeito "Procurar…"). */
  placeholder?: string;
}) {
  const [aberta, setAberta] = useState(false);
  const t = normalizar(props.texto);

  const sugestoes = useMemo(() => {
    if (!t) return { categorias: [], produtos: [] };
    const base = props.produtos.filter((p) => naCategoria(p, props.categoria));

    // Categorias (marca) e subcategorias (marca › tema), com quantos produtos têm
    const cats = new Map<string, { f: FiltroCategoria; n: number }>();
    for (const p of base) {
      if (!p.marca?.trim()) continue;
      const marca = p.marca.trim();
      const tema = temaDe(p);
      if (normalizar(marca).includes(t) && !props.categoria) {
        const k = normalizar(marca);
        cats.set(k, { f: { marca }, n: (cats.get(k)?.n ?? 0) + 1 });
      }
      if (tema && (normalizar(tema).includes(t) || normalizar(marca).includes(t)) && !props.categoria?.tema) {
        const k = `${normalizar(marca)}›${normalizar(tema)}`;
        cats.set(k, { f: { marca, tema }, n: (cats.get(k)?.n ?? 0) + 1 });
      }
    }
    // As que começam pelo texto primeiro, depois as com mais produtos
    const comeca = (f: FiltroCategoria) => (normalizar(f.tema ?? f.marca).startsWith(t) ? 0 : 1);
    const categorias = [...cats.values()].sort((a, b) => comeca(a.f) - comeca(b.f) || b.n - a.n).slice(0, 4);

    // Produtos: um por grupo de iguais (mesmo set ou mesmo nome)
    const grupos = new Map<string, { p: Produto; n: number }>();
    for (const p of base) {
      if (!normalizar(p.nome).includes(t) && !normalizar(p.set_numero).includes(t)) continue;
      const k = chaveComparacao(p);
      grupos.set(k, { p: grupos.get(k)?.p ?? p, n: (grupos.get(k)?.n ?? 0) + 1 });
    }
    const produtos = [...grupos.values()]
      .sort((a, b) => (normalizar(a.p.nome).startsWith(t) ? 0 : 1) - (normalizar(b.p.nome).startsWith(t) ? 0 : 1) || a.p.nome.localeCompare(b.p.nome))
      .slice(0, 6);
    return { categorias, produtos };
  }, [t, props.produtos, props.categoria]);

  const temSugestoes = sugestoes.categorias.length + sugestoes.produtos.length > 0;

  function escolherCategoria(f: FiltroCategoria) {
    props.mudarCategoria(f);
    props.mudarTexto('');
    setAberta(false);
  }
  function escolherProduto(p: Produto) {
    props.mudarTexto(p.set_numero?.trim() || p.nome);
    setAberta(false);
  }

  return (
    <div className="pesquisa">
      <input
        type="search"
        className="filtro-procura"
        placeholder={props.categoria ? `Procurar em ${props.categoria.tema ?? props.categoria.marca}…` : props.placeholder ?? 'Procurar…'}
        title="Nome, set, categoria, conta ou quem pagou"
        value={props.texto}
        onChange={(e) => {
          props.mudarTexto(e.target.value);
          setAberta(true);
        }}
        onFocus={() => setAberta(true)}
        // Fecha um pouco depois, para dar tempo ao toque numa sugestão
        onBlur={() => setTimeout(() => setAberta(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAberta(false);
          if (e.key === 'Enter') {
            setAberta(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        autoComplete="off"
        enterKeyHint="search"
      />
      {props.categoria && (
        <button className="chip chip-filtro" onClick={() => props.mudarCategoria(null)} title="Tirar filtro">
          {props.categoria.tema ? `${props.categoria.marca} › ${props.categoria.tema}` : props.categoria.marca} <span aria-hidden="true">×</span>
        </button>
      )}
      {aberta && temSugestoes && (
        <ul className="sugestoes" role="listbox">
          {sugestoes.categorias.length > 0 && <li className="procurar-titulo">Categorias</li>}
          {sugestoes.categorias.map(({ f, n }) => (
            <li key={`${f.marca}›${f.tema ?? ''}`}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolherCategoria(f)}>
                <span className="truncar">
                  {f.tema ? (
                    <>
                      <span className="mudo">{f.marca} › </span>
                      {f.tema}
                    </>
                  ) : (
                    f.marca
                  )}
                </span>
                <span className="mudo">{n}</span>
              </button>
            </li>
          ))}
          {sugestoes.produtos.length > 0 && <li className="procurar-titulo">Produtos</li>}
          {sugestoes.produtos.map(({ p, n }) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolherProduto(p)}>
                <span className="truncar">
                  {p.nome}
                  {p.set_numero ? <span className="mudo"> · {p.set_numero}</span> : null}
                </span>
                {n > 1 && <span className="mudo">×{n}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
