// Acertos entre nós, ao estilo Splitwise.
//
// Regra: quando uma venda fica concluída, quem recebeu o dinheiro
//   1) devolve o custo do produto a quem o pagou;
//   2) passa o resto (o lucro) para a conta conjunta.
// Se houve prejuízo, o "resto" é negativo: é a conta conjunta que cobre a diferença.
//
// Cada parte (uma pessoa ou a conta conjunta) tem um saldo:
//   saldo > 0  → tem a receber
//   saldo < 0  → tem a pagar
// As transferências já feitas (tabela acertos) abatem aos saldos.

import { arred, custoVenda, liquidoVenda, lucroVenda } from './calc';
import type { Dados, Produto, Venda } from './types';
import { CONJUNTA } from './types';

export interface Parte {
  id: string; // id da pessoa ou 'conjunta'
  peso: number; // fração do custo que pagou
}

/** Quem pagou o produto, e em que proporção. */
export function pagadores(p: Pick<Produto, 'tipo_pagamento' | 'pessoa_id'>, pessoas: { id: string }[]): Parte[] {
  if (p.tipo_pagamento === 'conjunta') return [{ id: CONJUNTA, peso: 1 }];
  if (p.tipo_pagamento === 'dividido' && pessoas.length) return pessoas.map((x) => ({ id: x.id, peso: 1 / pessoas.length }));
  if (p.pessoa_id) return [{ id: p.pessoa_id, peso: 1 }];
  return [];
}

/** Quem recebeu o dinheiro da venda: o titular da conta da Vinted ou, se não houver, quem vendeu. */
export function recebedor(v: Venda, d: Pick<Dados, 'contas'>): string | null {
  const titular = v.conta_id ? d.contas.find((c) => c.id === v.conta_id)?.titular_id : null;
  return titular || v.pessoa_id || null;
}

export interface Obrigacao {
  de: string;
  para: string;
  valor: number;
  motivo: 'custo' | 'lucro';
}

export interface LinhaVenda {
  venda: Venda;
  produto: Produto | undefined;
  recebeu: string | null;
  pagou: Parte[];
  custo: number;
  liquido: number;
  lucro: number;
  obrigacoes: Obrigacao[];
  problema?: string;
}

export interface Transferencia {
  de: string;
  para: string;
  valor: number;
}

export interface ResultadoAcertos {
  saldos: Map<string, number>;
  transferencias: Transferencia[];
  linhas: LinhaVenda[];
  /** Custo dos produtos ainda por vender, por quem pagou (dinheiro "empatado" em stock). */
  emStock: Map<string, number>;
  problemas: LinhaVenda[];
}

export function calcularAcertos(d: Dados): ResultadoAcertos {
  const saldos = new Map<string, number>();
  const mexer = (parte: string, valor: number) => saldos.set(parte, arred((saldos.get(parte) ?? 0) + valor));
  const produtoPorId = new Map(d.produtos.map((p) => [p.id, p]));
  const linhas: LinhaVenda[] = [];

  for (const v of d.vendas) {
    if (v.estado !== 'concluida' || v.acertada) continue;
    const p = produtoPorId.get(v.produto_id);
    const custo = custoVenda(v, p);
    const liquido = liquidoVenda(v);
    const lucro = lucroVenda(v, p);
    const recebeu = recebedor(v, d);
    const pagou = p ? pagadores(p, d.pessoas) : [];
    const linha: LinhaVenda = { venda: v, produto: p, recebeu, pagou, custo, liquido, lucro, obrigacoes: [] };
    linhas.push(linha);

    if (!recebeu) {
      linha.problema = 'Falta indicar quem recebeu (titular da conta ou quem vendeu).';
      continue;
    }
    if (custo > 0 && !pagou.length) {
      linha.problema = 'Falta indicar quem pagou o produto.';
      continue;
    }

    // 1) Devolver o custo a quem pagou (repartido se foi dividido)
    let resto = custo;
    pagou.forEach((pg, i) => {
      const parte = i === pagou.length - 1 ? arred(resto) : arred(custo * pg.peso);
      resto = arred(resto - parte);
      if (pg.id !== recebeu && parte !== 0) linha.obrigacoes.push({ de: recebeu, para: pg.id, valor: parte, motivo: 'custo' });
    });
    // 2) O lucro (ou prejuízo) vai para a conta conjunta
    if (recebeu !== CONJUNTA && lucro !== 0) linha.obrigacoes.push({ de: recebeu, para: CONJUNTA, valor: lucro, motivo: 'lucro' });

    for (const o of linha.obrigacoes) {
      mexer(o.de, -o.valor);
      mexer(o.para, o.valor);
    }
  }

  // Transferências já feitas
  for (const a of d.acertos) {
    mexer(a.de, a.valor);
    mexer(a.para, -a.valor);
  }

  // Stock ainda por vender: quanto cada um tem "empatado"
  const emStock = new Map<string, number>();
  for (const p of d.produtos) {
    if (p.estado !== 'por_anunciar' && p.estado !== 'anunciado') continue;
    const vendidas = d.vendas.filter((v) => v.produto_id === p.id && (v.estado === 'pendente' || v.estado === 'concluida')).reduce((a, v) => a + v.quantidade, 0);
    const restantes = Math.max(p.quantidade - vendidas, 0);
    if (!restantes) continue;
    const custo = ((p.preco_compra + p.custos_adicionais) / Math.max(p.quantidade, 1)) * restantes;
    for (const pg of pagadores(p, d.pessoas)) emStock.set(pg.id, arred((emStock.get(pg.id) ?? 0) + custo * pg.peso));
  }

  return { saldos, transferencias: simplificar(saldos), linhas, emStock, problemas: linhas.filter((l) => l.problema) };
}

/** Reduz os saldos ao menor número de transferências (quem deve mais paga a quem tem mais a receber). */
export function simplificar(saldos: Map<string, number>): Transferencia[] {
  const devedores = [...saldos].filter(([, v]) => v < -0.004).map(([id, v]) => ({ id, v: -v }));
  const credores = [...saldos].filter(([, v]) => v > 0.004).map(([id, v]) => ({ id, v }));
  devedores.sort((a, b) => b.v - a.v);
  credores.sort((a, b) => b.v - a.v);
  const r: Transferencia[] = [];
  let i = 0;
  let j = 0;
  while (i < devedores.length && j < credores.length) {
    const valor = arred(Math.min(devedores[i].v, credores[j].v));
    if (valor > 0) r.push({ de: devedores[i].id, para: credores[j].id, valor });
    devedores[i].v = arred(devedores[i].v - valor);
    credores[j].v = arred(credores[j].v - valor);
    if (devedores[i].v <= 0.004) i++;
    if (credores[j].v <= 0.004) j++;
  }
  return r;
}
