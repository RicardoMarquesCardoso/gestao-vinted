// Testes das promoções recebidas de outra app (src/lib/promocoes.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descontoDe, promocoesNovas, setsDaPromocao } from '../src/lib/promocoes.ts';
import type { Promocao } from '../src/lib/promocoes.ts';

const existe = (n: string) => ['75375', '42151', '10280'].includes(n);

test('sets, preços e descontos: itens arrumados primeiro, texto completa', () => {
  const p: Promocao = {
    id: '1', recebida: '2026-10-30T10:00:00Z', loja: 'Continente',
    itens: [{ set: '75375-1', preco: '63,74' }, { set: 42151, desconto: '30%' }],
    texto: 'LEGO 42151 Bugatti 37,49 €\nLEGO 10280 Flower Bouquet -40%',
  };
  assert.deepEqual(setsDaPromocao(p, existe), {
    sets: ['75375', '42151', '10280'],
    precos: { '75375': 63.74, '42151': 37.49, '10280': null },
    descontos: { '75375': null, '42151': 0.3, '10280': 0.4 },
  });
});

test('promoções novas: válidas ou recebidas há até 7 dias, e não dispensadas', () => {
  const lista: Promocao[] = [
    { id: 'a', recebida: '2026-10-29T09:00:00Z', loja: 'Continente' },
    { id: 'b', recebida: '2026-10-01T09:00:00Z', loja: 'Fnac' }, // antiga
    { id: 'c', recebida: '2026-10-01T09:00:00Z', loja: 'Toys R Us', valida_ate: '2026-11-05' }, // antiga mas ainda válida
    { id: 'd', recebida: '2026-10-30T09:00:00Z', loja: 'Continente' }, // dispensada
  ];
  const defs = [
    { chave: 'promocoes', valor: lista as never },
    { chave: 'promocoes_vistas', valor: ['d'] as never },
  ];
  assert.deepEqual(promocoesNovas(defs, '2026-10-30').map((p) => p.id), ['a', 'c']);
  assert.equal(descontoDe({ ...lista[0], desconto: 25 }), 0.25);
  assert.equal(descontoDe(lista[0]), 0);
});
