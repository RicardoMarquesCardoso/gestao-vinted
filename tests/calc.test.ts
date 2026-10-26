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
  pessoa_id: null, estado: 'anunciado', conta_id: 'c1', data_anuncio: null, preco_anuncio: null,
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
  periodo_fim: null, alerta_pct: 80, ...x,
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
    pessoas: [], contas: [conta({})], definicoes: [],
    compras: [{ id: 'k1', data: '2026-01-01', pessoa_id: null, metodo_pagamento: null, vendedor: null, valor_artigos: 20, portes: 2, outros_custos: 0, distribuicao: 'igual', notas: null }],
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
