// Ecrã "Compras": lista das compras com total, quem pagou e produtos; exportação para CSV.
// O total de cada compra é a soma do custo dos seus produtos (totalCompra): corrigir o preço de um
// produto atualiza a compra (pedido do Ricardo).

import { useMemo, useState } from 'react';
import { useAbrir } from '../components/acoes';
import { Vazio , BotaoTopo } from '../components/ui';
import { PREDEFINICOES, arred, dentro, intervaloDe, totalCompra } from '../lib/calc';
import type { Predefinicao } from '../lib/calc';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import { useDados } from '../state';

export function Compras() {
  const { dados, nomePagador } = useDados();
  const abrir = useAbrir();
  const [texto, setTexto] = useState('');
  const [periodo, setPeriodo] = useState<Predefinicao>('tudo');
  const [pessoa, setPessoa] = useState('');
  const h = hoje();

  const produtosDe = useMemo(() => {
    const m = new Map<string, typeof dados.produtos>();
    for (const p of dados.produtos) if (p.compra_id) m.set(p.compra_id, [...(m.get(p.compra_id) ?? []), p]);
    return m;
  }, [dados.produtos]);
  // Portes e outros custos de uma compra: a soma dos custos adicionais dos seus produtos.
  const extrasDe = (id: string) => arred((produtosDe.get(id) ?? []).reduce((a, p) => a + (p.custos_adicionais || 0), 0));

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const i = intervaloDe(periodo, h);
    return dados.compras
      .filter(
        (c) =>
          dentro(c.data, i) &&
          (!pessoa || c.pessoa_id === pessoa) &&
          (!t ||
            [c.vendedor, c.metodo_pagamento, c.notas].some((x) => (x || '').toLowerCase().includes(t)) ||
            (produtosDe.get(c.id) ?? []).some((p) => `${p.nome} ${p.set_numero ?? ''}`.toLowerCase().includes(t))),
      )
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [dados.compras, texto, periodo, pessoa, h, produtosDe]);

  const total = lista.reduce((a, c) => a + totalCompra(c, produtosDe.get(c.id) ?? []), 0);
  const porPessoa = [...new Set(lista.map((c) => nomePagador(c)))]
    .map((nome) => ({ nome, total: lista.filter((c) => nomePagador(c) === nome).reduce((a, c) => a + totalCompra(c, produtosDe.get(c.id) ?? []), 0) }))
    .filter((x) => x.total > 0);

  function exportar() {
    descarregar(
      `compras-${h}.csv`,
      paraCsv(lista, [
        { titulo: 'Data', valor: (c) => c.data },
        { titulo: 'Quem pagou', valor: (c) => nomePagador(c) },
        { titulo: 'Método', valor: (c) => c.metodo_pagamento },
        { titulo: 'Comprado a', valor: (c) => c.vendedor },
        { titulo: 'Valor dos artigos', valor: (c) => arred((produtosDe.get(c.id) ?? []).reduce((a, p) => a + (p.preco_compra || 0), 0)) },
        { titulo: 'Portes e outros custos', valor: (c) => extrasDe(c.id) },
        { titulo: 'Total', valor: (c) => totalCompra(c, produtosDe.get(c.id) ?? []) },
        { titulo: 'Produtos', valor: (c) => (produtosDe.get(c.id) ?? []).map((p) => `${p.quantidade}× ${p.nome}`).join(', ') },
        { titulo: 'Notas', valor: (c) => c.notas },
      ]),
    );
  }

  return (
    <div className="pagina">
      <div className="pagina-topo-icones">
        <h1>Compras</h1>
        <div className="botoes">
          {/* Avaliar uma promoção antes de comprar (pages/Avaliar.tsx) */}
          <a className="btn" href="#/avaliar">Vale a pena?</a>
          <BotaoTopo titulo="Exportar CSV" icone="descarregar" onClick={exportar} />
          <BotaoTopo titulo="Registar compra" icone="mais" primario onClick={() => abrir({ tipo: 'compra' })} />
        </div>
      </div>
      <div className="filtros">
        <input type="search" className="filtro-procura" placeholder="Procurar produto, vendedor…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Predefinicao)} aria-label="Período">
          {PREDEFINICOES.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
        </select>
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Quem pagou">
          <option value="">Todas as pessoas</option>
          {dados.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <p className="resumo-lista">
        {plural(lista.length, 'compra', 'compras')} · total {fmtEuro(total)}
        {porPessoa.map((x) => ` · ${x.nome} ${fmtEuro(x.total)}`).join('')}
      </p>

      {lista.length === 0 ? (
        <Vazio titulo="Sem compras" texto="Regista a primeira compra para começar." />
      ) : (
        <ul className="lista-registos">
          {lista.map((c) => {
            const ps = produtosDe.get(c.id) ?? [];
            return (
              <li key={c.id}>
                <button className="registo" onClick={() => abrir({ tipo: 'compra', id: c.id })}>
                  <div className="registo-esquerda">
                    <div className="registo-titulo">{ps.length ? ps.map((p) => p.nome).join(', ') : 'Compra sem produtos'}</div>
                    <div className="registo-meta">
                      {fmtData(c.data)} · {nomePagador(c)}
                      {c.metodo_pagamento ? ` · ${c.metodo_pagamento}` : ''}
                      {c.vendedor ? ` · ${c.vendedor}` : ''}
                    </div>
                  </div>
                  <div className="registo-direita">
                    <strong>{fmtEuro(totalCompra(c, produtosDe.get(c.id) ?? []))}</strong>
                    <small className="mudo">
                      {plural(ps.reduce((a, p) => a + p.quantidade, 0), 'unidade', 'unidades')}
                      {extrasDe(c.id) ? ` · portes ${fmtEuro(extrasDe(c.id))}` : ''}
                    </small>
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
