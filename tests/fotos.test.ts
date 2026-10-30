// Testes das regras das fotografias (src/lib/fotos.ts): caminhos das versões e limpeza.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fotosALimpar, miniaturaDe, nomeFicheiroFoto, originalDe } from '../src/lib/fotos.ts';
import type { Produto, Venda } from '../src/lib/types.ts';

const produto = (x: Partial<Produto>): Produto => ({
  id: 'p1', compra_id: null, nome: 'Tumbler Batman', descricao: null, marca: 'LEGO', tema: null, set_numero: '76303',
  condicao: null, quantidade: 1, data_compra: '2026-01-01', preco_compra: 10, custos_adicionais: 0,
  pessoa_id: null, tipo_pagamento: 'pessoa', estado: 'vendido', conta_id: 'c1', data_anuncio: null, preco_anuncio: null,
  notas: null, fotos: [], ...x,
});
const venda = (x: Partial<Venda>): Venda => ({
  id: 'v1', produto_id: 'p1', quantidade: 1, data_venda: '2026-09-01', data_conclusao: null,
  preco_venda: 30, conta_id: 'c1', pessoa_id: null, comissao: 0, portes: 0, outros_custos: 0,
  estado: 'concluida', notas: null, ...x,
});

test('caminhos da original e da miniatura', () => {
  assert.equal(miniaturaDe('p1/abc.jpg'), 'p1/abc.min.jpg');
  assert.equal(miniaturaDe('p1/abc.min.jpg'), 'p1/abc.min.jpg');
  assert.equal(originalDe('p1/abc.min.jpg'), 'p1/abc.jpg');
  assert.equal(miniaturaDe('data:image/jpeg;base64,xx'), 'data:image/jpeg;base64,xx');
});

test('limpeza: produto todo vendido há mais de 7 dias fica só com a miniatura da 1.ª foto', () => {
  const p = produto({ fotos: ['p1/a.jpg', 'p1/b.jpg', 'p1/c.jpg'] });
  const r = fotosALimpar([p], [venda({ data_venda: '2026-09-01' })], '2026-10-30');
  assert.equal(r.length, 1);
  assert.equal(r[0].manter, 'p1/a.min.jpg');
  assert.deepEqual(r[0].apagar.sort(), ['p1/a.jpg', 'p1/b.jpg', 'p1/b.min.jpg', 'p1/c.jpg', 'p1/c.min.jpg']);
});

test('limpeza: não mexe no que ainda pode voltar ou já está limpo', () => {
  const fotos = ['p1/a.jpg', 'p1/b.jpg'];
  // Vendido há 7 dias ou menos
  assert.equal(fotosALimpar([produto({ fotos })], [venda({ data_venda: '2026-10-23' })], '2026-10-30').length, 0);
  assert.equal(fotosALimpar([produto({ fotos })], [venda({ data_venda: '2026-10-22' })], '2026-10-30').length, 1);
  // Ainda há unidades por vender
  assert.equal(fotosALimpar([produto({ fotos, quantidade: 2 })], [venda({})], '2026-10-30').length, 0);
  // Em stock, devolvido ou cancelado
  for (const estado of ['anunciado', 'devolvido', 'cancelado'] as const)
    assert.equal(fotosALimpar([produto({ fotos, estado })], [venda({})], '2026-10-30').length, 0);
  // Venda cancelada não conta
  assert.equal(fotosALimpar([produto({ fotos })], [venda({ estado: 'cancelada' })], '2026-10-30').length, 0);
  // Já só tem a miniatura
  assert.equal(fotosALimpar([produto({ fotos: ['p1/a.min.jpg'] })], [venda({})], '2026-10-30').length, 0);
  // Uma só fotografia ainda com original → apaga só a original
  assert.deepEqual(fotosALimpar([produto({ fotos: ['p1/a.jpg'] })], [venda({})], '2026-10-30')[0].apagar, ['p1/a.jpg']);
});

test('nome dos ficheiros para partilhar', () => {
  assert.equal(nomeFicheiroFoto({ nome: 'Tumbler Batman', set_numero: '76303', marca: 'LEGO' }, 0, 3), 'LEGO 76303 Tumbler Batman - 1.jpg');
  assert.equal(nomeFicheiroFoto({ nome: 'LEGO Dobby', set_numero: null, marca: 'LEGO' }, 0, 1), 'LEGO Dobby.jpg');
  assert.equal(nomeFicheiroFoto({ nome: '30th Celebration ETB', set_numero: null, marca: 'Pokémon' }, 1, 2), 'Pokémon 30th Celebration ETB - 2.jpg');
});
