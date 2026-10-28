// Formulário "Registar compra": a única forma de entrar produtos na app.
//
// Uma compra tem data, quem pagou, valor, portes e uma ou mais linhas de produtos.
// O custo de cada produto é calculado por distribuirCompra (lib/calc.ts): divide o valor
// em partes iguais ou usa o preço de cada linha, e reparte os portes proporcionalmente.
// Escrever o n.º do set preenche o nome e o tema a partir do catálogo.

import { useState } from 'react';
import { arred, distribuirCompra, estadoAposVendas } from '../lib/calc';
import { fmtEuro, hoje, lerNumero } from '../lib/format';
import type { Compra, Distribuicao, Produto } from '../lib/types';
import { useDados } from '../state';
import { paraCampo, vazioANull } from './acoes';
import { Campo, Dinheiro, Janela, SelecionarPagador, TextoSugerido, lerPagador, useConfirmar, valorPagador , EscolherOuEscrever, ImagemReferencia, NomeComSugestoes, urlReferencia, IconeLixo } from './ui';
import { useCatalogo, useInfoPorSet } from './catalogo';

interface Item {
  id: string;
  novo: boolean;
  nome: string;
  set_numero: string;
  condicao: string;
  marca: string;
  tema: string;
  auto?: string; // nome preenchido automaticamente pelo n.º de set
  quantidade: string;
  preco: string;
}

export function FormCompra({ id, aoFechar }: { id?: string; aoFechar(): void }) {
  const { dados, guardar, apagar, lista, aviso } = useDados();
  const confirmar = useConfirmar();
  const catalogo = useCatalogo();
  const infoSet = useInfoPorSet();
  const existente = dados.compras.find((c) => c.id === id);
  const produtosAtuais = existente ? dados.produtos.filter((p) => p.compra_id === existente.id) : [];

  const [f, setF] = useState(() => ({
    data: existente?.data ?? hoje(),
    pagador: existente ? valorPagador(existente) : '',
    metodo_pagamento: existente?.metodo_pagamento ?? '',
    vendedor: existente?.vendedor ?? '',
    distribuicao: (existente?.distribuicao ?? 'individual') as Distribuicao,
    valor_artigos: paraCampo(existente?.valor_artigos),
    portes: paraCampo(existente?.portes),
    outros_custos: paraCampo(existente?.outros_custos),
    notas: existente?.notas ?? '',
  }));
  const itemVazio = (): Item => ({ id: crypto.randomUUID(), novo: true, nome: '', set_numero: '', condicao: '', marca: 'LEGO', tema: '', quantidade: '1', preco: '' });
  const [itens, setItens] = useState<Item[]>(() =>
    produtosAtuais.length
      ? produtosAtuais.map((p) => ({
          id: p.id,
          novo: false,
          nome: p.nome,
          set_numero: p.set_numero ?? '',
          condicao: p.condicao ?? '',
          marca: p.marca ?? '',
          tema: p.tema ?? '',
          quantidade: String(p.quantidade),
          preco: paraCampo(p.preco_compra),
        }))
      : [itemVazio()],
  );
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

  // Retirar uma linha de produto (se já tiver vendas, pede confirmação)
  async function removerItem(i: number) {
    const item = itens[i];
    if (!item.novo && dados.vendas.some((v) => v.produto_id === item.id))
      return aviso('Este produto já tem vendas e não pode ser retirado da compra.', 'erro');
    setItens((xs) => (xs.length === 1 ? [itemVazio()] : xs.filter((_, j) => j !== i)));
  }

  // Guardar a compra e criar/atualizar os produtos, com o custo de cada um repartido
  async function submeter() {
    if (!validos.length) return aviso('Acrescenta pelo menos um produto com nome.', 'erro');
    const compra: Compra = {
      id: existente?.id ?? crypto.randomUUID(),
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
    const removidos = produtosAtuais.filter((p) => !validos.some((i) => i.id === p.id));
    if (removidos.length) {
      const ok = await confirmar({
        titulo: 'Retirar produtos',
        texto: `Vais apagar ${removidos.length} produto(s) desta compra: ${removidos.map((p) => p.nome).join(', ')}. Continuar?`,
        botao: 'Continuar',
        perigo: true,
      });
      if (!ok) return;
    }
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
      // Se a quantidade mudou, o estado (vendido / por vender) pode mudar também
      return atual ? { ...p, estado: estadoAposVendas(p, dados.vendas) } : p;
    });
    setAGuardar(true);
    try {
      await guardar('compras', [compra]);
      await guardar('produtos', produtos);
      for (const p of removidos) await apagar('produtos', p.id);
      aviso(existente ? 'Compra atualizada.' : `Compra registada com ${produtos.length} produto(s).`);
      aoFechar();
    } catch (e) {
      aviso(`Erro ao guardar: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAGuardar(false);
    }
  }

  // Apagar a compra e os seus produtos (só se nenhum tiver vendas)
  async function eliminar() {
    if (!existente) return;
    if (produtosAtuais.some((p) => dados.vendas.some((v) => v.produto_id === p.id)))
      return aviso('Há produtos desta compra com vendas registadas. Não é possível apagar a compra.', 'erro');
    const ok = await confirmar({
      titulo: 'Apagar compra',
      texto: `Vais apagar esta compra de ${fmtEuro(total)} e os ${produtosAtuais.length} produto(s) associados. Fica registado no histórico. Continuar?`,
      botao: 'Apagar compra',
      perigo: true,
    });
    if (!ok) return;
    try {
      for (const p of produtosAtuais) await apagar('produtos', p.id);
      await apagar('compras', existente.id);
      aviso('Compra apagada.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao apagar: ${e instanceof Error ? e.message : e}`, 'erro');
    }
  }

  return (
    <Janela
      titulo={existente ? 'Editar compra' : 'Nova compra'}
      aoFechar={aoFechar}
      larga
      rodape={
        <>
          {existente && (
            <button className="btn btn-perigo-texto" onClick={eliminar}>
              Apagar
            </button>
          )}
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
        <Campo rotulo="Quem pagou">
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
