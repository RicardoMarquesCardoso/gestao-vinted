import { navegar } from '../router';
import { BotaoTopo } from './ui';

/** Topo comum de "Produtos": título, ícones e o seletor Por vender | Vendidos. */
export function CabecalhoProdutos(props: { aba: 'por_vender' | 'vendidos'; exportar(): void; adicionar(): void }) {
  const vendidos = props.aba === 'vendidos';
  return (
    <>
      <div className="pagina-topo-icones">
        <h1>Produtos</h1>
        <div className="botoes">
          <BotaoTopo titulo="Exportar CSV" icone="descarregar" onClick={props.exportar} />
          <BotaoTopo titulo={vendidos ? 'Registar venda' : 'Adicionar produto'} icone="mais" primario onClick={props.adicionar} />
        </div>
      </div>
      <div className="segmentos segmentos-largos abas-produtos" role="tablist">
        <button role="tab" aria-selected={!vendidos} className={!vendidos ? 'ativo' : ''} onClick={() => navegar('/produtos')}>
          Por vender
        </button>
        <button role="tab" aria-selected={vendidos} className={vendidos ? 'ativo' : ''} onClick={() => navegar('/produtos/vendidos')}>
          Vendidos
        </button>
      </div>
    </>
  );
}
