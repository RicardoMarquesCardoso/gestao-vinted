import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { EtiquetaProduto, Foto, Vazio } from '../components/ui';
import { custoTotalProduto, custoUnitario, diasEntre, emInventario, unidadesDisponiveis } from '../lib/calc';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import type { Produto } from '../lib/types';
import { ESTADOS_PRODUTO } from '../lib/types';
import { useDados } from '../state';

type FiltroEstado = 'inventario' | 'todos' | Produto['estado'];
type Ordem = 'recentes' | 'antigos' | 'nome' | 'custo';

export function Inventario() {
  const { dados, nomeConta, nomePagador } = useDados();
  const abrir = useAbrir();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('inventario');
  const [conta, setConta] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const h = hoje();

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const r = dados.produtos.filter(
      (p) =>
        (estado === 'todos' || (estado === 'inventario' ? emInventario(p) : p.estado === estado)) &&
        (!conta || p.conta_id === conta) &&
        (!pessoa || p.pessoa_id === pessoa) &&
        (!t || [p.nome, p.set_numero, p.tema, p.marca, p.condicao, p.notas].some((x) => (x || '').toLowerCase().includes(t))),
    );
    const data = (p: Produto) => p.data_compra || p.criado_em || '';
    return r.sort((a, b) =>
      ordem === 'nome'
        ? a.nome.localeCompare(b.nome)
        : ordem === 'custo'
          ? custoTotalProduto(b) - custoTotalProduto(a)
          : ordem === 'antigos'
            ? data(a).localeCompare(data(b))
            : data(b).localeCompare(data(a)),
    );
  }, [dados.produtos, texto, estado, conta, pessoa, ordem]);

  const unidades = lista.reduce((a, p) => a + (emInventario(p) ? unidadesDisponiveis(p, dados.vendas) : 0), 0);
  const custo = lista.reduce((a, p) => a + (emInventario(p) ? custoUnitario(p) * unidadesDisponiveis(p, dados.vendas) : 0), 0);

  function exportar() {
    descarregar(
      `produtos-${h}.csv`,
      paraCsv(lista, [
        { titulo: 'Nome', valor: (p) => p.nome },
        { titulo: 'N.º set', valor: (p) => p.set_numero },
        { titulo: 'Marca', valor: (p) => p.marca },
        { titulo: 'Tema', valor: (p) => p.tema },
        { titulo: 'Condição', valor: (p) => p.condicao },
        { titulo: 'Estado', valor: (p) => ESTADOS_PRODUTO.find((e) => e.valor === p.estado)?.nome },
        { titulo: 'Quantidade', valor: (p) => p.quantidade },
        { titulo: 'Disponíveis', valor: (p) => unidadesDisponiveis(p, dados.vendas) },
        { titulo: 'Data de compra', valor: (p) => p.data_compra },
        { titulo: 'Preço de compra', valor: (p) => p.preco_compra },
        { titulo: 'Custos adicionais', valor: (p) => p.custos_adicionais },
        { titulo: 'Custo total', valor: (p) => custoTotalProduto(p) },
        { titulo: 'Quem pagou', valor: (p) => nomePagador(p) },
        { titulo: 'Conta', valor: (p) => nomeConta(p.conta_id) },
        { titulo: 'Anunciado em', valor: (p) => p.data_anuncio },
        { titulo: 'Preço anunciado', valor: (p) => p.preco_anuncio },
        { titulo: 'Descrição', valor: (p) => p.descricao },
        { titulo: 'Notas', valor: (p) => p.notas },
      ]),
    );
  }

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <h1>Inventário</h1>
        <div className="botoes">
          <button className="btn" onClick={exportar}>Exportar CSV</button>
          <button className="btn btn-primario" onClick={() => abrir({ tipo: 'produto' })}>+ Produto</button>
        </div>
      </div>

      <div className="filtros">
        <input type="search" className="filtro-procura" placeholder="Procurar nome, set, tema…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} aria-label="Estado">
          <option value="inventario">Por vender</option>
          <option value="todos">Todos os estados</option>
          {ESTADOS_PRODUTO.map((e) => (
            <option key={e.valor} value={e.valor}>{e.nome}</option>
          ))}
        </select>
        <select value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Quem pagou">
          <option value="">Todas as pessoas</option>
          {dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
          <option value="recentes">Mais recentes</option>
          <option value="antigos">Mais antigos</option>
          <option value="nome">Nome</option>
          <option value="custo">Maior custo</option>
        </select>
      </div>

      <p className="resumo-lista">
        {plural(lista.length, 'produto', 'produtos')}
        {unidades > 0 && ` · ${plural(unidades, 'unidade por vender', 'unidades por vender')} · custo ${fmtEuro(custo)}`}
      </p>

      {lista.length === 0 ? (
        <Vazio titulo="Nenhum produto encontrado" texto="Experimenta mudar os filtros, ou regista uma compra." />
      ) : (
        <ul className="grelha-produtos">
          {lista.map((p) => {
            const disp = unidadesDisponiveis(p, dados.vendas);
            const dias = p.estado === 'anunciado' && p.data_anuncio ? diasEntre(p.data_anuncio, h) : null;
            return (
              <li key={p.id}>
                <button className="produto" onClick={() => abrir({ tipo: 'detalhe', id: p.id })}>
                  {p.fotos[0] ? <Foto refFoto={p.fotos[0]} alt="" className="produto-foto" /> : <div className="produto-foto produto-sem-foto">{p.set_numero || p.marca || '—'}</div>}
                  <div className="produto-info">
                    <div className="produto-nome">{p.nome}</div>
                    <div className="produto-meta">
                      {[p.set_numero && `Set ${p.set_numero}`, p.condicao].filter(Boolean).join(' · ') || p.marca}
                    </div>
                    <div className="produto-linha">
                      <EtiquetaProduto estado={p.estado} />
                      {p.quantidade > 1 && <span className="chip">{disp}/{p.quantidade} un.</span>}
                      {dias !== null && <span className={`chip ${dias > 60 ? 'chip-alerta' : ''}`}>{dias} dias</span>}
                    </div>
                    <div className="produto-rodape">
                      <span>{fmtEuro(custoTotalProduto(p))}</span>
                      <span className="mudo">{p.conta_id ? nomeConta(p.conta_id) : fmtData(p.data_compra)}</span>
                    </div>
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
