// Testes automáticos (correm com: npx tsx --test tests/*.test.ts).
// Cada test() monta um pequeno cenário e confirma (assert) que os cálculos dão o esperado.
// Servem para garantir que uma alteração nova não estraga contas que já funcionavam.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distribuirCompra, repartir, lucroVenda, liquidoVenda, estadoAposVendas, usoConta,
  periodoConta, intervaloDe, estatisticas, chaveComparacao, unidadesDisponiveis,
} from '../src/lib/calc.ts';
import type { Conta, Produto, Venda, Dados } from '../src/lib/types.ts';

const produto = (x: Partial<Produto>): Produto => ({
  id: 'p1', compra_id: null, nome: 'Set', descricao: null, marca: 'LEGO', tema: null, set_numero: null,
  condicao: null, quantidade: 1, data_compra: '2026-01-01', preco_compra: 10, custos_adicionais: 0,
  pessoa_id: null, tipo_pagamento: 'pessoa', estado: 'anunciado', conta_id: 'c1', data_anuncio: null, preco_anuncio: null,
  notas: null, fotos: [], ...x,
});
const venda = (x: Partial<Venda>): Venda => ({
  id: 'v1', produto_id: 'p1', quantidade: 1, data_venda: '2026-01-10', data_conclusao: null,
  preco_venda: 30, conta_id: 'c1', pessoa_id: null, comissao: 0, portes: 0, outros_custos: 0,
  estado: 'concluida', notas: null, ...x,
});
const conta = (x: Partial<Conta>): Conta => ({
  id: 'c1', nome: 'A', utilizador_vinted: null, notas: null, ativa: true, limite_anuncios: null,
  limite_vendas: null, limite_valor: null, periodo: 'mensal', periodo_dias: null, periodo_inicio: null,
  periodo_fim: null, alerta_pct: 80, titular_id: null, ...x,
});

test('repartir mantém o total exato', () => {
  const r = repartir(10, [1 / 3, 1 / 3, 1 / 3]);
  assert.deepEqual(r, [3.33, 3.33, 3.34]);
});

test('distribuir compra em partes iguais por unidade, com portes proporcionais', () => {
  const r = distribuirCompra({ valor_artigos: 90, portes: 6, outros_custos: 0, distribuicao: 'igual' }, [
    { quantidade: 1, preco: 0 },
    { quantidade: 2, preco: 0 },
  ]);
  assert.deepEqual(r, [
    { preco_compra: 30, custos_adicionais: 2 },
    { preco_compra: 60, custos_adicionais: 4 },
  ]);
});

test('distribuir compra com preços individuais', () => {
  const r = distribuirCompra({ valor_artigos: 0, portes: 5, outros_custos: 0, distribuicao: 'individual' }, [
    { quantidade: 1, preco: 40 },
    { quantidade: 1, preco: 10 },
  ]);
  assert.deepEqual(r, [
    { preco_compra: 40, custos_adicionais: 4 },
    { preco_compra: 10, custos_adicionais: 1 },
  ]);
});

test('lucro considera custo unitário e custos da venda', () => {
  const p = produto({ quantidade: 2, preco_compra: 20, custos_adicionais: 4 }); // 12 por unidade
  const v = venda({ preco_venda: 30, portes: 3, comissao: 1 });
  assert.equal(liquidoVenda(v), 26);
  assert.equal(lucroVenda(v, p), 14);
  assert.equal(lucroVenda({ ...v, estado: 'cancelada' }, p), 0);
});

test('estado do produto acompanha as vendas', () => {
  const p = produto({ quantidade: 2 });
  assert.equal(estadoAposVendas(p, [venda({})]), 'anunciado');
  assert.equal(estadoAposVendas(p, [venda({}), venda({ id: 'v2' })]), 'vendido');
  assert.equal(estadoAposVendas({ ...p, estado: 'vendido', data_anuncio: '2026-01-02' }, [venda({ estado: 'cancelada' })]), 'anunciado');
  assert.equal(estadoAposVendas({ ...p, estado: 'vendido' }, [venda({ estado: 'cancelada' })]), 'por_anunciar');
  assert.equal(unidadesDisponiveis(p, [venda({})]), 1);
});

test('períodos das contas', () => {
  assert.deepEqual(
    (({ inicio, fim }) => ({ inicio, fim }))(periodoConta(conta({}), '2026-12-15')),
    { inicio: '2026-12-01', fim: '2026-12-31' },
  );
  const sem = periodoConta(conta({ periodo: 'semanal' }), '2026-10-28'); // quarta
  assert.equal(sem.inicio, '2026-10-26');
  assert.equal(sem.fim, '2026-11-01');
  assert.equal(periodoConta(conta({ periodo: 'rolante', periodo_dias: 7 }), '2026-10-26').inicio, '2026-10-20');
  assert.deepEqual(intervaloDe('mes_anterior', '2026-03-10'), { inicio: '2026-02-01', fim: '2026-02-28' });
});

test('uso de limites e avisos', () => {
  const c = conta({ limite_anuncios: 5, limite_vendas: 2, limite_valor: 100 });
  const u = usoConta(
    c,
    {
      produtos: [1, 2, 3, 4].map((i) => produto({ id: `p${i}` })),
      vendas: [venda({ data_venda: '2026-10-02', preco_venda: 50 }), venda({ id: 'v2', data_venda: '2026-09-30' })],
    },
    '2026-10-26',
  );
  assert.equal(u.limites[0].usado, 4);
  assert.equal(u.limites[0].nivel, 'aviso'); // 80%
  assert.equal(u.limites[1].usado, 1);
  assert.equal(u.limites[1].restante, 1);
  assert.equal(u.limites[2].usado, 50);
  assert.equal(u.nivel, 'aviso');
});

test('estatísticas básicas', () => {
  const d: Dados = {
    pessoas: [], contas: [conta({})], definicoes: [], acertos: [],
    compras: [{ id: 'k1', data: '2026-01-01', pessoa_id: null, tipo_pagamento: 'pessoa', metodo_pagamento: null, vendedor: null, valor_artigos: 20, portes: 2, outros_custos: 0, distribuicao: 'igual', notas: null }],
    produtos: [
      produto({ id: 'p1', compra_id: 'k1', preco_compra: 10, custos_adicionais: 1, set_numero: '75192' }),
      produto({ id: 'p2', compra_id: 'k1', preco_compra: 10, custos_adicionais: 1, set_numero: '75192' }),
    ],
    vendas: [venda({ produto_id: 'p1', preco_venda: 30, data_venda: '2026-01-11' })],
  };
  const e = estatisticas(d, { intervalo: { inicio: null, fim: null } }, '2026-02-01');
  assert.equal(e.gasto, 22);
  assert.equal(e.recebido, 30);
  assert.equal(e.lucro, 19);
  assert.equal(e.inventarioCusto, 11);
  assert.equal(e.diasMediosVenda, 10);
  assert.equal(e.porSet[0].compradas, 2);
  assert.equal(e.porSet[0].vendidas, 1);
  assert.equal(chaveComparacao({ set_numero: ' 75192 ', nome: 'x' }), 'set:75192');
});

import { lotes, idadeStock } from '../src/lib/calc.ts';

test('lotes de compra e idade do stock', () => {
  const ps = [
    produto({ id: 'a', data_compra: '2025-11-10', preco_compra: 10, estado: 'vendido' }),
    produto({ id: 'b', data_compra: '2025-11-20', preco_compra: 20, estado: 'anunciado' }),
    produto({ id: 'c', data_compra: '2026-10-01', preco_compra: 5, estado: 'por_anunciar' }),
    produto({ id: 'd', data_compra: null, preco_compra: 3, estado: 'por_anunciar' }),
  ];
  const vs = [venda({ produto_id: 'a', preco_venda: 25 })];
  const l = lotes({ produtos: ps, vendas: vs });
  const nov = l.find((x) => x.mes === '2025-11')!;
  assert.equal(nov.unidades, 2);
  assert.equal(nov.vendidas, 1);
  assert.equal(nov.gasto, 30);
  assert.equal(nov.lucro, 15);
  assert.equal(nov.porVenderCusto, 20);
  assert.equal(l[l.length - 1].mes, null);
  const i = idadeStock({ produtos: ps, vendas: vs }, '2026-10-27');
  assert.deepEqual(i.faixas.map((f) => [f.nome, f.unidades, f.custo]), [
    ['Menos de 3 meses', 1, 5],
    ['6 a 12 meses', 1, 20],
    ['Sem data de compra', 1, 3],
  ]);
  assert.equal(i.antigos[0].produto.id, 'b');
});

test('vendas fora da app contam para os limites', () => {
  const c = conta({ periodo: 'anual', limite_vendas: 30, limite_valor: 2000 });
  const u = usoConta(
    c,
    {
      produtos: [],
      vendas: [venda({ data_venda: '2026-03-01', preco_venda: 50 })],
      definicoes: [{ chave: 'vendas_externas', valor: [{ conta_id: 'c1', data: '2026-04-01', valor: 130 }, { conta_id: 'c1', data: '2025-10-30', valor: 400 }] as never }],
    },
    '2026-10-27',
  );
  assert.equal(u.vendasPeriodo, 2);
  assert.equal(u.valorPeriodo, 180);
  assert.equal(u.externas, 1);
});

test('vendas marcadas como fora dos limites não contam', () => {
  const c = conta({ periodo: 'anual', limite_vendas: 30 });
  const u = usoConta(
    c,
    { produtos: [], vendas: [venda({ id: 'x', data_venda: '2026-01-16', preco_venda: 100 }), venda({ id: 'y', data_venda: '2026-02-01' })], definicoes: [{ chave: 'vendas_fora_limites', valor: ['x'] }] },
    '2026-10-27',
  );
  assert.equal(u.vendasPeriodo, 1);
  assert.equal(u.valorPeriodo, 30);
});

import { textoAnuncio, MODELO_PADRAO } from '../src/lib/anuncio.ts';

test('texto do anúncio', () => {
  const a = textoAnuncio({ nome: 'LEGO Millennium Falcon', set_numero: '75192', tema: 'Star Wars', condicao: 'Novo e selado' }, MODELO_PADRAO);
  assert.equal(a.titulo, 'Lego 75192 Millennium Falcon');
  assert.match(a.descricao, /^New, sealed/);
  assert.match(a.descricao, /Carefully sent in box/);
  const b = textoAnuncio({ nome: 'Carro', set_numero: null, tema: null, condicao: 'Usado completo' }, MODELO_PADRAO);
  assert.equal(b.titulo, 'Lego Carro');
  assert.match(b.descricao, /^Used/);
});

import { atualizarPeriodos, diasAnunciado } from '../src/lib/anuncios.ts';

test('períodos de anúncio', () => {
  const p = produto({ estado: 'por_anunciar' });
  const a1 = atualizarPeriodos(p, { ...p, estado: 'anunciado', preco_anuncio: 50 }, '2026-10-01T10:00:00Z')!;
  assert.equal(a1.length, 1);
  assert.equal(a1[0].preco, 50);
  const p2 = { ...p, estado: 'anunciado' as const, preco_anuncio: 50, anuncios: a1 };
  const a2 = atualizarPeriodos(p2, { ...p2, preco_anuncio: 45 }, '2026-10-05T10:00:00Z')!;
  assert.deepEqual(a2[0].precos, [{ quando: '2026-10-05T10:00:00Z', preco: 45 }]);
  const p3 = { ...p2, anuncios: a2 };
  const a3 = atualizarPeriodos(p3, { ...p3, estado: 'vendido' }, '2026-10-11T09:00:00Z')!;
  assert.equal(a3[0].motivo, 'vendido');
  assert.equal(diasAnunciado({ anuncios: a3 }, '2026-12-01'), 10);
  assert.equal(atualizarPeriodos(p3, { id: 'p1', nome: 'x' }, 'agora'), undefined);
});

import { investimento, infoMercado } from '../src/lib/investimento.ts';

test('investimento: rentabilidade anualizada e stock', () => {
  const ps = [
    produto({ id: 'a', set_numero: '75192', data_compra: '2026-01-01', preco_compra: 100, estado: 'vendido', condicao: 'Novo e selado' }),
    produto({ id: 'b', set_numero: '75192', data_compra: '2026-06-01', preco_compra: 100, estado: 'anunciado', condicao: 'Novo e selado' }),
  ];
  const vs = [venda({ produto_id: 'a', preco_venda: 150, data_venda: '2026-07-01' })]; // 181 dias, +50
  const m = { brickset: { '75192': ['2017-10-01', '2024-12-31', 849.99, 649.99, 'Retired'] as never }, bricklink: { '75192': { n: [700, 12] as [number, number] } } };
  const r = investimento({ produtos: ps, vendas: vs }, m, '2026-10-01');
  assert.equal(r.lucro, 50);
  assert.equal(Math.round(r.rentabAnual! * 1000) / 1000, Math.round((50 / (100 * 181 / 365)) * 1000) / 1000);
  assert.equal(r.stockCusto, 100);
  assert.equal(r.stockDiasMedio, 122);
  assert.equal(r.valorEstimadoStock, 700);
  const l = r.linhas[0];
  assert.equal(l.fonteValor, 'bricklink');
  assert.equal(l.mercado!.retirado, true);
  assert.equal(infoMercado(m, '99999', '2026-10-01'), null);
  // sem BrickLink, o valor vem da nossa venda média
  assert.equal(investimento({ produtos: ps, vendas: vs }, null, '2026-10-01').valorEstimadoStock, 150);
});

import { sugerirPlano, tarefas } from '../src/lib/plano.ts';

test('plano: vender já quando o lucro compensa, guardar quando ainda vai valorizar', () => {
  const hojeT = '2026-10-27';
  const merc = {
    brickset: {
      '1': ['2025-01-01', '2026-12-31', 100, null, 'Retail'] as never, // sai em breve
      '2': ['2018-01-01', '2020-12-31', 50, null, 'Retired'] as never, // retirado há muito
    },
    bricklink: { '1': { n: [80, 10] as [number, number] }, '2': { n: [55, 10] as [number, number] } },
  };
  const ctx = (ps: Produto[]) => ({ dados: { produtos: ps, vendas: [], definicoes: [] }, mercado: merc, hoje: hojeT });
  // Comprado a 60, mercado a 80 → +33%: vender já
  const a = produto({ id: 'a', set_numero: '1', preco_compra: 60, estado: 'por_anunciar', condicao: 'Novo e selado' });
  const pa = sugerirPlano(a, ctx([a]));
  assert.equal(pa.acao, 'vender');
  assert.equal(pa.precoSugerido, 86); // 80 × 1,08
  // Comprado a 75, mercado a 80 (+7%) e sai em dez/26 → guardar
  const b = produto({ id: 'b', set_numero: '1', preco_compra: 75, estado: 'por_anunciar', condicao: 'Novo e selado' });
  const pb = sugerirPlano(b, ctx([b]));
  assert.equal(pb.acao, 'guardar');
  assert.ok(pb.ate! > hojeT);
  // Comprado a 52, retirado há anos, mercado 55 (+6%), valoriza 7%/ano → vender para libertar o dinheiro
  const c = produto({ id: 'c', set_numero: '2', preco_compra: 52, estado: 'por_anunciar', condicao: 'Novo e selado' });
  assert.equal(sugerirPlano(c, ctx([c])).acao, 'vender');
  // Tarefas: anunciar a; baixar um anunciado há 90 dias
  const d = produto({ id: 'd', set_numero: '2', preco_compra: 30, estado: 'anunciado', condicao: 'Novo e selado', preco_anuncio: 70, data_anuncio: '2026-07-01' });
  const t = tarefas(ctx([a, b, d]));
  assert.deepEqual(t.map((x) => [x.tipo, x.preco]), [['baixar', 65], ['anunciar', 86]]);
  // Adiada
  const t2 = tarefas({ ...ctx([a]), dados: { produtos: [a], vendas: [], definicoes: [{ chave: 'tarefas_adiadas', valor: { [t[1].id]: '2026-11-10' } as never }] } });
  assert.equal(t2.length, 0);
});

test('plano: Pokémon usa o preço do TCGplayer e valoriza a taxa fixa', () => {
  const p = produto({ id: 'k', nome: '30th Celebration ETB', marca: 'Pokémon', set_numero: null, preco_compra: 50, estado: 'por_anunciar' });
  const merc = { brickset: {}, bricklink: {}, pokemon: { '30th celebration etb': { id: 1, nome: 'x', set: null, usd: 100, eur: 90, auto: true } } };
  const pl = sugerirPlano(p, { dados: { produtos: [p], vendas: [], definicoes: [] }, mercado: merc, hoje: '2026-10-27' });
  assert.equal(pl.referencia?.fonte, 'tcgplayer');
  assert.equal(pl.acao, 'vender'); // +80%
  const q = { ...p, preco_compra: 85 }; // +6% agora; a 15%/ano chega a +20% em ~10 meses
  const pq = sugerirPlano(q, { dados: { produtos: [q], vendas: [], definicoes: [] }, mercado: merc, hoje: '2026-10-27' });
  assert.equal(pq.acao, 'guardar');
});

test('tarefas: só se anuncia 1 unidade de cada produto de cada vez', () => {
  const merc = { brickset: {}, bricklink: { '1': { n: [100, 10] as [number, number] } } };
  const a = produto({ id: 'a', set_numero: '1', preco_compra: 50, estado: 'por_anunciar', condicao: 'Novo e selado' });
  const b = produto({ id: 'b', set_numero: '1', preco_compra: 50, estado: 'por_anunciar', condicao: 'Novo e selado' });
  const ctx = (ps: Produto[]) => ({ dados: { produtos: ps, vendas: [], definicoes: [] }, mercado: merc, hoje: '2026-10-27' });
  const t = tarefas(ctx([a, b]));
  assert.equal(t.length, 1);
  assert.match(t[0].titulo, /^Anunciar Set a/); // sem "2×"
  const c = { ...b, id: 'c', estado: 'anunciado' as const, preco_anuncio: 108, data_anuncio: '2026-10-20' };
  assert.equal(tarefas(ctx([a, c])).filter((x) => x.tipo === 'anunciar').length, 0);
});
