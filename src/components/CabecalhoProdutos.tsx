import { BotaoTopo } from './ui';

export interface VerProdutos {
  porVender: boolean;
  vendidos: boolean;
}

/** Topo de "Produtos": título, ícones e dois botões que se podem ligar ao mesmo tempo. */
export function CabecalhoProdutos(props: { ver: VerProdutos; mudar(v: VerProdutos): void; exportar(): void; adicionar(): void }) {
  const { ver } = props;
  // Pelo menos um tem de ficar ligado: desligar o último liga o outro.
  const alternar = (k: keyof VerProdutos) => {
    const novo = { ...ver, [k]: !ver[k] };
    if (!novo.porVender && !novo.vendidos) novo[k === 'porVender' ? 'vendidos' : 'porVender'] = true;
    props.mudar(novo);
  };
  return (
    <>
      <div className="pagina-topo-icones">
        <h1>Produtos</h1>
        <div className="botoes">
          <BotaoTopo titulo="Exportar CSV" icone="descarregar" onClick={props.exportar} />
          <BotaoTopo titulo="Adicionar produto" icone="mais" primario onClick={props.adicionar} />
        </div>
      </div>
      <div className="segmentos segmentos-largos abas-produtos" role="group" aria-label="Mostrar">
        <button aria-pressed={ver.porVender} className={ver.porVender ? 'ativo' : ''} onClick={() => alternar('porVender')}>
          {ver.porVender ? '✓ ' : ''}Por vender
        </button>
        <button aria-pressed={ver.vendidos} className={ver.vendidos ? 'ativo' : ''} onClick={() => alternar('vendidos')}>
          {ver.vendidos ? '✓ ' : ''}Vendidos
        </button>
      </div>
    </>
  );
}
