// Testes do piloto Wallapop (lib/wallapop.ts): texto, limites, estado, peso e o código do botão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELO_PADRAO } from '../src/lib/anuncio';
import {
  MAX_DESCRICAO,
  MAX_TITULO,
  ORIGEM_APP,
  TEXTO_WALLAPOP,
  codigoBotaoWallapop,
  cortar,
  dadosWallapop,
  eContaWallapop,
  escalaoPeso,
  estadoWallapop,
} from '../src/lib/wallapop';

const set = { nome: 'Castelo dos Cavaleiros do Leão', set_numero: '10305', tema: 'Icons', condicao: 'Novo e selado', marca: 'LEGO' };

test('contas Wallapop pelo nome "TITULAR (Wallapop)"', () => {
  assert.equal(eContaWallapop('RM1 (Wallapop)'), true);
  assert.equal(eContaWallapop('rm1 ( wallapop )'), true);
  assert.equal(eContaWallapop('RM1'), false);
  assert.equal(eContaWallapop('RM1 (eBay)'), false);
  assert.equal(eContaWallapop(null), false);
});

test('cortar respeita o limite e não deixa palavras a meio', () => {
  assert.equal(cortar('curto', 50), 'curto');
  const t = cortar('Lego 75313 AT-AT Ultimate Collector Series com caixa original grande', 50);
  assert.ok(t.length <= 50);
  assert.ok(!t.endsWith(' '));
  assert.equal(t, 'Lego 75313 AT-AT Ultimate Collector Series com');
  assert.equal(cortar('x'.repeat(80), 50).length, 50); // sem espaços: corta a direito
});

test('escalões de peso da Wallapop (peso da caixa)', () => {
  assert.equal(escalaoPeso(null), null);
  assert.equal(escalaoPeso(0), null);
  assert.equal(escalaoPeso(800), 0); // 0–1 kg
  assert.equal(escalaoPeso(1000), 0);
  assert.equal(escalaoPeso(1001), 1); // 1–2 kg
  assert.equal(escalaoPeso(4200), 2); // 2–5 kg
  assert.equal(escalaoPeso(9999), 3);
  assert.equal(escalaoPeso(15000), 4);
  assert.equal(escalaoPeso(30000), 5);
  assert.equal(escalaoPeso(31000), null); // fora dos escalões
});

test('estado: novos → Novo; usados → Praticamente novo', () => {
  assert.equal(estadoWallapop({ condicao: 'Novo e selado' }), 'Novo');
  assert.equal(estadoWallapop({ condicao: 'Novo sem selo' }), 'Novo');
  assert.equal(estadoWallapop({ condicao: null }), 'Novo');
  assert.equal(estadoWallapop({ condicao: 'Usado completo' }), 'Praticamente novo');
});

test('dados: texto simples em português, limites e preço com vírgula', () => {
  const d = dadosWallapop(set, MODELO_PADRAO, 'c-wallapop', 49.9, 2300);
  assert.equal(d.titulo, 'Lego 10305 Castelo dos Cavaleiros do Leão');
  assert.equal(d.descricao, TEXTO_WALLAPOP.novo.replace('{marca}', 'Lego'));
  assert.equal(d.estado, 'Novo');
  assert.equal(d.preco, '49,9');
  assert.equal(d.escalao, 2);
  assert.equal(d.vinteduo, 'dados');
  const u = dadosWallapop({ ...set, condicao: 'Usado completo' }, MODELO_PADRAO, 'c-wallapop', null, null);
  assert.ok(u.descricao.startsWith('Usado, completo'));
  assert.equal(u.preco, '');
  assert.equal(u.escalao, null);
});

test('dados: a descrição própria da conta tem prioridade e é cortada a 640', () => {
  const longo = 'Texto da conta. '.repeat(60);
  const m = { ...MODELO_PADRAO, contas: { cw: { novo: longo } } };
  const d = dadosWallapop(set, m, 'cw', 10, null);
  assert.ok(d.descricao.startsWith('Texto da conta.'));
  assert.ok(d.descricao.length <= MAX_DESCRICAO);
  // Os usados desta conta continuam com o texto da Wallapop (a conta só tem texto para novos)
  assert.ok(dadosWallapop({ ...set, condicao: 'Usado completo' }, m, 'cw', 10, null).descricao.startsWith('Usado, completo'));
});

test('dados: título longo cortado a 50', () => {
  const d = dadosWallapop({ ...set, nome: 'Millennium Falcon Ultimate Collector Series edição especial' }, MODELO_PADRAO, 'cw', 10, null);
  assert.ok(d.titulo.length <= MAX_TITULO);
});

test('o modelo da Vinted não muda', () => {
  // dadosWallapop não altera o modelo recebido
  const m = { ...MODELO_PADRAO, contas: { outra: { novo: 'x' } } };
  dadosWallapop(set, m, 'cw', 10, null);
  assert.deepEqual(Object.keys(m.contas), ['outra']);
});

test('código do botão: endereço javascript: válido, autossuficiente e com a origem da app', () => {
  const c = codigoBotaoWallapop();
  assert.ok(c.startsWith('javascript:('));
  assert.ok(c.includes(JSON.stringify(ORIGEM_APP)));
  // Tem de ser JavaScript válido sem nada de fora (compila sem erros)
  new Function(c.slice('javascript:'.length));
  assert.ok(!c.includes('import '));
});
