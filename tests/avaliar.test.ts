// Testes do "Vale a pena?" (src/lib/avaliar.ts): estimativa de venda, tempo até vender,
// veredicto, preço máximo e links.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarCompra, calibrarPvp, estimativas, precosCompra, tempoAteVender, urlEbayVendidos, urlVinted, RACIO_PVP_A_VENDA } from '../src/lib/avaliar.ts';
import type { Mercado } from '../src/lib/investimento.ts';
import type { Produto, Venda } from '../src/lib/types.ts';

const HOJE = '2026-10-29';

const produto = (x: Partial<Produto>): Produto => ({
  id: 'p1', compra_id: null, nome: 'Set', descricao: null, marca: 'LEGO', tema: null, set_numero: null,
  condicao: null, quantidade: 1, data_compra: '2026-01-01', preco_compra: 10, custos_adicionais: 0,
  pessoa_id: null, tipo_pagamento: 'pessoa', estado: 'vendido', conta_id: 'c1', data_anuncio: null, preco_anuncio: null,
  notas: null, fotos: [], ...x,
});
const venda = (x: Partial<Venda>): Venda => ({
  id: 'v1', produto_id: 'p1', quantidade: 1, data_venda: '2026-06-01', data_conclusao: null,
  preco_venda: 30, conta_id: 'c1', pessoa_id: null, comissao: 0, portes: 0, outros_custos: 0,
  estado: 'concluida', notas: null, ...x,
});
const mercado = (x: Partial<Mercado>): Mercado => ({ brickset: {}, bricklink: {}, ebay: {}, ...x });

test('sem vendas nem mercado não há estimativa nem veredicto', () => {
  const a = avaliarCompra({ set: '10280', preco: 30 }, { dados: { produtos: [], vendas: [], definicoes: [] }, mercado: null, hoje: HOJE });
  assert.equal(a.venda, null);
  assert.equal(a.veredicto, null);
});

test('as nossas vendas vêm antes do eBay e do PVP', () => {
  const dados = {
    produtos: [produto({ id: 'p1', set_numero: '10280' })],
    vendas: [venda({ produto_id: 'p1', preco_venda: 50 })],
    definicoes: [],
  };
  const m = mercado({ ebay: { '10280': [80, 10] }, brickset: { '10280': ['2021-01-01', '2023-12-31', 50, null, 'Retired'] as never } });
  const e = estimativas({ dados, mercado: m, hoje: HOJE }, '10280');
  assert.deepEqual(e.map((x) => x.fonte), ['vendas', 'ebay', 'pvp']);
  assert.equal(e[0].preco, 50);
});

test('o eBay ao vivo substitui o do dia', () => {
  const dados = { produtos: [], vendas: [], definicoes: [] };
  const m = mercado({ ebay: { '10280': [80, 10] } });
  const e = estimativas({ dados, mercado: m, hoje: HOJE }, '10280', [100, 5]);
  // Sem vendas para calibrar: desconto de reserva das regras (37%)
  assert.equal(Math.round(e[0].preco), 63);
});

test('PVP de um set ainda à venda usa o rácio de reserva quando há poucas vendas', () => {
  const dados = { produtos: [], vendas: [], definicoes: [] };
  const m = mercado({ brickset: { '42000': ['2025-01-01', '2027-12-31', 100, null, null] as never } });
  const e = estimativas({ dados, mercado: m, hoje: HOJE }, '42000');
  assert.equal(e[0].fonte, 'pvp');
  assert.equal(e[0].preco, 100 * RACIO_PVP_A_VENDA);
});

test('calibrarPvp mede o rácio por fase com pelo menos 5 sets', () => {
  const produtos: Produto[] = [];
  const vendas: Venda[] = [];
  const brickset: Record<string, unknown> = {};
  for (let i = 0; i < 5; i++) {
    const set = String(30000 + i);
    brickset[set] = ['2024-01-01', '2026-12-31', 100, null, null];
    produtos.push(produto({ id: `p${i}`, set_numero: set }));
    vendas.push(venda({ id: `v${i}`, produto_id: `p${i}`, preco_venda: 60 + i * 5, data_venda: '2026-05-01' })); // 60…80
  }
  const c = calibrarPvp({ dados: { produtos, vendas, definicoes: [] }, mercado: mercado({ brickset: brickset as never }), hoje: HOJE });
  assert.equal(c.aVenda, 0.7); // mediana de 0,60 0,65 0,70 0,75 0,80
  assert.equal(c.setsAVenda, 5);
  assert.equal(c.retirado, 0.8); // sem vendas retiradas: reserva
});

test('tempo até vender: o set, depois o tema, depois tudo', () => {
  const produtos = [
    produto({ id: 'a', set_numero: '1', tema: 'Star Wars', data_compra: '2026-01-01' }),
    produto({ id: 'b', set_numero: '2', tema: 'Star Wars', data_compra: '2026-01-01' }),
    produto({ id: 'c', set_numero: '3', tema: 'Star Wars', data_compra: '2026-01-01' }),
    produto({ id: 'd', set_numero: '4', tema: 'City', data_compra: '2026-01-01' }),
    produto({ id: 'e', set_numero: '5', tema: 'Star Wars', data_compra: '2026-01-01' }),
    produto({ id: 'f', set_numero: '6', tema: 'Star Wars', data_compra: '2026-01-01' }),
  ];
  const vendas = [
    venda({ id: '1', produto_id: 'a', data_venda: '2026-01-11' }), // 10 dias
    venda({ id: '2', produto_id: 'b', data_venda: '2026-01-21' }), // 20
    venda({ id: '3', produto_id: 'c', data_venda: '2026-01-31' }), // 30
    venda({ id: '4', produto_id: 'd', data_venda: '2026-04-11' }), // 100
    venda({ id: '5', produto_id: 'e', data_venda: '2026-01-21' }), // 20
    venda({ id: '6', produto_id: 'f', data_venda: '2026-01-21' }), // 20
  ];
  const ctx = { dados: { produtos, vendas, definicoes: [] }, mercado: null, hoje: HOJE };
  assert.deepEqual(tempoAteVender(ctx, '2'), { dias: 20, base: 'set', n: 1 });
  assert.deepEqual(tempoAteVender(ctx, '9', 'StarWars'), { dias: 20, base: 'tema', n: 5 });
  assert.deepEqual(tempoAteVender(ctx, '9', 'Ninjago'), { dias: 20, base: 'geral', n: 6 });
});

test('veredicto, rentabilidade e preço máximo', () => {
  const dados = {
    produtos: [produto({ id: 'p1', set_numero: '10280', data_compra: '2026-05-02' })],
    vendas: [venda({ produto_id: 'p1', preco_venda: 60, data_venda: '2026-06-01' })], // 30 dias
    definicoes: [],
  };
  const ctx = { dados, mercado: null, hoje: HOJE };
  const bom = avaliarCompra({ set: '10280', preco: 40, portes: 0 }, ctx);
  assert.equal(bom.veredicto, 'bom'); // +50%
  assert.equal(Math.round(bom.rentabAnual! * 100), Math.round((0.5 * 365) / 30 * 100));
  assert.equal(bom.precoMaximo, 50); // 60 ÷ 1,2
  assert.equal(avaliarCompra({ set: '10280', preco: 55 }, ctx).veredicto, 'talvez'); // +9%
  assert.equal(avaliarCompra({ set: '10280', preco: 60 }, ctx).veredicto, 'mau');
  // Os portes contam no custo e saem do preço máximo
  assert.equal(avaliarCompra({ set: '10280', preco: 40, portes: 4 }, ctx).precoMaximo, 46);
});

test('lucro pequeno não vale a vaga, mesmo com boa margem', () => {
  const dados = {
    produtos: [produto({ id: 'p1', set_numero: '30000' })],
    vendas: [venda({ produto_id: 'p1', preco_venda: 8 })],
    definicoes: [],
  };
  const a = avaliarCompra({ set: '30000', preco: 4 }, { dados, mercado: null, hoje: HOJE });
  assert.equal(a.veredicto, 'talvez'); // +100%, mas só 4 € de lucro
});

test('avisa quando já há unidades em stock', () => {
  const dados = {
    produtos: [produto({ id: 'p1', set_numero: '10280', estado: 'anunciado', quantidade: 2 }), produto({ id: 'p2', set_numero: '10280' })],
    vendas: [venda({ id: 'v', produto_id: 'p2', preco_venda: 60 })],
    definicoes: [],
  };
  const a = avaliarCompra({ set: '10280', preco: 30 }, { dados, mercado: null, hoje: HOJE });
  assert.equal(a.emStock, 2);
  assert.match(a.motivo, /2 em stock/);
});

test('links da Vinted e do eBay', () => {
  assert.equal(urlVinted('75321-1'), 'https://www.vinted.pt/catalog?search_text=lego%2075321&order=price_low_to_high&status_ids[]=6&status_ids[]=1');
  assert.equal(urlVinted('75321', false), 'https://www.vinted.pt/catalog?search_text=lego%2075321&order=price_low_to_high');
  assert.match(urlEbayVendidos('75321'), /ebay\.de.*_nkw=lego%2075321.*LH_Sold=1/);
});

test('preços de compra por escalão e quantidades a diversificar', () => {
  // Vendemos o set a 60 € em 30 dias; o stock tem 800 € noutro set (10% = 80 €)
  const dados = {
    produtos: [
      produto({ id: 'p1', set_numero: '10280', data_compra: '2026-05-02' }),
      produto({ id: 'outro', set_numero: '99999', estado: 'por_anunciar', preco_compra: 800 }),
    ],
    vendas: [venda({ produto_id: 'p1', preco_venda: 60, data_venda: '2026-06-01' })],
    definicoes: [],
  };
  const r = precosCompra({ set: '10280' }, { dados, mercado: null, hoje: HOJE });
  assert.deepEqual(
    r.escaloes.map((e) => [e.nome, e.precoMax, e.alvo, e.comprar]),
    [
      ['rara', 34, 3, 2], // 60 ÷ 1,75 = 34,3; 3 unidades passavam dos 10% do stock → 2
      ['otimo', 42.5, 2, 2], // 60 ÷ 1,4
      ['bom', 50, 1, 1], // 60 ÷ 1,2
    ],
  );
  assert.match(r.escaloes[0].limite!, /10%/);
});

test('quantidades descontam o que já está em stock', () => {
  const dados = {
    produtos: [
      produto({ id: 'p1', set_numero: '10280' }),
      produto({ id: 'p2', set_numero: '10280', estado: 'anunciado', preco_compra: 40 }),
      produto({ id: 'grande', set_numero: '99999', estado: 'por_anunciar', preco_compra: 5000 }),
    ],
    vendas: [venda({ produto_id: 'p1', preco_venda: 60 })],
    definicoes: [],
  };
  const r = precosCompra({ set: '10280' }, { dados, mercado: null, hoje: HOJE });
  assert.equal(r.emStock, 1);
  assert.deepEqual(r.escaloes.map((e) => e.comprar), [2, 1, 0]); // já há 1: "bom" não compra mais
  assert.match(r.escaloes[2].limite!, /já têm 1/);
});

test('lucro mínimo de 5 € limita o preço de sets baratos', () => {
  const dados = { produtos: [produto({ id: 'p1', set_numero: '30000' })], vendas: [venda({ produto_id: 'p1', preco_venda: 12 })], definicoes: [] };
  const r = precosCompra({ set: '30000' }, { dados, mercado: null, hoje: HOJE });
  assert.equal(r.escaloes[2].precoMax, 7); // 12 ÷ 1,2 = 10, mas 12 − 5 = 7
});
