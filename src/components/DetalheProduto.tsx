// Janela de detalhe de um produto: fotografias, imagem oficial, plano (vender/guardar),
// ciclo de vida do set (lançamento, retirada e PVP, do Brickset), links (LEGO, Brickset, Vinted), dados da compra, vendas feitas e botões de ação (✏️ editar, 🗑 apagar, Anunciar/Retirar, Vendi).
// As vendas mostram também as dos outros exemplares do mesmo set (com o valor e o lucro de cada
// uma), e "Em stock" lista os exemplares desse set que ainda estão por vender.

import { LinhaPlano, LinhaPokemon } from './planos';
import { AdicionarFotos, PartilharFotos } from './fotos';
import { ehPokemon } from '../lib/plano';
import { urlEbayVendidos, urlVinted } from '../lib/avaliar';
import { produtoNovo } from '../lib/anuncio';
import { custoTotalProduto, custoUnitario, diasEntre, emInventario, liquidoVenda, lucroVenda, unidadesDisponiveis } from '../lib/calc';
import { fmtData, fmtEuro, fmtMesAno, hoje } from '../lib/format';
import { infoMercado, useMercado } from '../lib/investimento';
import { useDados } from '../state';
import { useAbrir } from './acoes';
import { compararNomes, useCatalogoSets } from './catalogo';
import { CHAVE_MANTIDOS } from '../pages/ReverNomes';
import { useState } from 'react';
import { EtiquetaProduto, EtiquetaVenda, Foto, IconeLixo, ImagemReferencia, Janela, Valor, prepararFoto, urlReferencia, useConfirmar, useImagemReferencia } from './ui';

export function DetalheProduto({ id, aoFechar }: { id: string; aoFechar(): void }) {
  const { dados, nomeConta, nomePagador, store, guardar, apagar, aviso, lista } = useDados();
  const confirmar = useConfirmar();
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
      aviso(novas.length === 1 ? 'Fotografia adicionada.' : `${novas.length} fotografias adicionadas.`);
    } catch (e) {
      aviso(`Não foi possível enviar a fotografia: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAEnviar(false);
    }
  }

  /**
   * Apagar um produto inserido por engano (com confirmação). Não se apagam produtos com vendas:
   * aí apagam-se primeiro as vendas, ou muda-se o estado para "Cancelado". As fotografias dele
   * também são apagadas do Storage (original e miniatura). Fica registado no histórico.
   */
  async function apagarProduto() {
    if (!p) return;
    if (vendas.length) return aviso('Este produto tem vendas registadas. Apaga primeiro as vendas, ou muda o estado para "Cancelado".', 'erro');
    const ok = await confirmar({
      titulo: 'Apagar produto',
      texto: `Vais apagar "${p.nome}" (custo ${fmtEuro(custoTotalProduto(p))}${p.fotos.length ? ` e ${p.fotos.length === 1 ? 'a fotografia' : `as ${p.fotos.length} fotografias`}` : ''}). Fica registado no histórico de alterações. Continuar?`,
      botao: 'Apagar produto',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apagar('produtos', p.id);
      // Cada foto: a original e a miniatura (store.apagarFoto com um caminho apaga as duas)
      for (const f of p.fotos) store.apagarFoto(f).catch(() => undefined);
      aviso('Produto apagado.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao apagar: ${e instanceof Error ? e.message : e}`, 'erro');
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
          <button className="btn btn-lixo" title="Apagar produto" aria-label="Apagar produto" onClick={apagarProduto}>
            <IconeLixo />
          </button>
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
      {/* Fotografias: quadrado com 3/4 da largura (cortadas se for preciso), igual em todos os
          produtos; sem fotos nossas, a imagem de referência (set LEGO ou TCGplayer). No 1/4 à
          direita, só ícones, de cima para baixo: adicionar, descarregar e partilhar (estes dois só
          com fotos nossas). Com várias fotos, desliza-se para o lado. */}
      <div className="fotos-com-acoes">
        <div className="fotos-galeria">
          {p.fotos.length > 0 ? (
            p.fotos.map((r) => <Foto key={r} refFoto={r} alt={p.nome} />)
          ) : (
            <ImagemReferencia url={urlReferencia(p, true) ?? imagemReferencia(p, true)} alt={p.nome} />
          )}
        </div>
        <div className="acoes-fotos-coluna">
          <AdicionarFotos aEnviar={aEnviar} enviar={adicionarFoto} />
          {p.fotos.length > 0 && <PartilharFotos p={p} vertical />}
        </div>
      </div>
      {p.fotos.length === 0 && (urlReferencia(p) || imagemReferencia(p, true)) && (
        <p className="legenda-referencia mudo">Imagem de referência{urlReferencia(p) ? ' do set' : ' · TCGplayer'}</p>
      )}
      {/* Links para ver o set noutros sites (só links; a app não lê nada desses sites). Vinted e eBay
          vendidos na Europa, com a mesma condição do produto (novo → só novos). */}
      {urlReferencia(p) && p.set_numero && (
        <p className="links-set mudo">
          <a href={urlVinted(p.set_numero, produtoNovo(p))} target="_blank" rel="noreferrer">Vinted</a> ·{' '}
          <a href={urlEbayVendidos(p.set_numero, produtoNovo(p))} target="_blank" rel="noreferrer">Vendidos no eBay</a> ·{' '}
          <a href={`https://brickset.com/sets/${encodeURIComponent(p.set_numero)}-1`} target="_blank" rel="noreferrer">Brickset</a> ·{' '}
          <a href={`https://www.lego.com/pt-pt/search?q=${encodeURIComponent(p.set_numero)}`} target="_blank" rel="noreferrer">LEGO</a>
        </p>
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
