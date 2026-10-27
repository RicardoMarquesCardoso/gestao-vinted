// Topo do ecrã Produtos: título, botões (exportar, registar compra) e os 4 filtros
// Por vender / Anunciados / Pendentes / Vendidos, que se podem ligar ao mesmo tempo.

import { BotaoTopo } from './ui';

export interface VerProdutos {
  porVender: boolean;
  anunciados: boolean;
  pendentes: boolean;
  vendidos: boolean;
}

const BOTOES: { k: keyof VerProdutos; nome: string }[] = [
  { k: 'porVender', nome: 'Por vender' },
  { k: 'anunciados', nome: 'Anunciados' },
  { k: 'pendentes', nome: 'Pendentes' },
  { k: 'vendidos', nome: 'Vendidos' },
];

/** Topo de "Produtos": título, ícones e filtros que se podem ligar ao mesmo tempo. */
export function CabecalhoProdutos(props: { ver: VerProdutos; mudar(v: VerProdutos): void; contagens?: Record<keyof VerProdutos, number>; exportar(): void; adicionar(): void }) {
  const { ver } = props;
  const alternar = (k: keyof VerProdutos) => {
    const novo = { ...ver, [k]: !ver[k] };
    // "Anunciados" já está dentro de "Por vender": ligar um desliga o outro.
    if (novo[k] && k === 'anunciados') novo.porVender = false;
    if (novo[k] && k === 'porVender') novo.anunciados = false;
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
      <div className="segmentos segmentos-largos abas-produtos" role="group" aria-label="Mostrar">
        {BOTOES.map((b) => (
          <button key={b.k} aria-pressed={ver[b.k]} className={ver[b.k] ? 'ativo' : ''} onClick={() => alternar(b.k)}>
            {ver[b.k] ? '✓ ' : ''}{b.nome}
            {props.contagens?.[b.k] !== undefined && <span className="aba-n">{props.contagens[b.k]}</span>}
          </button>
        ))}
      </div>
    </>
  );
}
