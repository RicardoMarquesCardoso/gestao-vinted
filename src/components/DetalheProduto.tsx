// Janela de detalhe de um produto: fotografias, imagem oficial, plano (vender/guardar),
// ciclo de vida do set (lançamento, retirada e PVP, do Brickset), links (LEGO, Brickset, Vinted), dados da compra, vendas feitas e botões de ação (✏️ editar, 📷, Anunciar/Retirar, Vendi).
// As vendas mostram também as dos outros exemplares do mesmo set (com o valor e o lucro de cada
// uma), e "Em stock" lista os exemplares desse set que ainda estão por vender.

import { LinhaPlano, LinhaPokemon } from './planos';
import { PartilharFotos } from './fotos';
import { ehPokemon } from '../lib/plano';
import { urlVinted } from '../lib/avaliar';
import { produtoNovo } from '../lib/anuncio';
import { custoTotalProduto, custoUnitario, diasEntre, emInventario, liquidoVenda, lucroVenda, unidadesDisponiveis } from '../lib/calc';
import { fmtData, fmtEuro, fmtMesAno, hoje } from '../lib/format';
import { infoMercado, useMercado } from '../lib/investimento';
import { useDados } from '../state';
import { useAbrir } from './acoes';
import { compararNomes, useCatalogoSets } from './catalogo';
import { CHAVE_MANTIDOS } from '../pages/ReverNomes';
import { useState } from 'react';
import { EtiquetaProduto, EtiquetaVenda, Foto, ImagemReferencia, Janela, Valor, prepararFoto, urlReferencia, useImagemReferencia } from './ui';

export function DetalheProduto({ id, aoFechar }: { id: string; aoFechar(): void }) {
  const { dados, nomeConta, nomePagador, store, guardar, aviso, lista } = useDados();
  const procurarSet = useCatalogoSets();
  const mercado = useMercado();
  const [aEnviar, setAEnviar] = useState(false);
  const abrir = useAbrir();
  const imagemReferencia = useImagemReferencia();
  const p = dados.produtos.find((x) => x.id === id);
  if (!p) return null;
  // Ciclo de vida do set (Brickset): quando saiu, quando foi/será retirado e o PVP
  const ciclo = p.set_numero && (!p.marca || /lego/i.test(p.marca)) ? infoMercado(mercado, p.set_numero, hoje()) : null;
  const oficial = p.set_numero && (!p.marca || /lego/i.test(p.marca)) ? procurarSet(p.set_numero) : undefined;
  const talvez =
    oficial && compararNomes(p.nome, oficial.nome) === 'diferente' ? procurarSet.parecidos(p.nome, oficial.tema, oficial.ano, oficial.numero) : [];
  // Vendas só deste produto (para o "Lucro até agora")
  const vendas = dados.vendas.filter((v) => v.produto_id === p.id);
  const compra = p.compra_id ? dados.compras.find((c) => c.id === p.compra_id) : undefined;
  const disponiveis = unidadesDisponiveis(p, dados.vendas);
  const lucro = vendas.reduce((a, v) => a + lucroVenda(v, p), 0);
  const iguais = p.set_numero
    ? dados.produtos.filter((x) => x.id !== p.id && x.set_numero?.trim().toLowerCase() === p.set_numero?.trim().toLowerCase())
    : [];
  // Vendas deste produto e dos outros exemplares do mesmo set, das mais recentes para as mais antigas.
  // Cada venda leva o produto a que pertence, para calcular o lucro com o custo certo.
  const produtosDoSet = [p, ...iguais];
  const vendasDoSet = dados.vendas
    .filter((v) => produtosDoSet.some((x) => x.id === v.produto_id))
    .map((v) => ({ v, dono: produtosDoSet.find((x) => x.id === v.produto_id)! }))
    .sort((a, b) => b.v.data_venda.localeCompare(a.v.data_venda));
  // Outros exemplares que ainda têm unidades por vender (os vendidos já aparecem nas vendas)
  const emStock = iguais.filter((x) => unidadesDisponiveis(x, dados.vendas) > 0);

  // Tirar/escolher uma fotografia e acrescentá-la ao produto
  async function adicionarFoto(ficheiros: FileList | null) {
    if (!ficheiros?.length || !p) return;
    setAEnviar(true);
    try {
      const novas: string[] = [];
      for (const f of Array.from(ficheiros)) {
        const { original, miniatura } = await prepararFoto(f, store.modo === 'demo');
        novas.push(await store.enviarFoto(p.id, original, miniatura));
      }
      await guardar('produtos', [{ ...p, fotos: [...p.fotos, ...novas] }]);
      aviso('Fotografia adicionada.');
    } catch (e) {
      aviso(`Não foi possível enviar a fotografia: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <Janela
      titulo={p.nome}
      aoFechar={aoFechar}
      larga
      rodape={
        <>
          <button className="btn" title="Editar" aria-label="Editar" onClick={() => abrir({ tipo: 'produto', id: p.id })}>
            ✏️
          </button>
          <label className="btn">
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => adicionarFoto(e.target.files)} />
            {aEnviar ? '…' : '📷'}
          </label>
          <span className="espaco" />
          {p.estado === 'por_anunciar' && (
            <button className="btn" onClick={() => abrir({ tipo: 'anunciar', ids: [p.id] })}>
              Anunciar
            </button>
          )}
          {p.estado === 'anunciado' && (
            <button className="btn" onClick={() => abrir({ tipo: 'anunciar', ids: [p.id], retirar: true })}>
              Retirar
            </button>
          )}
          {disponiveis > 0 && (
            <button className="btn btn-primario" onClick={() => abrir({ tipo: 'vendi', ids: [p.id] })}>
              Vendi
            </button>
          )}
        </>
      }
    >
      {p.fotos.length > 0 && (
        <>
          <div className="fotos-galeria">
            {p.fotos.map((r) => (
              <Foto key={r} refFoto={r} alt={p.nome} />
            ))}
          </div>
          {/* Partilhar (ex.: para a Vinted) ou descarregar as fotografias com boa qualidade */}
          <PartilharFotos p={p} />
        </>
      )}
      {p.fotos.length === 0 && urlReferencia(p) && (
        <figure className="referencia">
          <ImagemReferencia url={urlReferencia(p, true)} alt={`Set ${p.set_numero}`} className="referencia-img" />
          <figcaption className="mudo">
            Imagem de referência do set ·{' '}
            <a href={`https://www.lego.com/pt-pt/search?q=${encodeURIComponent(p.set_numero ?? '')}`} target="_blank" rel="noreferrer">site da LEGO</a> ·{' '}
            <a href={`https://brickset.com/sets/${encodeURIComponent(p.set_numero ?? '')}-1`} target="_blank" rel="noreferrer">Brickset</a> ·{' '}
            {/* Pesquisa deste set na Vinted, mais baratos primeiro, mesma condição (só um link; a app não lê a Vinted) */}
            <a href={urlVinted(p.set_numero ?? '', produtoNovo(p))} target="_blank" rel="noreferrer">Vinted</a>
          </figcaption>
        </figure>
      )}
      {/* Pokémon: imagem do produto no TCGplayer (se já se sabe qual é); some se não carregar */}
      {p.fotos.length === 0 && !urlReferencia(p) && imagemReferencia(p, true) && (
        <figure className="referencia">
          <ImagemReferencia url={imagemReferencia(p, true)} alt={p.nome} className="referencia-img" />
          <figcaption className="mudo">Imagem de referência · TCGplayer</figcaption>
        </figure>
      )}
      {oficial && compararNomes(p.nome, oficial.nome) !== 'igual' && !lista(CHAVE_MANTIDOS).includes((p.set_numero ?? '').trim()) && (
        <div className={`sugestao-nome ${talvez.length ? 'sugestao-alerta' : ''}`}>
          <span>
            {talvez.length ? '⚠️ O set ' + p.set_numero + ' chama-se ' : 'Nome oficial: '}
            <strong>{oficial.nome}</strong>
            {talvez.length ? `. Será o ${talvez[0].numero} (${talvez[0].nome})?` : ''}
          </span>
          {talvez.length ? (
            <button className="link" onClick={() => guardar('produtos', [{ ...p, set_numero: talvez[0].numero }])}>
              Mudar n.º
            </button>
          ) : (
            <button className="link" onClick={() => guardar('produtos', [{ ...p, nome: oficial.nome }])}>
              Usar
            </button>
          )}
        </div>
      )}
      <div className="detalhe-topo">
        <EtiquetaProduto estado={p.estado} />
        {p.set_numero && <span className="chip">Set {p.set_numero}</span>}
        {p.marca && <span className="chip">{p.marca}</span>}
        {p.tema && <span className="chip">{p.tema}</span>}
        {p.condicao && <span className="chip">{p.condicao}</span>}
      </div>
      {p.descricao && <p>{p.descricao}</p>}

      {emInventario(p) && disponiveis > 0 && ehPokemon(p) && <LinhaPokemon p={p} />}
      {emInventario(p) && disponiveis > 0 && <LinhaPlano p={p} />}
      <dl className="detalhes">
        {ciclo && (ciclo.lancamento || ciclo.retirada || ciclo.retirado !== null) && (
          <div>
            <dt>Ciclo do set</dt>
            <dd>
              {[
                ciclo.lancamento && `lançado ${fmtMesAno(ciclo.lancamento)}`,
                ciclo.retirada
                  ? ciclo.retirado
                    ? `retirado ${fmtMesAno(ciclo.retirada)}`
                    : `retirada prevista ${fmtMesAno(ciclo.retirada)}`
                  : ciclo.retirado
                    ? 'já retirado'
                    : ciclo.retirado === false
                      ? 'ainda à venda'
                      : null,
                ciclo.pvp && `PVP ${fmtEuro(ciclo.pvp)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        )}
        <div><dt>Quantidade</dt><dd>{p.quantidade} ({disponiveis} {disponiveis === 1 ? 'disponível' : 'disponíveis'})</dd></div>
        <div><dt>Custo total</dt><dd>{fmtEuro(custoTotalProduto(p))}{p.quantidade > 1 ? ` · ${fmtEuro(custoUnitario(p))}/un.` : ''}</dd></div>
        <div><dt>Compra</dt><dd>{fmtEuro(p.preco_compra)} + {fmtEuro(p.custos_adicionais)} de custos</dd></div>
        <div><dt>Comprado em</dt><dd>{fmtData(p.data_compra)}{compra?.vendedor ? ` · ${compra.vendedor}` : ''}</dd></div>
        <div><dt>Quem pagou</dt><dd>{nomePagador(p)}</dd></div>
        <div><dt>Conta</dt><dd>{nomeConta(p.conta_id)}</dd></div>
        <div>
          <dt>Anunciado</dt>
          <dd>
            {p.data_anuncio ? `${fmtData(p.data_anuncio)} (há ${diasEntre(p.data_anuncio, hoje())} dias)` : '—'}
            {p.preco_anuncio ? ` · ${fmtEuro(p.preco_anuncio)}` : ''}
          </dd>
        </div>
        <div><dt>Lucro até agora</dt><dd><Valor n={lucro} sinal /></dd></div>
      </dl>
      {p.notas && <p className="nota">{p.notas}</p>}

      <h4 className="secao-form">Vendas</h4>
      {vendasDoSet.length === 0 ? (
        <p className="mudo">Ainda sem vendas.</p>
      ) : (
        <ul className="lista-simples">
          {vendasDoSet.map(({ v, dono }) => (
            <li key={v.id}>
              <button className="linha-botao" onClick={() => abrir({ tipo: 'venda', id: v.id })}>
                <span>
                  {fmtData(v.data_venda)} · {nomeConta(v.conta_id)}
                  {v.quantidade > 1 ? ` · ${v.quantidade} un.` : ''}
                  {dono.id !== p.id ? <span className="mudo"> · outro exemplar</span> : null}
                </span>
                <span className="linha-direita">
                  <EtiquetaVenda estado={v.estado} /> {fmtEuro(liquidoVenda(v))} <Valor n={lucroVenda(v, dono)} sinal />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {emStock.length > 0 && (
        <>
          <h4 className="secao-form">Em stock</h4>
          <ul className="lista-simples">
            {emStock.map((x) => (
              <li key={x.id}>
                <button className="linha-botao" onClick={() => abrir({ tipo: 'detalhe', id: x.id })}>
                  <span>{x.nome} · {fmtData(x.data_compra)}</span>
                  <span className="linha-direita">
                    <EtiquetaProduto estado={x.estado} /> custo {fmtEuro(custoUnitario(x))}/un.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Janela>
  );
}
