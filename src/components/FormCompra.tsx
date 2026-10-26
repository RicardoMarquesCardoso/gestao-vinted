import { useState } from 'react';
import { arred, distribuirCompra, estadoAposVendas } from '../lib/calc';
import { fmtEuro, hoje, lerNumero } from '../lib/format';
import type { Compra, Distribuicao, Produto } from '../lib/types';
import { useDados } from '../state';
import { paraCampo, vazioANull } from './acoes';
import { Campo, Dinheiro, Janela, SelecionarPessoa, TextoSugerido, useConfirmar } from './ui';

interface Item {
  id: string;
  novo: boolean;
  nome: string;
  set_numero: string;
  condicao: string;
  quantidade: string;
  preco: string;
}

export function FormCompra({ id, aoFechar }: { id?: string; aoFechar(): void }) {
  const { dados, guardar, apagar, lista, aviso } = useDados();
  const confirmar = useConfirmar();
  const existente = dados.compras.find((c) => c.id === id);
  const produtosAtuais = existente ? dados.produtos.filter((p) => p.compra_id === existente.id) : [];

  const [f, setF] = useState(() => ({
    data: existente?.data ?? hoje(),
    pessoa_id: existente?.pessoa_id ?? '',
    metodo_pagamento: existente?.metodo_pagamento ?? '',
    vendedor: existente?.vendedor ?? '',
    distribuicao: (existente?.distribuicao ?? 'individual') as Distribuicao,
    valor_artigos: paraCampo(existente?.valor_artigos),
    portes: paraCampo(existente?.portes),
    outros_custos: paraCampo(existente?.outros_custos),
    notas: existente?.notas ?? '',
  }));
  const itemVazio = (): Item => ({ id: crypto.randomUUID(), novo: true, nome: '', set_numero: '', condicao: '', quantidade: '1', preco: '' });
  const [itens, setItens] = useState<Item[]>(() =>
    produtosAtuais.length
      ? produtosAtuais.map((p) => ({
          id: p.id,
          novo: false,
          nome: p.nome,
          set_numero: p.set_numero ?? '',
          condicao: p.condicao ?? '',
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

  async function removerItem(i: number) {
    const item = itens[i];
    if (!item.novo && dados.vendas.some((v) => v.produto_id === item.id))
      return aviso('Este produto já tem vendas e não pode ser retirado da compra.', 'erro');
    setItens((xs) => (xs.length === 1 ? [itemVazio()] : xs.filter((_, j) => j !== i)));
  }

  async function submeter() {
    if (!validos.length) return aviso('Acrescenta pelo menos um produto com nome.', 'erro');
    const compra: Compra = {
      id: existente?.id ?? crypto.randomUUID(),
      data: f.data || hoje(),
      pessoa_id: f.pessoa_id || null,
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
        descricao: null, marca: 'LEGO', tema: null, estado: 'por_anunciar', conta_id: null, data_anuncio: null,
        preco_anuncio: null, notas: null, fotos: [],
        ...atual,
        id: item.id,
        compra_id: compra.id,
        nome: item.nome.trim(),
        set_numero: vazioANull(item.set_numero),
        condicao: vazioANull(item.condicao),
        quantidade: Math.max(Math.round(lerNumero(item.quantidade)) || 1, 1),
        data_compra: compra.data,
        pessoa_id: compra.pessoa_id,
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
        <Campo rotulo="Data">
          <input type="date" value={f.data} onChange={(e) => mudar('data', e.target.value)} />
        </Campo>
        <Campo rotulo="Quem pagou">
          <SelecionarPessoa valor={f.pessoa_id} mudar={(v) => mudar('pessoa_id', v)} />
        </Campo>
        <Campo rotulo="Método / conta de pagamento">
          <TextoSugerido id="l-metodos" valor={f.metodo_pagamento} mudar={(v) => mudar('metodo_pagamento', v)} sugestoes={lista('metodos_pagamento')} />
        </Campo>
        <Campo rotulo="Comprado a / onde">
          <input value={f.vendedor} onChange={(e) => mudar('vendedor', e.target.value)} placeholder="Ex.: Vinted — utilizador" />
        </Campo>
      </div>

      <h4 className="secao-form">Produtos incluídos</h4>
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
              <input className="ic-nome" value={item.nome} onChange={(e) => mudarItem(i, 'nome', e.target.value)} placeholder="Nome do produto" aria-label="Nome do produto" />
              <input className="ic-set" value={item.set_numero} onChange={(e) => mudarItem(i, 'set_numero', e.target.value)} placeholder="N.º set" aria-label="Número do set" inputMode="numeric" />
              <input className="ic-cond" value={item.condicao} onChange={(e) => mudarItem(i, 'condicao', e.target.value)} placeholder="Condição" aria-label="Condição" list="l-condicoes-c" />
              <input className="ic-qtd" value={item.quantidade} onChange={(e) => mudarItem(i, 'quantidade', e.target.value.replace(/\D/g, ''))} aria-label="Quantidade" inputMode="numeric" title="Quantidade" />
              {individual ? (
                <div className="ic-preco">
                  <Dinheiro valor={item.preco} mudar={(v) => mudarItem(i, 'preco', v)} placeholder="Preço" />
                </div>
              ) : (
                <span className="ic-preco ic-calc">{c ? fmtEuro(c.preco_compra) : '—'}</span>
              )}
              <span className="ic-custo" title="Custo final com portes e outros custos distribuídos">
                {c ? `= ${fmtEuro(c.preco_compra + c.custos_adicionais)}` : ''}
              </span>
              <button className="btn-icone" onClick={() => removerItem(i)} aria-label="Retirar produto">
                ✕
              </button>
            </div>
          );
        })}
        <datalist id="l-condicoes-c">
          {lista('condicoes').map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button className="btn btn-secundario" onClick={() => setItens((xs) => [...xs, itemVazio()])}>
          + Acrescentar produto
        </button>
      </div>

      <h4 className="secao-form">Custos extra</h4>
      <p className="nota">São distribuídos pelos produtos em proporção ao preço de cada um.</p>
      <div className="grelha-form">
        <Campo rotulo="Portes">
          <Dinheiro valor={f.portes} mudar={(v) => mudar('portes', v)} />
        </Campo>
        <Campo rotulo="Outros custos" ajuda="Taxas, proteção do comprador…">
          <Dinheiro valor={f.outros_custos} mudar={(v) => mudar('outros_custos', v)} />
        </Campo>
        <Campo rotulo="Comprovativo / notas" largo>
          <textarea rows={2} value={f.notas} onChange={(e) => mudar('notas', e.target.value)} placeholder="Referência do pagamento, link da conversa…" />
        </Campo>
      </div>
    </Janela>
  );
}
