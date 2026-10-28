// Formulário completo de uma venda: produto, quantidade, preço, conta, quem recebeu, estado
// e, em "Mais detalhes", comissões, portes, notas e a opção de não contar para os limites.
// Ao guardar, atualiza também o estado do produto (vendido / ainda anunciado).

import { useMemo, useState } from 'react';
import { CHAVE_FORA_LIMITES, arred, chaveComparacao, custoUnitario, estadoAposVendas, unidadesVendidas, vendasForaLimites } from '../lib/calc';
import { fmtEuro, hoje, lerNumero } from '../lib/format';
import type { EstadoVenda, Venda } from '../lib/types';
import { ESTADOS_VENDA } from '../lib/types';
import { useDados } from '../state';
import { paraCampo, vazioANull } from './acoes';
import { Campo, Dinheiro, Janela, SelecionarConta, SelecionarPessoa, Valor, useConfirmar, ProcurarLista, useImagemReferencia } from './ui';

export function FormVenda({ id, produtoId, aoFechar }: { id?: string; produtoId?: string; aoFechar(): void }) {
  const { dados, guardar, apagar, aviso, nomeConta, nomePagador } = useDados();
  const confirmar = useConfirmar();
  const imagemReferencia = useImagemReferencia();
  const existente = dados.vendas.find((v) => v.id === id);
  const produtoInicial = dados.produtos.find((p) => p.id === (existente?.produto_id ?? produtoId));

  const [f, setF] = useState(() => ({
    produto_id: existente?.produto_id ?? produtoId ?? '',
    quantidade: String(existente?.quantidade ?? 1),
    data_venda: existente?.data_venda ?? hoje(),
    data_conclusao: existente?.data_conclusao ?? '',
    preco_venda: paraCampo(existente?.preco_venda ?? produtoInicial?.preco_anuncio),
    conta_id: existente ? existente.conta_id ?? '' : produtoInicial?.conta_id ?? contaHabitual(dados.contas),
    pessoa_id: existente?.pessoa_id ?? '',
    comissao: paraCampo(existente?.comissao),
    portes: paraCampo(existente?.portes),
    outros_custos: paraCampo(existente?.outros_custos),
    estado: (existente?.estado ?? 'concluida') as EstadoVenda,
    notas: existente?.notas ?? '',
    acertada: existente?.acertada ?? false,
    foraLimites: existente ? vendasForaLimites(dados).has(existente.id) : false,
  }));
  const [aGuardar, setAGuardar] = useState(false);
  // Os detalhes abrem sozinhos só quando já têm alguma coisa preenchida
  const [detalhesAbertos] = useState(
    () => !!existente && (existente.estado !== 'concluida' || !!existente.comissao || !!existente.portes || !!existente.outros_custos || !!existente.notas || vendasForaLimites(dados).has(existente.id)),
  );
  const mudar = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const produto = dados.produtos.find((p) => p.id === f.produto_id);
  const disponiveis = produto ? Math.max(produto.quantidade - unidadesVendidas(produto.id, dados.vendas, id), 0) : 0;

  // Produtos que se podem vender (com unidades disponíveis) + o atual.
  // Unidades iguais e intermutáveis (mesmo set, custo, condição, quem pagou e conta) aparecem uma só vez.
  const opcoes = useMemo(() => {
    const vendaveis = dados.produtos
      .filter(
        (p) =>
          p.id === f.produto_id ||
          ((p.estado === 'anunciado' || p.estado === 'por_anunciar') && unidadesVendidas(p.id, dados.vendas, id) < p.quantidade),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome) || (a.data_compra ?? '').localeCompare(b.data_compra ?? ''));
    const grupos = new Map<string, { p: (typeof vendaveis)[number]; disp: number }>();
    for (const p of vendaveis) {
      const disp = p.quantidade - unidadesVendidas(p.id, dados.vendas, id);
      const k =
        p.id === f.produto_id
          ? p.id
          : [chaveComparacao(p), custoUnitario(p).toFixed(2), p.condicao ?? '', p.tipo_pagamento, p.pessoa_id ?? '', p.conta_id ?? '', p.fotos.length ? p.id : ''].join('|');
      const g = grupos.get(k);
      if (g) g.disp += disp;
      else grupos.set(k, { p, disp });
    }
    return [...grupos.values()].map(({ p, disp }) => ({
      id: p.id,
      titulo: disp > 1 ? `${p.nome} (×${disp})` : p.nome,
      detalhe: [p.set_numero && `Set ${p.set_numero}`, p.condicao, `custo ${fmtEuro(custoUnitario(p))}`, `pagou ${nomePagador(p)}`, p.conta_id && nomeConta(p.conta_id)]
        .filter(Boolean)
        .join(' · '),
      imagem: p.fotos[0] ? null : imagemReferencia(p),
    }));
  }, [dados.produtos, dados.vendas, f.produto_id, id, nomeConta, nomePagador, imagemReferencia]);

  const qtd = Math.max(Math.round(lerNumero(f.quantidade)) || 1, 1);
  const liquido = arred(lerNumero(f.preco_venda) - lerNumero(f.comissao) - lerNumero(f.portes) - lerNumero(f.outros_custos));
  const custo = produto ? arred(custoUnitario(produto) * qtd) : 0;
  const lucro = arred(liquido - custo);

  // Ao escolher o produto, sugere o preço anunciado e a conta onde está anunciado
  function escolherProduto(pid: string) {
    const p = dados.produtos.find((x) => x.id === pid);
    setF((x) => ({
      ...x,
      produto_id: pid,
      conta_id: p?.conta_id || x.conta_id || contaHabitual(dados.contas),
      preco_venda: x.preco_venda || paraCampo(p?.preco_anuncio),
    }));
  }

  // Validar, guardar a venda e atualizar o estado do(s) produto(s) afetado(s)
  async function submeter() {
    if (!produto) return aviso('Escolhe o produto vendido.', 'erro');
    if (f.estado === 'concluida' && qtd > disponiveis)
      return aviso(`Só há ${disponiveis} unidade(s) disponível(eis) deste produto.`, 'erro');
    const v: Venda = {
      id: existente?.id ?? crypto.randomUUID(),
      produto_id: produto.id,
      quantidade: qtd,
      data_venda: f.data_venda || hoje(),
      data_conclusao: f.data_conclusao || (f.estado === 'concluida' ? hoje() : null),
      preco_venda: lerNumero(f.preco_venda),
      conta_id: f.conta_id || null,
      // quem vendeu: o indicado ou, por omissão, o titular da conta
      pessoa_id: f.pessoa_id || dados.contas.find((c) => c.id === f.conta_id)?.titular_id || null,
      comissao: lerNumero(f.comissao),
      portes: lerNumero(f.portes),
      outros_custos: lerNumero(f.outros_custos),
      estado: f.estado,
      notas: vazioANull(f.notas),
      acertada: f.acertada,
    };
    setAGuardar(true);
    try {
      await guardar('vendas', [v]);
      const fora = vendasForaLimites(dados);
      if (fora.has(v.id) !== f.foraLimites) {
        if (f.foraLimites) fora.add(v.id);
        else fora.delete(v.id);
        await guardar('definicoes', [{ chave: CHAVE_FORA_LIMITES, valor: [...fora] }]);
      }
      await atualizarProdutos([v.produto_id, existente?.produto_id], [...dados.vendas.filter((x) => x.id !== v.id), v]);
      aviso(existente ? 'Venda atualizada.' : 'Venda registada.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao guardar: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAGuardar(false);
    }
  }

  /** Mantém o estado dos produtos coerente com as vendas (vendido / anunciado). */
  async function atualizarProdutos(ids: (string | undefined)[], vendas: Venda[]) {
    const alterados = [...new Set(ids.filter(Boolean))]
      .map((pid) => dados.produtos.find((p) => p.id === pid))
      .filter((p) => !!p)
      .map((p) => ({ p: p!, estado: estadoAposVendas(p!, vendas) }))
      .filter((x) => x.estado !== x.p.estado)
      .map((x) => ({ ...x.p, estado: x.estado }));
    if (alterados.length) await guardar('produtos', alterados);
  }

  // Apagar a venda (com confirmação) e repor o estado do produto
  async function eliminar() {
    if (!existente) return;
    const ok = await confirmar({
      titulo: 'Apagar venda',
      texto: `Vais apagar a venda de "${produto?.nome}" por ${fmtEuro(existente.preco_venda)}. Se só queres registar que não se concretizou, muda o estado para "Cancelada". Apagar mesmo assim?`,
      botao: 'Apagar venda',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apagar('vendas', existente.id);
      await atualizarProdutos([existente.produto_id], dados.vendas.filter((x) => x.id !== existente.id));
      aviso('Venda apagada.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao apagar: ${e instanceof Error ? e.message : e}`, 'erro');
    }
  }

  return (
    <Janela
      titulo={existente ? 'Editar venda' : 'Registar venda'}
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
        <div className="campo campo-largo">
          <span className="campo-rotulo">Produto vendido *</span>
          <ProcurarLista opcoes={opcoes} valor={f.produto_id} mudar={escolherProduto} placeholder="Escreve o nome ou o número do set…" />
        </div>
        <Campo rotulo="Preço de venda">
          <Dinheiro valor={f.preco_venda} mudar={(v) => mudar('preco_venda', v)} />
        </Campo>
        <Campo rotulo="Conta da Vinted">
          <SelecionarConta valor={f.conta_id} mudar={(v) => mudar('conta_id', v)} />
        </Campo>
        <Campo rotulo="Data da venda">
          <input type="date" value={f.data_venda} onChange={(e) => mudar('data_venda', e.target.value)} />
        </Campo>
        {produto && produto.quantidade > 1 && (
          <Campo rotulo="Quantidade" ajuda={`${disponiveis} disponível(eis)`}>
            <input inputMode="numeric" value={f.quantidade} onChange={(e) => mudar('quantidade', e.target.value.replace(/\D/g, ''))} />
          </Campo>
        )}
      </div>

      <div className="resumo-calculo">
        <div>
          <span>Valor líquido</span>
          <strong>{fmtEuro(liquido)}</strong>
        </div>
        <div>
          <span>Custo do produto</span>
          <strong>{fmtEuro(custo)}</strong>
        </div>
        <div>
          <span>Lucro</span>
          <strong>
            <Valor n={f.estado === 'cancelada' || f.estado === 'devolvida' ? 0 : lucro} sinal />
          </strong>
        </div>
      </div>
      <details className="mais-detalhes" open={detalhesAbertos || undefined}>
        <summary>Mais detalhes</summary>
        <div className="grelha-form">
          <Campo rotulo="Estado" ajuda="Concluída, ou cancelada / devolvida se a venda não se fez">
            <select value={f.estado} onChange={(e) => mudar('estado', e.target.value as EstadoVenda)}>
              {ESTADOS_VENDA.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Enviado / concluído em">
            <input type="date" value={f.data_conclusao} onChange={(e) => mudar('data_conclusao', e.target.value)} />
          </Campo>
          <Campo rotulo="Portes pagos por nós">
            <Dinheiro valor={f.portes} mudar={(v) => mudar('portes', v)} />
          </Campo>
          <Campo rotulo="Comissões">
            <Dinheiro valor={f.comissao} mudar={(v) => mudar('comissao', v)} />
          </Campo>
          <Campo rotulo="Outros custos" ajuda="Embalagem, peças…">
            <Dinheiro valor={f.outros_custos} mudar={(v) => mudar('outros_custos', v)} />
          </Campo>
          <Campo rotulo="Quem vendeu" ajuda="Por omissão, o titular da conta">
            <SelecionarPessoa valor={f.pessoa_id} mudar={(v) => mudar('pessoa_id', v)} vazio="Titular da conta" />
          </Campo>
          <Campo rotulo="Notas" largo>
            <textarea rows={2} value={f.notas} onChange={(e) => mudar('notas', e.target.value)} />
          </Campo>
          <label className="caixa campo-largo">
            <input type="checkbox" checked={f.foraLimites} onChange={(e) => mudar('foraLimites', e.target.checked)} /> Não conta para os limites da
            conta (ex.: cancelada na Vinted)
          </label>
          <label className="caixa campo-largo">
            <input type="checkbox" checked={f.acertada} onChange={(e) => mudar('acertada', e.target.checked)} /> Já acertada fora da app (não entra em
            Acertos)
          </label>
        </div>
      </details>
    </Janela>
  );
}

/** A última conta usada para anunciar, ou a primeira conta ativa. */
function contaHabitual(contas: { id: string; ativa: boolean }[]): string {
  try {
    const c = localStorage.getItem('gv.ultimaConta');
    if (c && contas.some((x) => x.id === c && x.ativa)) return c;
  } catch {
    /* ignorar */
  }
  return contas.find((c) => c.ativa)?.id ?? '';
}
