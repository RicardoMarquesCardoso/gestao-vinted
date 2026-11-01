// Testes dos destaques das Análises (src/lib/insights.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desempenhoTemas, destaques, mediana, periodoAnterior } from '../src/lib/insights.ts';
import type { Produto, Venda } from '../src/lib/types.ts';

const produto = (x: Partial<Produto>): Produto => ({
  id: 'p1', compra_id: null, nome: 'Set', descricao: null, marca: 'LEGO', tema: null, set_numero: null,
  condicao: null, quantidade: 1, data_compra: '2026-01-01', preco_compra: 10, custos_adicionais: 0,
  pessoa_id: null, tipo_pagamento: 'pessoa', estado: 'vendido', conta_id: 'c1', data_anuncio: null, preco_anuncio: null,
  notas: null, fotos: [], ...x,
});
const venda = (x: Partial<Venda>): Venda => ({
  id: 'v1', produto_id: 'p1', quantidade: 1, data_venda: '2026-01-31', data_conclusao: null,
  preco_venda: 30, conta_id: 'c1', pessoa_id: null, comissao: 0, portes: 0, outros_custos: 0,
  estado: 'concluida', notas: null, ...x,
});

test('período anterior: curto = logo antes; longo = mesmas datas do ano passado; sempre = nenhum', () => {
  assert.deepEqual(periodoAnterior({ inicio: '2026-10-01', fim: '2026-10-31' }, '2026-11-01'), { inicio: '2026-08-31', fim: '2026-09-30' });
  assert.deepEqual(periodoAnterior({ inicio: '2026-01-01', fim: '2026-11-01' }, '2026-11-01'), { inicio: '2025-01-01', fim: '2025-11-01' });
  assert.equal(periodoAnterior({ inicio: null, fim: null }, '2026-11-01'), null);
  assert.equal(mediana([3, 1, 2]), 2);
});

test('desempenho por tema e destaques do melhor/pior tema e da negociação', () => {
  const ps: Produto[] = [];
  const vs: Venda[] = [];
  // Tema A: compra 10, vende 30 em 30 dias (×3). Tema B: compra 20, vende 24 em 120 dias (×3)
  for (let i = 0; i < 3; i++) {
    ps.push(produto({ id: `a${i}`, tema: 'A', anuncios: [{ inicio: '2026-01-21T10:00:00Z', fim: '2026-01-31T10:00:00Z', motivo: 'vendido', preco: 32 }] }));
    vs.push(venda({ id: `va${i}`, produto_id: `a${i}` }));
    ps.push(produto({ id: `b${i}`, tema: 'B', preco_compra: 20 }));
    vs.push(venda({ id: `vb${i}`, produto_id: `b${i}`, preco_venda: 24, data_venda: '2026-05-01' }));
  }
  const i = { inicio: '2026-01-01', fim: '2026-12-31' };
  const t = desempenhoTemas({ produtos: ps, vendas: vs }, i);
  const a = t.find((x) => x.nome === 'A')!;
  assert.equal(a.vendas, 3);
  assert.equal(a.roi, 2);
  assert.equal(a.dias, 30);
  const ds = destaques({ produtos: ps, vendas: vs, contas: [], compras: [], pessoas: [], definicoes: [] } as never, i, '2026-06-01');
  assert.equal(ds.find((x) => x.id === 'melhor')!.titulo, 'Melhor tema: A');
  assert.equal(ds.find((x) => x.id === 'pior')!.titulo, 'Pior tema: B');
  assert.equal(ds.find((x) => x.id === 'negociacao')!.valor, '94%'); // 30 ÷ 32
  assert.equal(ds.find((x) => x.id === 'anunciado')!.valor, '10 dias');
});
