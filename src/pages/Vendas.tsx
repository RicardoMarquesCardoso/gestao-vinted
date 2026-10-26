import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { CabecalhoProdutos } from '../components/CabecalhoProdutos';
import { EtiquetaVenda, Vazio, Valor } from '../components/ui';
import { PREDEFINICOES, custoVenda, dentro, intervaloDe, liquidoVenda, lucroVenda, vendaValida } from '../lib/calc';
import type { Predefinicao } from '../lib/calc';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import { ESTADOS_VENDA } from '../lib/types';
import { useDados } from '../state';

export function Vendas() {
  const { dados, nomeConta, nomePessoa } = useDados();
  const abrir = useAbrir();
  const [texto, setTexto] = useState('');
  const [periodo, setPeriodo] = useState<Predefinicao>('tudo');
  const h = hoje();
  const produtoPorId = useMemo(() => new Map(dados.produtos.map((p) => [p.id, p])), [dados.produtos]);

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const i = intervaloDe(periodo, h);
    return dados.vendas
      .filter((v) => {
        const p = produtoPorId.get(v.produto_id);
        return (
          dentro(v.data_venda, i) &&
          (!t ||
            `${p?.nome ?? ''} ${p?.set_numero ?? ''} ${v.notas ?? ''} ${nomeConta(v.conta_id)} ${nomePessoa(v.pessoa_id)}`.toLowerCase().includes(t))
        );
      })
      .sort((a, b) => b.data_venda.localeCompare(a.data_venda));
  }, [dados.vendas, produtoPorId, texto, periodo, h, nomeConta, nomePessoa]);

  const validas = lista.filter(vendaValida);
  const liquido = validas.reduce((a, v) => a + liquidoVenda(v), 0);
  const lucro = validas.reduce((a, v) => a + lucroVenda(v, produtoPorId.get(v.produto_id)), 0);

  function exportar() {
    descarregar(
      `vendas-${h}.csv`,
      paraCsv(lista, [
        { titulo: 'Data da venda', valor: (v) => v.data_venda },
        { titulo: 'Concluída em', valor: (v) => v.data_conclusao },
        { titulo: 'Produto', valor: (v) => produtoPorId.get(v.produto_id)?.nome },
        { titulo: 'N.º set', valor: (v) => produtoPorId.get(v.produto_id)?.set_numero },
        { titulo: 'Quantidade', valor: (v) => v.quantidade },
        { titulo: 'Estado', valor: (v) => ESTADOS_VENDA.find((e) => e.valor === v.estado)?.nome },
        { titulo: 'Conta', valor: (v) => nomeConta(v.conta_id) },
        { titulo: 'Quem vendeu', valor: (v) => nomePessoa(v.pessoa_id) },
        { titulo: 'Preço de venda', valor: (v) => v.preco_venda },
        { titulo: 'Comissões', valor: (v) => v.comissao },
        { titulo: 'Portes', valor: (v) => v.portes },
        { titulo: 'Outros custos', valor: (v) => v.outros_custos },
        { titulo: 'Valor líquido', valor: (v) => liquidoVenda(v) },
        { titulo: 'Custo do produto', valor: (v) => custoVenda(v, produtoPorId.get(v.produto_id)) },
        { titulo: 'Lucro', valor: (v) => lucroVenda(v, produtoPorId.get(v.produto_id)) },
        { titulo: 'Notas', valor: (v) => v.notas },
      ]),
    );
  }

  return (
    <div className="pagina">
      <CabecalhoProdutos aba="vendidos" exportar={exportar} adicionar={() => abrir({ tipo: 'venda' })} />

      <div className="filtros-inv filtros-inv-1">
        <input type="search" className="filtro-procura" placeholder="Procurar produto, set, conta…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Predefinicao)} aria-label="Período">
          {PREDEFINICOES.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
        </select>
      </div>
      <p className="resumo-lista">
        {plural(lista.length, 'venda', 'vendas')} · líquido {fmtEuro(liquido)} · lucro <Valor n={lucro} sinal />
      </p>

      {lista.length === 0 ? (
        <Vazio titulo="Sem vendas" texto="Quando venderes um produto, regista a venda aqui." />
      ) : (
        <ul className="lista-registos">
          {lista.map((v) => {
            const p = produtoPorId.get(v.produto_id);
            return (
              <li key={v.id}>
                <button className="registo" onClick={() => abrir({ tipo: 'venda', id: v.id })}>
                  <div className="registo-esquerda">
                    <div className="registo-titulo">
                      {v.quantidade > 1 ? `${v.quantidade}× ` : ''}
                      {p?.nome ?? 'Produto apagado'}
                    </div>
                    <div className="registo-meta">
                      {fmtData(v.data_venda)} · {nomeConta(v.conta_id)} · {nomePessoa(v.pessoa_id)}
                    </div>
                  </div>
                  <div className="registo-direita">
                    <EtiquetaVenda estado={v.estado} />
                    <strong>{fmtEuro(liquidoVenda(v))}</strong>
                    {vendaValida(v) && <Valor n={lucroVenda(v, p)} sinal />}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
