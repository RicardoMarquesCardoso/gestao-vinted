// Testes da sincronização entre os dois telemóveis (src/lib/sincronizar.ts) e de lerNumero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundir, juntarDados, juntarLista } from '../src/lib/sincronizar.ts';
import { lerNumero } from '../src/lib/format.ts';
import { unidadesVendidas } from '../src/lib/calc.ts';
import type { Dados, Venda } from '../src/lib/types.ts';

test('fundir: sem alterações do outro telemóvel, grava-se o que este quer', () => {
  assert.deepEqual(fundir({ a: 1 }, { a: 2 }, { a: 1 }), { a: 2 });
  assert.deepEqual(fundir(['x'], ['y'], ['x']), ['y']); // incluindo reordenar/substituir
  assert.deepEqual(fundir(undefined, { a: 1 }, undefined), { a: 1 }); // definição nova
});

test('fundir: planos mudados nos dois telemóveis ao mesmo tempo não se perdem', () => {
  const antes = { '10311|novo': 'vender', '21355|novo': 'guardar' };
  const ricardo = { ...antes, '10311|novo': 'guardar' }; // o Ricardo muda um
  const cass = { ...antes, '60444|novo': 'vender' }; // a Cass acrescentou outro (já no servidor)
  assert.deepEqual(fundir(antes, ricardo, cass), { '10311|novo': 'guardar', '21355|novo': 'guardar', '60444|novo': 'vender' });
  // Apagar uma chave aqui apaga-a no servidor, sem tocar no que o outro acrescentou
  const semUm = { '10311|novo': 'vender' };
  assert.deepEqual(fundir(antes, semUm, cass), { '10311|novo': 'vender', '60444|novo': 'vender' });
});

test('fundir: listas juntam o que cada um acrescentou e tiram o que cada um tirou', () => {
  const antes = ['a', 'b'];
  assert.deepEqual(fundir(antes, ['a', 'b', 'c'], ['a', 'b', 'd']), ['a', 'b', 'd', 'c']);
  assert.deepEqual(fundir(antes, ['b'], ['a', 'b', 'd']), ['b', 'd']);
  // Listas de objetos (ex.: vendas externas)
  const v1 = { conta: 'RM1', valor: 10 };
  const v2 = { conta: 'RM2', valor: 20 };
  assert.deepEqual(fundir([], [v1], [v2]), [v2, v1]);
});

test('fundir: este telemóvel não mudou nada → fica o do servidor', () => {
  assert.deepEqual(fundir({ a: 1 }, { a: 1 }, { a: 1, b: 2 }), { a: 1, b: 2 });
});

test('juntarLista / juntarDados: o que não mudou continua a ser o mesmo objeto', () => {
  const a = [{ id: '1', n: 1 }, { id: '2', n: 2 }];
  assert.equal(juntarLista(a, [{ id: '1', n: 1 }, { id: '2', n: 2 }], 'id'), a);
  const b = juntarLista(a, [{ id: '1', n: 1 }, { id: '2', n: 3 }], 'id');
  assert.notEqual(b, a);
  assert.equal(b[0], a[0]); // a linha igual é reaproveitada
  assert.deepEqual(b[1], { id: '2', n: 3 });
  assert.notEqual(juntarLista(a, [a[1], a[0]].map((x) => ({ ...x })), 'id'), a); // ordem mudou

  const vazio = (): Dados => ({ pessoas: [], contas: [], compras: [], produtos: [], vendas: [], acertos: [], definicoes: [] });
  const antigos = { ...vazio(), definicoes: [{ chave: 'planos', valor: { x: 1 } }] } as unknown as Dados;
  const iguais = { ...vazio(), definicoes: [{ chave: 'planos', valor: { x: 1 } }] } as unknown as Dados;
  assert.equal(juntarDados(antigos, iguais), antigos);
  const novos = { ...vazio(), definicoes: [{ chave: 'planos', valor: { x: 2 } }] } as unknown as Dados;
  const r = juntarDados(antigos, novos);
  assert.notEqual(r, antigos);
  assert.equal(r.vendas, antigos.vendas);
});

test('lerNumero: decimais com vírgula ou ponto e separador de milhares', () => {
  assert.equal(lerNumero('12,50'), 12.5);
  assert.equal(lerNumero('12.5'), 12.5);
  assert.equal(lerNumero('1 234,50'), 1234.5);
  assert.equal(lerNumero('1.299,99'), 1299.99); // antes dava 0
  assert.equal(lerNumero('1,299.99'), 1299.99);
  assert.equal(lerNumero('49,99 €'), 49.99);
  assert.equal(lerNumero('abc'), 0);
  assert.equal(lerNumero(''), 0);
});

test('unidadesVendidas: o índice de vendas acompanha listas novas', () => {
  const v = (id: string, produto_id: string, estado = 'concluida', quantidade = 1) => ({ id, produto_id, estado, quantidade }) as unknown as Venda;
  const vendas = [v('a', 'p1'), v('b', 'p1', 'cancelada'), v('c', 'p2', 'concluida', 2)];
  assert.equal(unidadesVendidas('p1', vendas), 1);
  assert.equal(unidadesVendidas('p2', vendas), 2);
  assert.equal(unidadesVendidas('p2', vendas, 'c'), 0);
  const mais = [...vendas, v('d', 'p1')]; // lista nova (como a app faz ao gravar)
  assert.equal(unidadesVendidas('p1', mais), 2);
  assert.equal(unidadesVendidas('p3', mais), 0);
});
