import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularAcertos, simplificar } from '../src/lib/acertos.ts';
import type { Conta, Dados, Produto, Venda } from '../src/lib/types.ts';

const R = 'ricardo';
const A = 'ana';
const J = 'conjunta';

function cenario(prod: Partial<Produto>, venda: Partial<Venda>, titular: string | null = A): Dados {
  const conta = { id: 'c1', nome: 'Conta', titular_id: titular } as Conta;
  const produto = {
    id: 'p1', nome: 'Set', quantidade: 1, preco_compra: 20, custos_adicionais: 0, tipo_pagamento: 'pessoa',
    pessoa_id: R, estado: 'vendido', ...prod,
  } as Produto;
  const v = {
    id: 'v1', produto_id: 'p1', quantidade: 1, data_venda: '2026-10-01', preco_venda: 30, conta_id: 'c1',
    pessoa_id: null, comissao: 0, portes: 0, outros_custos: 0, estado: 'concluida', ...venda,
  } as Venda;
  return {
    pessoas: [{ id: R, nome: 'Ricardo' }, { id: A, nome: 'Ana' }], contas: [conta], compras: [],
    produtos: [produto], vendas: [v], acertos: [], definicoes: [],
  };
}

test('pagou um, recebeu o outro: devolve o custo e o lucro vai para a conjunta', () => {
  const r = calcularAcertos(cenario({}, {}));
  assert.deepEqual(r.transferencias, [
    { de: A, para: R, valor: 20 },
    { de: A, para: J, valor: 10 },
  ]);
});

test('compra dividida: cada um recebe metade do custo', () => {
  const r = calcularAcertos(cenario({ tipo_pagamento: 'dividido', pessoa_id: null }, {}, R));
  assert.equal(r.saldos.get(A), 10);
  assert.equal(r.saldos.get(J), 10);
  assert.equal(r.saldos.get(R), -20);
});

test('paga pela conta conjunta: tudo volta para a conjunta', () => {
  const r = calcularAcertos(cenario({ tipo_pagamento: 'conjunta', pessoa_id: null }, {}, R));
  assert.deepEqual(r.transferencias, [{ de: R, para: J, valor: 30 }]);
});

test('prejuízo é coberto pela conta conjunta', () => {
  const r = calcularAcertos(cenario({}, { preco_venda: 15 }, R));
  assert.deepEqual(r.transferencias, [{ de: J, para: R, valor: 5 }]);
});

test('vendas pendentes não contam; acertos feitos abatem', () => {
  assert.equal(calcularAcertos(cenario({}, { estado: 'pendente' })).transferencias.length, 0);
  const d = cenario({}, {});
  d.acertos.push({ id: 'a1', data: '2026-10-02', de: A, para: R, valor: 20, notas: null });
  assert.deepEqual(calcularAcertos(d).transferencias, [{ de: A, para: J, valor: 10 }]);
});

test('sem titular usa quem vendeu; sem ninguém é assinalado', () => {
  assert.deepEqual(calcularAcertos(cenario({}, { pessoa_id: R }, null)).transferencias, [{ de: R, para: J, valor: 10 }]);
  assert.equal(calcularAcertos(cenario({}, {}, null)).problemas.length, 1);
});

test('simplificar reduz transferências', () => {
  const t = simplificar(new Map([[R, -30], [A, 10], [J, 20]]));
  assert.deepEqual(t, [{ de: R, para: J, valor: 20 }, { de: R, para: A, valor: 10 }]);
});
