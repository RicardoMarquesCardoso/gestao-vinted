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
import type { Produto } from '../lib/types';
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
      <p className="nota">Toca numa linha para ver ou editar esse produto.</p>
    </Janela>
  );
}


/**
 * Tabela com um produto por linha (usada no detalhe do grupo e no detalhe de um produto):
 * data de compra (com unidades, condição e quem pagou), custo por unidade, estado (por anunciar /
 * anunciado na conta X a Y € / vendido em dd/mm na conta X) e o lucro das vendas, com o valor
 * recebido por baixo. Tocar numa linha abre o detalhe desse produto; na linha do produto que já
 * está aberto (atual), abre a venda dele para editar, se houver.
 */
export function TabelaProdutos({ itens, atual }: { itens: Produto[]; atual?: string }) {
  const { dados, nomeConta, nomePagador } = useDados();
  const abrir = useAbrir();
  const vendasDe = (x: Produto) =>
    dados.vendas.filter((v) => v.produto_id === x.id && vendaValida(v)).sort((a, b) => b.data_venda.localeCompare(a.data_venda));

  /** Estado de um produto em duas partes: principal ("Anunciado") e pormenor ("RM1 · 55 €"). */
  const estado = (x: Produto): [string, string] => {
    const disp = unidadesDisponiveis(x, dados.vendas);
    const vendidas = vendasDe(x).reduce((a, v) => a + v.quantidade, 0);
    const extraVendidas = vendidas && disp ? `${vendidas} vendida${vendidas > 1 ? 's' : ''}` : '';
    if (x.estado === 'anunciado')
      return ['Anunciado', [x.conta_id ? nomeConta(x.conta_id) : '', x.preco_anuncio ? fmtEuro(x.preco_anuncio) : '', extraVendidas].filter(Boolean).join(' · ')];
    if (x.estado === 'por_anunciar') return ['Por anunciar', [disp > 1 ? `${disp} un.` : '', extraVendidas].filter(Boolean).join(' · ')];
    const v = vendasDe(x)[0];
    if (x.estado === 'vendido' && v) return [`Vendido ${dataCurta(v.data_venda)}`, v.conta_id ? nomeConta(v.conta_id) : ''];
    return [x.estado === 'devolvido' ? 'Devolvido' : x.estado === 'cancelado' ? 'Cancelado' : x.estado, ''];
  };

  const tocar = (x: Produto) => {
    if (x.id !== atual) return abrir({ tipo: 'detalhe', id: x.id });
    const v = vendasDe(x)[0];
    if (v) abrir({ tipo: 'venda', id: v.id });
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
          {itens.map((x) => {
            const vs = vendasDe(x);
            const l = vs.reduce((a, v) => a + lucroVenda(v, x), 0);
            const [e1, e2] = estado(x);
            return (
              <tr key={x.id} className={`clicavel ${x.id === atual ? 'linha-atual' : ''}`} onClick={() => tocar(x)}>
                <td>
                  {dataCurta(x.data_compra)}
                  <small className="mudo bloco">
                    {[x.quantidade > 1 ? `${x.quantidade} un.` : null, x.condicao, nomePagador(x)].filter((t) => t && t !== '—').join(' · ')}
                  </small>
                </td>
                <td className="num">{fmtEuro(custoUnitario(x))}</td>
                <td>
                  {e1}
                  {e2 && <small className="mudo bloco">{e2}</small>}
                </td>
                <td className="num">
                  {vs.length ? (
                    <>
                      <Valor n={l} sinal />
                      <small className="mudo bloco">{fmtEuro(vs.reduce((a, v) => a + liquidoVenda(v), 0))}</small>
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
