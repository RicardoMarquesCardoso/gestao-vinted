// Topo do ecrã Produtos: título, botões (exportar, registar compra) e os 4 filtros
// Por anunciar / Anunciados / Pendentes / Vendidos, que se podem ligar ao mesmo tempo (em qualquer combinação).
// Cada filtro é um botão com ícone e contagem (no computador aparece também o nome).
// Os ícones seguem o estilo Lucide (traço de 2 px, 24×24): package-open, megaphone, clock e circle-check.

import type { ReactNode } from 'react';
import { BotaoTopo } from './ui';

export interface VerProdutos {
  porAnunciar: boolean;
  anunciados: boolean;
  pendentes: boolean;
  vendidos: boolean;
}

const BOTOES: { k: keyof VerProdutos; nome: string; icone: ReactNode }[] = [
  {
    k: 'porAnunciar',
    nome: 'Por anunciar',
    icone: (
      <>
        <path d="M12 22v-9" />
        <path d="M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.66 1.66 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z" />
        <path d="M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13" />
        <path d="M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.64 1.64 0 0 0 1.63 0z" />
      </>
    ),
  },
  {
    k: 'anunciados',
    nome: 'Anunciados',
    icone: (
      <>
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </>
    ),
  },
  {
    k: 'pendentes',
    nome: 'Pendentes',
    icone: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
  },
  {
    k: 'vendidos',
    nome: 'Vendidos',
    icone: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
];

/** Topo de "Produtos": título, ícones e filtros que se podem ligar ao mesmo tempo. */
export function CabecalhoProdutos(props: { ver: VerProdutos; mudar(v: VerProdutos): void; contagens?: Record<keyof VerProdutos, number>; exportar(): void; adicionar(): void }) {
  const { ver } = props;
  const alternar = (k: keyof VerProdutos) => {
    const novo = { ...ver, [k]: !ver[k] };
    // Pelo menos um tem de ficar ligado
    if (!BOTOES.some((b) => novo[b.k])) return;
    props.mudar(novo);
  };
  return (
    <>
      <div className="pagina-topo-icones">
        <h1>Produtos</h1>
        <div className="botoes">
          <BotaoTopo titulo="Exportar CSV" icone="descarregar" onClick={props.exportar} />
          <BotaoTopo titulo="Registar compra" icone="mais" primario onClick={props.adicionar} />
        </div>
      </div>
      <div className="abas-produtos" role="group" aria-label="Mostrar">
        {BOTOES.map((b) => (
          <button key={b.k} aria-pressed={ver[b.k]} aria-label={b.nome} title={b.nome} className={ver[b.k] ? 'ativo' : ''} onClick={() => alternar(b.k)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {b.icone}
            </svg>
            <span className="aba-n">{props.contagens?.[b.k] ?? ''}</span>
            <span className="aba-nome">{b.nome}</span>
          </button>
        ))}
      </div>
    </>
  );
}
