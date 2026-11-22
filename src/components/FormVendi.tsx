// Janela rápida "Vendi": só pede o preço e a conta. Cria a venda como concluída, com data de hoje
// e quem recebeu = titular da conta. Para os restantes campos, há "Mais opções" (FormVenda).
// Anúncios (nov/2026, lib/vendasAnuncios.ts): o anúncio da plataforma da conta onde se vendeu fecha
// como "vendido". Se sobram unidades, os anúncios das outras plataformas continuam; se não sobra
// nenhuma, passam para outra unidade igual em stock ou, se não houver, ficam por retirar (aviso).

import { useState } from 'react';
import { arred, custoUnitario, unidadesDisponiveis } from '../lib/calc';
import { abertosDoProduto } from '../lib/anuncios';
import { depoisDaVenda, textoRetirar } from '../lib/vendasAnuncios';
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
  // Identificador da venda, fixo enquanto a janela estiver aberta: se uma gravação falhar e se tocar
  // outra vez em "Guardar venda", atualiza-se a mesma venda em vez de criar uma segunda.
  const [idVenda] = useState(() => crypto.randomUUID());
  // Unidade escolhida na 1.ª tentativa de guardar: fica a mesma nas repetições.
  const [unidadeFixa, setUnidadeFixa] = useState<string | null>(null);
  // As vendas sem a desta janela (pode já ter ficado gravada numa tentativa anterior): assim a venda
  // em curso nunca conta duas vezes nas unidades disponíveis nem no estado do produto.
  const vendasSemEsta = dados.vendas.filter((v) => v.id !== idVenda);
  const candidatos = ids
    .map((id) => dados.produtos.find((p) => p.id === id))
    .filter((p): p is Produto => !!p && (p.estado === 'por_anunciar' || p.estado === 'anunciado') && unidadesDisponiveis(p, vendasSemEsta) > 0)
    .sort((a, b) => (a.data_compra ?? '').localeCompare(b.data_compra ?? ''));

  // Contas onde estes produtos estão anunciados (o principal, o da Vinted, primeiro)
  const abertosDe = (p: Produto) => abertosDoProduto(dados.anuncios, p.id);
  const contasAnunciadas = [
    ...new Set(candidatos.flatMap((p) => [p.conta_id, ...abertosDe(p).map((a) => a.conta_id)]).filter((c): c is string => !!c && candidatos.some((p) => abertosDe(p).some((a) => a.conta_id === c)))),
  ];
  const [conta, setConta] = useState(() => contasAnunciadas[0] ?? contaHabitual(contas));
  // Vende-se de preferência a unidade anunciada nessa conta, depois uma anunciada, depois a mais antiga
  const unidade = (c: string) =>
    unidadeFixa
      ? candidatos.find((p) => p.id === unidadeFixa)
      : (candidatos.find((p) => abertosDe(p).some((a) => a.conta_id === c)) ?? candidatos.find((p) => abertosDe(p).length > 0) ?? candidatos[0]);
  const escolhido = unidade(conta);
  const [preco, setPreco] = useState(() => paraCampo(escolhido ? abertosDe(escolhido).find((a) => a.conta_id === conta)?.preco ?? escolhido.preco_anuncio : null));
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
    setUnidadeFixa(p.id);
    const titular = dados.contas.find((c) => c.id === conta)?.titular_id ?? null;
    const v: Venda = {
      id: idVenda,
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
      // Anúncios: fecha o desta plataforma, mantém/passa os outros (lib/vendasAnuncios.ts)
      const r = depoisDaVenda(dados, { ...p, conta_id: p.conta_id ?? conta }, conta, [...vendasSemEsta, v], new Date().toISOString());
      if (r.anuncios.length) await guardar('anuncios', r.anuncios);
      await guardar('produtos', r.produtos);
      try {
        localStorage.setItem('gv.ultimaConta', conta);
      } catch {
        /* ignorar */
      }
      aviso(`Venda registada: ${fmtEuro(valor)} (lucro ${fmtEuro(lucro)}).${textoRetirar(r.retirarDe)}`);
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
