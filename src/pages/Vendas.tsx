import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { EtiquetaVenda, Vazio, Valor , BotaoTopo } from '../components/ui';
import { PREDEFINICOES, custoVenda, dentro, intervaloDe, liquidoVenda, lucroVenda, vendaValida } from '../lib/calc';
import type { Predefinicao } from '../lib/calc';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import type { EstadoVenda } from '../lib/types';
import { ESTADOS_VENDA } from '../lib/types';
import { useDados } from '../state';

export function Vendas() {
  const { dados, nomeConta, nomePessoa } = useDados();
  const abrir = useAbrir();
  const [texto, setTexto] = useState('');
  const [periodo, setPeriodo] = useState<Predefinicao>('tudo');
  const [estado, setEstado] = useState<'' | EstadoVenda>('');
  const [conta, setConta] = useState('');
  const [pessoa, setPessoa] = useState('');
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
          (!estado || v.estado === estado) &&
          (!conta || v.conta_id === conta) &&
          (!pessoa || v.pessoa_id === pessoa) &&
          (!t || `${p?.nome ?? ''} ${p?.set_numero ?? ''} ${v.notas ?? ''}`.toLowerCase().includes(t))
        );
      })
      .sort((a, b) => b.data_venda.localeCompare(a.data_venda));
  }, [dados.vendas, produtoPorId, texto, periodo, estado, conta, pessoa, h]);

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
      <div className="pagina-topo-icones">
        <h1>Vendas</h1>
        <div className="botoes">
          <BotaoTopo titulo="Exportar CSV" icone="descarregar" onClick={exportar} />
          <BotaoTopo titulo="Registar venda" icone="mais" primario onClick={() => abrir({ tipo: 'venda' })} />
        </div>
      </div>
      <div className="filtros">
        <input type="search" className="filtro-procura" placeholder="Procurar produto…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Predefinicao)} aria-label="Período">
          {PREDEFINICOES.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value as '' | EstadoVenda)} aria-label="Estado">
          <option value="">Todos os estados</option>
          {ESTADOS_VENDA.map((e) => <option key={e.valor} value={e.valor}>{e.nome}</option>)}
        </select>
        <select value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Quem vendeu">
          <option value="">Todas as pessoas</option>
          {dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
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
