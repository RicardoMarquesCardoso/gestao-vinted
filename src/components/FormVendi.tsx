// Janela rápida "Vendi": só pede o preço e a conta. Cria a venda como concluída, com data de hoje
// e quem recebeu = titular da conta. Para os restantes campos, há "Mais opções" (FormVenda).

import { useState } from 'react';
import { arred, custoUnitario, estadoAposVendas, unidadesDisponiveis } from '../lib/calc';
import { fmtEuro, hoje, lerNumero } from '../lib/format';
import type { Produto, Venda } from '../lib/types';
import { useDados } from '../state';
import { paraCampo } from './acoes';
import { Dinheiro, Janela, Valor } from './ui';

/**
 * Registo rápido de uma venda: só se pede o preço e a conta.
 * Tudo o resto é deduzido: hoje, concluída, 1 unidade, quem vendeu = titular da conta.
 * Num grupo de produtos iguais, vende-se de preferência a unidade anunciada nessa conta,
 * senão a mais antiga.
 */
export function FormVendi({ ids, aoFechar, abrirCompleto }: { ids: string[]; aoFechar(): void; abrirCompleto(produtoId: string): void }) {
  const { dados, guardar, aviso } = useDados();
  const contas = dados.contas.filter((c) => c.ativa);
  const candidatos = ids
    .map((id) => dados.produtos.find((p) => p.id === id))
    .filter((p): p is Produto => !!p && (p.estado === 'por_anunciar' || p.estado === 'anunciado') && unidadesDisponiveis(p, dados.vendas) > 0)
    .sort((a, b) => (a.data_compra ?? '').localeCompare(b.data_compra ?? ''));

  const contasAnunciadas = [...new Set(candidatos.filter((p) => p.estado === 'anunciado' && p.conta_id).map((p) => p.conta_id!))];
  const [conta, setConta] = useState(() => contasAnunciadas[0] ?? contaHabitual(contas));
  const unidade = (c: string) =>
    candidatos.find((p) => p.estado === 'anunciado' && p.conta_id === c) ?? candidatos.find((p) => p.estado === 'anunciado') ?? candidatos[0];
  const escolhido = unidade(conta);
  const [preco, setPreco] = useState(() => paraCampo(escolhido?.preco_anuncio));
  const [aGuardar, setAGuardar] = useState(false);

  if (!escolhido) {
    return (
      <Janela titulo="Vendi" aoFechar={aoFechar}>
        <p>Não há unidades disponíveis para vender.</p>
      </Janela>
    );
  }

  const valor = lerNumero(preco);
  const lucro = arred(valor - custoUnitario(escolhido));

  // Escolhe a unidade mais antiga disponível, cria a venda concluída e atualiza o produto
  async function submeter() {
    if (!(valor > 0)) return aviso('Indica o preço de venda.', 'erro');
    if (!conta) return aviso('Escolhe a conta onde vendeste.', 'erro');
    const p = unidade(conta)!;
    const titular = dados.contas.find((c) => c.id === conta)?.titular_id ?? null;
    const v: Venda = {
      id: crypto.randomUUID(),
      produto_id: p.id,
      quantidade: 1,
      data_venda: hoje(),
      data_conclusao: hoje(),
      preco_venda: valor,
      conta_id: conta,
      pessoa_id: titular,
      comissao: 0,
      portes: 0,
      outros_custos: 0,
      estado: 'concluida',
      notas: null,
      acertada: false,
    };
    setAGuardar(true);
    try {
      await guardar('vendas', [v]);
      const atualizado = { ...p, conta_id: p.conta_id ?? conta };
      const estado = estadoAposVendas(atualizado, [...dados.vendas, v]);
      if (estado !== p.estado || atualizado.conta_id !== p.conta_id) await guardar('produtos', [{ ...atualizado, estado }]);
      try {
        localStorage.setItem('gv.ultimaConta', conta);
      } catch {
        /* ignorar */
      }
      aviso(`Venda registada: ${fmtEuro(valor)} (lucro ${fmtEuro(lucro)}).`);
      aoFechar();
    } catch (e) {
      aviso(`Erro ao guardar: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Janela
      titulo={`Vendi: ${escolhido.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="link" onClick={() => abrirCompleto(escolhido.id)}>
            Mais opções
          </button>
          <span className="espaco" />
          <button className="btn btn-primario" onClick={submeter} disabled={aGuardar}>
            {aGuardar ? 'A guardar…' : 'Guardar venda'}
          </button>
        </>
      }
    >
      <label className="campo">
        <span className="campo-rotulo">Por quanto vendeste?</span>
        <div className="vendi-preco">
          <Dinheiro valor={preco} mudar={setPreco} placeholder="0" />
        </div>
      </label>

      <div className="campo vendi-contas">
        <span className="campo-rotulo">Em que conta?</span>
        <div className="segmentos segmentos-largos" role="radiogroup">
          {contas.map((c) => (
            <button key={c.id} role="radio" aria-checked={conta === c.id} className={conta === c.id ? 'ativo' : ''} onClick={() => setConta(c.id)}>
              {c.nome}
            </button>
          ))}
        </div>
      </div>

      <p className="vendi-resumo">
        Custo {fmtEuro(custoUnitario(escolhido))} · lucro <Valor n={valor ? lucro : 0} sinal />
      </p>
    </Janela>
  );
}

/** Última conta usada neste dispositivo, ou a primeira. */
function contaHabitual(contas: { id: string }[]): string {
  try {
    const c = localStorage.getItem('gv.ultimaConta');
    if (c && contas.some((x) => x.id === c)) return c;
  } catch {
    /* ignorar */
  }
  return contas[0]?.id ?? '';
}
