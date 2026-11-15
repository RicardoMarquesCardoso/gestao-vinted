// Formulário "Registar compra": a única forma de entrar produtos na app.
//
// Uma compra tem data, quem pagou, valor, portes e uma ou mais linhas de produtos, registados todos
// numa só operação. Todos os produtos herdam a data e o pagador da compra (produtos pagos por pessoas
// diferentes registam-se em compras separadas).
// O custo de cada produto é calculado por distribuirCompra (lib/calc.ts): divide o valor
// em partes iguais ou usa o preço de cada linha, e reparte os portes proporcionalmente.
// UMA COMPRA NÃO SE EDITA DEPOIS DE REGISTADA (decisão do Ricardo, nov/2026): qualquer correção
// (pagador, custo, data…) faz-se em cada produto, no Editar produto. O total de uma compra é sempre
// a soma dos seus produtos (totalCompra).
// Escrever o n.º do set preenche o nome e o tema a partir do catálogo.

import { useState } from 'react';
import { arred, distribuirCompra, estadoAposVendas } from '../lib/calc';
import { fmtEuro, hoje, lerNumero } from '../lib/format';
import type { Compra, Distribuicao, Produto } from '../lib/types';
import { useDados } from '../state';
import { vazioANull } from './acoes';
import { Campo, Dinheiro, Janela, SelecionarPagador, TextoSugerido, lerPagador, EscolherOuEscrever, ImagemReferencia, NomeComSugestoes, urlReferencia, IconeLixo } from './ui';
import { useCatalogo, useInfoPorSet } from './catalogo';

interface Item {
  id: string;
  nome: string;
  set_numero: string;
  condicao: string;
  marca: string;
  tema: string;
  auto?: string; // nome preenchido automaticamente pelo n.º de set
  quantidade: string;
  preco: string;
}

export function FormCompra({ aoFechar }: { aoFechar(): void }) {
  const { dados, guardar, lista, aviso } = useDados();
  const catalogo = useCatalogo();
  const infoSet = useInfoPorSet();

  const [f, setF] = useState(() => ({
    data: hoje(),
    pagador: '',
    metodo_pagamento: '',
    vendedor: '',
    distribuicao: 'individual' as Distribuicao,
    valor_artigos: '',
    portes: '',
    outros_custos: '',
    notas: '',
  }));
  // Identificador da compra, criado ao abrir o formulário: se uma gravação falhar e se tocar outra
  // vez em Guardar, atualiza-se a mesma compra em vez de criar outra (os produtos já têm
  // identificadores fixos, um por linha).
  const [idCompra] = useState(() => crypto.randomUUID());
  const itemVazio = (): Item => ({ id: crypto.randomUUID(), nome: '', set_numero: '', condicao: '', marca: 'LEGO', tema: '', quantidade: '1', preco: '' });
  const [itens, setItens] = useState<Item[]>(() => [itemVazio()]);
  const [aGuardar, setAGuardar] = useState(false);
  const mudar = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const mudarItem = (i: number, k: keyof Item, v: string) => setItens((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const individual = f.distribuicao === 'individual';
  const valorArtigos = individual ? arred(itens.reduce((a, i) => a + lerNumero(i.preco), 0)) : lerNumero(f.valor_artigos);
  const base = {
    valor_artigos: valorArtigos,
    portes: lerNumero(f.portes),
    outros_custos: lerNumero(f.outros_custos),
    distribuicao: f.distribuicao,
  };
  const validos = itens.filter((i) => i.nome.trim());
  const distribuicao = distribuirCompra(
    base,
    validos.map((i) => ({ quantidade: Math.max(Math.round(lerNumero(i.quantidade)) || 1, 1), preco: lerNumero(i.preco) })),
  );
  const custoDe = (item: Item) => {
    const k = validos.indexOf(item);
    return k >= 0 ? distribuicao[k] : null;
  };
  const total = arred(base.valor_artigos + base.portes + base.outros_custos);

  // Retirar uma linha de produto do formulário
  function removerItem(i: number) {
    setItens((xs) => (xs.length === 1 ? [itemVazio()] : xs.filter((_, j) => j !== i)));
  }

  // Guardar a compra e criar/atualizar os produtos, com o custo de cada um repartido
  async function submeter() {
    if (!validos.length) return aviso('Acrescenta pelo menos um produto com nome.', 'erro');
    // Sem quem pagou, os acertos não sabem a quem devolver o custo: não deixamos guardar.
    if (!f.pagador) return aviso('Indica quem pagou a compra.', 'erro');
    const compra: Compra = {
      id: idCompra,
      data: f.data || hoje(),
      ...lerPagador(f.pagador),
      metodo_pagamento: vazioANull(f.metodo_pagamento),
      vendedor: vazioANull(f.vendedor),
      valor_artigos: base.valor_artigos,
      portes: base.portes,
      outros_custos: base.outros_custos,
      distribuicao: f.distribuicao,
      notas: vazioANull(f.notas),
    };
    const produtos: Produto[] = validos.map((item, k) => {
      const atual = dados.produtos.find((p) => p.id === item.id);
      const p = {
        // valores por omissão para produtos novos
        descricao: null, estado: 'por_anunciar', conta_id: null, data_anuncio: null,
        preco_anuncio: null, notas: null, fotos: [],
        ...atual,
        id: item.id,
        compra_id: compra.id,
        nome: item.nome.trim(),
        set_numero: vazioANull(item.set_numero),
        marca: vazioANull(item.marca),
        tema: vazioANull(item.tema),
        condicao: vazioANull(item.condicao),
        quantidade: Math.max(Math.round(lerNumero(item.quantidade)) || 1, 1),
        data_compra: compra.data,
        pessoa_id: compra.pessoa_id,
        tipo_pagamento: compra.tipo_pagamento,
        preco_compra: distribuicao[k].preco_compra,
        custos_adicionais: distribuicao[k].custos_adicionais,
      } as Produto;
      // Produto já gravado numa tentativa anterior (repetir depois de uma falha): manter o estado coerente
      return atual ? { ...p, estado: estadoAposVendas(p, dados.vendas) } : p;
    });
    setAGuardar(true);
    try {
      await guardar('compras', [compra]);
      await guardar('produtos', produtos);
      aviso(`Compra registada com ${produtos.length} produto(s).`);
      aoFechar();
    } catch (e) {
      aviso(`Erro ao guardar: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Janela
      titulo="Nova compra"
      aoFechar={aoFechar}
      larga
      rodape={
        <>
          <span className="espaco" />
          <span className="total-rodape">Total {fmtEuro(total)}</span>
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={submeter} disabled={aGuardar}>
            {aGuardar ? 'A guardar…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="grelha-form">
        <Campo rotulo="Quem pagou *">
          <SelecionarPagador valor={f.pagador} mudar={(v) => mudar('pagador', v)} />
        </Campo>
        <Campo rotulo="Data">
          <input type="date" value={f.data} onChange={(e) => mudar('data', e.target.value)} />
        </Campo>
      </div>

      <h4 className="secao-form">Produtos</h4>
      <div className="segmentos" role="radiogroup" aria-label="Como distribuir o custo">
        <button role="radio" aria-checked={individual} className={individual ? 'ativo' : ''} onClick={() => mudar('distribuicao', 'individual')}>
          Preço de cada um
        </button>
        <button role="radio" aria-checked={!individual} className={!individual ? 'ativo' : ''} onClick={() => mudar('distribuicao', 'igual')}>
          Dividir valor total
        </button>
      </div>
      {!individual && (
        <div className="grelha-form">
          <Campo rotulo="Valor total dos artigos" ajuda="Dividido pelas unidades">
            <Dinheiro valor={f.valor_artigos} mudar={(v) => mudar('valor_artigos', v)} />
          </Campo>
        </div>
      )}

      <div className="itens-compra">
        {itens.map((item, i) => {
          const c = custoDe(item);
          return (
            <div className="item-compra" key={item.id}>
              <NomeComSugestoes
                className="ic-nome"
                valor={item.nome}
                mudar={(v) => mudarItem(i, 'nome', v)}
                sugestoes={catalogo.sugestoes}
                escolher={(x) => setItens((xs) => xs.map((y, j) => (j === i ? { ...y, nome: x.nome, set_numero: x.set_numero ?? '', marca: x.marca ?? '', tema: x.tema ?? '' } : y)))}
                placeholder="Nome do produto"
              />
              <input
                className="ic-set"
                value={item.set_numero}
                onChange={(e) => {
                  const v = e.target.value;
                  const info = infoSet(v);
                  setItens((xs) =>
                    xs.map((y, j) => {
                      if (j !== i) return y;
                      const automatico = !y.nome || y.nome === y.auto;
                      if (info && automatico) return { ...y, set_numero: v, nome: info.nome, marca: info.marca, tema: info.tema, auto: info.nome };
                      if (!info && y.auto && y.nome === y.auto) return { ...y, set_numero: v, nome: '', auto: undefined };
                      return { ...y, set_numero: v };
                    }),
                  );
                }}
                placeholder="N.º set"
                aria-label="Número do set"
                inputMode="numeric"
              />
              <input className="ic-qtd" value={item.quantidade} onChange={(e) => mudarItem(i, 'quantidade', e.target.value.replace(/\D/g, ''))} aria-label="Quantidade" inputMode="numeric" title="Quantidade" />
              {individual ? (
                <div className="ic-preco">
                  <Dinheiro valor={item.preco} mudar={(v) => mudarItem(i, 'preco', v)} placeholder="Preço" />
                </div>
              ) : (
                <span className="ic-preco ic-calc">{c ? fmtEuro(c.preco_compra) : '—'}</span>
              )}
              {urlReferencia({ marca: item.marca, set_numero: item.set_numero }) && item.nome && (
                <div className="ic-info">
                  <ImagemReferencia url={urlReferencia({ marca: item.marca, set_numero: item.set_numero })} className="ic-img" />
                  <span className="mudo truncar">
                    {item.nome === item.auto ? 'Encontrado: ' : ''}
                    {item.nome}
                  </span>
                </div>
              )}
              <EscolherOuEscrever className="ic-cat" valor={item.marca} mudar={(v) => mudarItem(i, 'marca', v)} opcoes={catalogo.marcas} placeholder="Categoria" ariaLabel="Categoria" />
              <EscolherOuEscrever className="ic-tema" valor={item.tema} mudar={(v) => mudarItem(i, 'tema', v)} opcoes={catalogo.temasDe(item.marca)} placeholder="Subcategoria" ariaLabel="Subcategoria" />
              <span className="ic-custo" title="Custo final com portes e outros custos distribuídos">
                {c ? `= ${fmtEuro(c.preco_compra + c.custos_adicionais)}` : ''}
              </span>
              <button className="btn-icone" onClick={() => removerItem(i)} aria-label="Tirar produto" title="Tirar produto">
                <IconeLixo />
              </button>
            </div>
          );
        })}
        <button className="btn btn-secundario" onClick={() => setItens((xs) => [...xs, itemVazio()])}>
          + Acrescentar produto
        </button>
      </div>

      <div className="grelha-form grelha-portes">
        <Campo rotulo="Portes" ajuda="Repartidos pelos produtos">
          <Dinheiro valor={f.portes} mudar={(v) => mudar('portes', v)} />
        </Campo>
      </div>

      <details className="mais-detalhes">
        <summary>Mais detalhes</summary>
        <div className="grelha-form">
          <Campo rotulo="Comprado a / onde">
            <input value={f.vendedor} onChange={(e) => mudar('vendedor', e.target.value)} placeholder="Ex.: Vinted — utilizador" />
          </Campo>
          <Campo rotulo="Método de pagamento">
            <TextoSugerido id="l-metodos" valor={f.metodo_pagamento} mudar={(v) => mudar('metodo_pagamento', v)} sugestoes={lista('metodos_pagamento')} />
          </Campo>
          <Campo rotulo="Outros custos" ajuda="Taxas, proteção do comprador…">
            <Dinheiro valor={f.outros_custos} mudar={(v) => mudar('outros_custos', v)} />
          </Campo>
          <Campo rotulo="Notas" largo>
            <textarea rows={2} value={f.notas} onChange={(e) => mudar('notas', e.target.value)} placeholder="Referência do pagamento, link da conversa…" />
          </Campo>
        </div>
      </details>
    </Janela>
  );
}
