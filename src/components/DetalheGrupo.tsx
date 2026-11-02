// Janela de detalhe de um GRUPO de produtos iguais (mesmo n.º de set ou, sem set, mesmo nome),
// aberta ao tocar no cartão "×N" do ecrã Produtos.
//
// Mostra todos os produtos iguais (também os vendidos), a imagem, os links do set, um resumo (unidades em stock, custo médio, vendidas e lucro),
// o plano/anúncio do grupo e uma TABELA com cada produto: data de compra, condição, custo por
// unidade, estado (por anunciar / anunciado na conta X / vendido) e, nos vendidos, o lucro.
// Tocar numa linha abre o detalhe desse produto; fechá-lo volta a esta janela.
// No rodapé: Vendi, Anunciar e Retirar para o grupo (a app escolhe a unidade certa).

import { LinhaPlano } from './planos';
import { useAbrir } from './acoes';
import { ImagemReferencia, Foto, Janela, Valor, urlReferencia, useImagemReferencia } from './ui';
import { urlEbayVendidos, urlVinted } from '../lib/avaliar';
import { produtoNovo } from '../lib/anuncio';
import { chaveComparacao, custoUnitario, emInventario, liquidoVenda, lucroVenda, unidadesDisponiveis, vendaValida } from '../lib/calc';
import { fmtEuro, plural } from '../lib/format';
import type { Produto, Venda } from '../lib/types';
import { useDados } from '../state';

/** Data curta para a tabela: 2026-10-31 → 31/10/26. */
const dataCurta = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—');

export function DetalheGrupo({ ids, aoFechar }: { ids: string[]; aoFechar(): void }) {
  const { dados } = useDados();
  const abrir = useAbrir();
  const imagemReferencia = useImagemReferencia();
  // Todos os produtos iguais ao do cartão, incluindo os já vendidos (o cartão pode só mostrar os
  // que passam nos filtros do ecrã, mas aqui interessa o histórico todo)
  const base = ids.map((id) => dados.produtos.find((x) => x.id === id)).find((x): x is Produto => !!x);
  if (!base) return null;
  const chave = chaveComparacao(base);
  const itens = dados.produtos.filter((x) => chaveComparacao(x) === chave);
  // Do mais antigo para o mais recente (a ordem em que se costumam vender)
  itens.sort((a, b) => (a.data_compra ?? '').localeCompare(b.data_compra ?? ''));
  const p = itens.find((x) => x.fotos.length) ?? itens[0];

  const vendasDe = (x: Produto) => dados.vendas.filter((v) => v.produto_id === x.id && vendaValida(v));
  const emStock = itens.filter((x) => emInventario(x) && unidadesDisponiveis(x, dados.vendas) > 0);
  const unidadesStock = emStock.reduce((a, x) => a + unidadesDisponiveis(x, dados.vendas), 0);
  const custoStock = emStock.reduce((a, x) => a + custoUnitario(x) * unidadesDisponiveis(x, dados.vendas), 0);
  const vendas = itens.flatMap((x) => vendasDe(x).map((v) => ({ v, x })));
  const unidadesVendidas = vendas.reduce((a, { v }) => a + v.quantidade, 0);
  const lucro = vendas.reduce((a, { v, x }) => a + lucroVenda(v, x), 0);
  // O plano/anúncio do grupo: o da unidade anunciada, senão o da mais antiga em stock
  const principal = emStock.find((x) => x.estado === 'anunciado') ?? emStock[0];
  const nomes = new Set(itens.map((x) => x.nome.trim().toLowerCase()));

  const ids_ = itens.map((x) => x.id);
  return (
    <Janela
      titulo={`${p.nome}${nomes.size > 1 ? ' e variantes' : ''}`}
      aoFechar={aoFechar}
      larga
      rodape={
        <>
          <span className="espaco" />
          {emStock.some((x) => x.estado === 'anunciado') && (
            <button className="btn" onClick={() => abrir({ tipo: 'anunciar', ids: ids_, retirar: true })}>Retirar</button>
          )}
          {emStock.some((x) => x.estado === 'por_anunciar') && !emStock.some((x) => x.estado === 'anunciado') && (
            <button className="btn" onClick={() => abrir({ tipo: 'anunciar', ids: ids_ })}>Anunciar</button>
          )}
          {emStock.length > 0 && (
            <button className="btn btn-primario" onClick={() => abrir({ tipo: 'vendi', ids: ids_ })}>Vendi</button>
          )}
        </>
      }
    >
      {/* Imagem no mesmo enquadramento do detalhe do produto */}
      <div className="fotos-com-acoes fotos-sem-acoes">
        <div className="fotos-galeria">
          {p.fotos[0] ? <Foto refFoto={p.fotos[0]} alt={p.nome} /> : <ImagemReferencia url={urlReferencia(p, true) ?? imagemReferencia(p, true)} alt={p.nome} />}
        </div>
      </div>
      {p.set_numero && urlReferencia(p) && (
        <p className="links-set mudo">
          <a href={urlVinted(p.set_numero, produtoNovo(p))} target="_blank" rel="noreferrer">Vinted</a> ·{' '}
          <a href={urlEbayVendidos(p.set_numero, produtoNovo(p))} target="_blank" rel="noreferrer">Vendidos no eBay</a> ·{' '}
          <a href={`https://brickset.com/sets/${encodeURIComponent(p.set_numero)}-1`} target="_blank" rel="noreferrer">Brickset</a>
        </p>
      )}

      {/* Resumo do grupo */}
      <dl className="anuncio-numeros grupo-resumo">
        <div>
          <dt>Em stock</dt>
          <dd>
            <strong>{plural(unidadesStock, 'unidade', 'unidades')}</strong>
            {unidadesStock > 0 && <span className="mudo"> · média {fmtEuro(custoStock / unidadesStock)}</span>}
          </dd>
        </div>
        <div>
          <dt>Vendidas</dt>
          <dd>
            <strong>{unidadesVendidas}</strong>
            {unidadesVendidas > 0 && <> · <Valor n={lucro} sinal /></>}
          </dd>
        </div>
      </dl>

      {principal && <LinhaPlano p={principal} />}

      <TabelaProdutos itens={itens} />
    </Janela>
  );
}


/**
 * Tabela com UMA LINHA POR UNIDADE (pedido do Ricardo: o n.º de linhas tem de bater certo com as
 * unidades), usada no detalhe do grupo e no detalhe de um produto. Um produto com 3 unidades e 1
 * vendida dá 3 linhas: a vendida (data, conta e lucro dessa venda) e as 2 que sobram (a 1.ª
 * "Anunciado" se o produto está anunciado, porque se anuncia 1 de cada vez; as outras "Por
 * anunciar"). Colunas: data de compra (com condição e quem pagou), custo por unidade, estado e
 * lucro. Tocar numa linha abre esse produto; numa linha vendida do produto já aberto (atual),
 * abre a venda para editar.
 */
export function TabelaProdutos({ itens, atual }: { itens: Produto[]; atual?: string }) {
  const { dados, nomeConta, nomePagador } = useDados();
  const abrir = useAbrir();

  interface Linha {
    chave: string;
    p: Produto;
    venda?: Venda;
    estado: [string, string];
  }
  const linhas: Linha[] = [];
  for (const x of itens) {
    const vendas = dados.vendas.filter((v) => v.produto_id === x.id && vendaValida(v)).sort((a, b) => a.data_venda.localeCompare(b.data_venda));
    // Unidades vendidas: uma linha por unidade de cada venda
    for (const v of vendas)
      for (let u = 0; u < Math.max(v.quantidade, 1); u++)
        linhas.push({ chave: `${v.id}-${u}`, p: x, venda: v, estado: [`Vendido ${dataCurta(v.data_venda)}`, v.conta_id ? nomeConta(v.conta_id) : ''] });
    // Unidades que sobram
    const disp = unidadesDisponiveis(x, dados.vendas);
    for (let u = 0; u < disp; u++) {
      const anunciada = x.estado === 'anunciado' && u === 0;
      linhas.push({
        chave: `${x.id}-s${u}`,
        p: x,
        estado: anunciada
          ? ['Anunciado', [x.conta_id ? nomeConta(x.conta_id) : '', x.preco_anuncio ? fmtEuro(x.preco_anuncio) : ''].filter(Boolean).join(' · ')]
          : ['Por anunciar', ''],
      });
    }
    // Devolvidos/cancelados (sem unidades disponíveis nem vendas): uma linha com o estado
    if (!vendas.length && !disp)
      linhas.push({ chave: x.id, p: x, estado: [x.estado === 'devolvido' ? 'Devolvido' : x.estado === 'cancelado' ? 'Cancelado' : x.estado, ''] });
  }

  const tocar = (l: Linha) => {
    if (l.p.id !== atual) return abrir({ tipo: 'detalhe', id: l.p.id });
    if (l.venda) abrir({ tipo: 'venda', id: l.venda.id });
  };

  return (
    <div className="tabela-scroll">
      <table className="tabela tabela-grupo">
        <thead>
          <tr>
            <th>Compra</th>
            <th className="num">Custo</th>
            <th>Estado</th>
            <th className="num">Lucro</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const q = Math.max(l.venda?.quantidade ?? 1, 1);
            return (
              <tr key={l.chave} className={`clicavel ${l.p.id === atual ? 'linha-atual' : ''}`} onClick={() => tocar(l)}>
                <td>
                  {dataCurta(l.p.data_compra)}
                  <small className="mudo bloco">{[l.p.condicao, nomePagador(l.p)].filter((t) => t && t !== '—').join(' · ')}</small>
                </td>
                <td className="num">{fmtEuro(custoUnitario(l.p))}</td>
                <td>
                  {l.estado[0]}
                  {l.estado[1] && <small className="mudo bloco">{l.estado[1]}</small>}
                </td>
                <td className="num">
                  {l.venda ? (
                    <>
                      <Valor n={lucroVenda(l.venda, l.p) / q} sinal />
                      <small className="mudo bloco">{fmtEuro(liquidoVenda(l.venda) / q)}</small>
                    </>
                  ) : (
                    <span className="mudo">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
