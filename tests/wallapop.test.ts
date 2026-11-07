// Testes do filtro dos anúncios da Wallapop (supabase/functions/_shared/wallapop.ts), com títulos
// reais do teste de nov/2026 (8 sets do stock).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarAnuncios, resumir } from '../supabase/functions/_shared/wallapop.ts';

const a = (titulo: string, preco: number) => ({ titulo, preco });

test('Wallapop: tira caixas vazias, molduras, minifiguras e outros sets', () => {
  const lista = [
    a('LEGO Ideas Disney Pixar Luxo Jr. 21357', 55),
    a('LEGO 21357 Disney Pixar Luxo Jr.', 59.99),
    a('Lego Ideas 21357 Luxo Jr.', 56),
    a('Caixa VAZIA LEGO 21357 Disney Pixar Luxo Jr.', 6),
    a('Caixa Vazia LEGO Ideas Luxo Jr. 21357', 3),
    a('LEGO Disney Pixar Luxo Jr.', 50), // sem n.º: fica de fora
    a('Marco expositor Dune Ornithopter 10327 de LEGO', 79.9),
    a('Lego 10327 Duna minifiguras', 80),
    a('2 Lego Speed Champions 77259 Audi e 77260 Toyota', 47),
    a('Kit Luzes LED Lego P67701 P76924', 20),
    a('Instruções LEGO Speed Champions 76924', 5),
    a('Conjunto LEGO 42127 TECHNIC BATMOBILE', 75),
  ];
  assert.deepEqual(
    filtrarAnuncios('21357', lista).map((x) => x.preco),
    [55, 59.99, 56],
  );
  assert.equal(filtrarAnuncios('10327', lista).length, 0);
  assert.equal(filtrarAnuncios('77260', lista).length, 0);
  assert.equal(filtrarAnuncios('76924', lista).length, 0);
});

test('Wallapop: usados ficam de fora e os preços estranhos também', () => {
  const lista = [
    a('LEGO 76188 Batman Classic TV Series Batmobile', 55),
    a('Lego 76188 Batmobile Classic TV Series', 65),
    a('LEGO 76188 Batmobile Série Clássica', 50),
    a('LEGO 76188 Batmobile Série de TV Clássica', 75),
    a('Lego 76188 montado sem caixa', 30),
    a('Caixa Lego 76188 Batman', 4), // abaixo de 40% da mediana
  ];
  const r = resumir('76188', lista);
  assert.equal(r.anuncios, 4);
  assert.equal(r.mediana, 60);
  assert.equal(r.total, 6);
});

test('Wallapop: com menos de 3 anúncios não há mediana', () => {
  const r = resumir('77260', [a('LEGO 77260 Fast & Furious Toyota Supra MK4', 19.99), a('LEGO Speed Champions 77260', 29)]);
  assert.equal(r.mediana, null);
  assert.equal(r.anuncios, 2);
});

test('Wallapop: aceita o n.º com sufixo e não confunde com números maiores', () => {
  const lista = [a('LEGO 75438 Star Wars Yoda', 30), a('LEGO 754380 outra coisa', 30), a('Lego Star Wars 75438 / Yoda, Novo lacrado.', 31.95), a('LEGO Star Wars Busto Yoda 75438', 29.9)];
  assert.equal(resumir('75438-1', lista).anuncios, 3);
});

// ---------- Na app: lib/wallapop.ts ----------
import { juntarMercado, racioWallapop, RACIO_WALLAPOP, wallapopAtual, wallapopNaData } from '../src/lib/wallapop.ts';

const defs = (v: unknown) => [{ chave: 'wallapop_pesquisas', valor: v }];

test('Wallapop na app: só conta com mediana, ≥ 3 anúncios e até 30 dias', () => {
  const d = defs({
    '76440': { data: '2026-11-07', mediana: 139, anuncios: 5 },
    '77260': { data: '2026-11-07', mediana: null, anuncios: 2 },
    '76188': { data: '2026-09-01', mediana: 62, anuncios: 8 },
  });
  assert.deepEqual(wallapopAtual(d, '76440-1', '2026-11-10'), [139, 5, '2026-11-07']);
  assert.equal(wallapopAtual(d, '77260', '2026-11-10'), null);
  assert.equal(wallapopAtual(d, '76188', '2026-11-10'), null);
  assert.equal(wallapopAtual([], '76440', '2026-11-10'), null);
});

test('Wallapop na app: histórico da mesma altura (±30 dias)', () => {
  const p = { '76440': { data: '2026-11-07', mediana: 139, anuncios: 5, hist: [['2026-09-01', 150, 6], ['2026-11-07', 139, 5]] as [string, number, number][] } };
  assert.equal(wallapopNaData(p, '76440', '2026-09-20'), 150);
  assert.equal(wallapopNaData(p, '76440', '2026-11-01'), 139);
  assert.equal(wallapopNaData(p, '76440', '2026-06-01'), null);
});

test('Mercado: média do eBay e da Wallapop pesada pelos anúncios (máx. 20 cada)', () => {
  assert.equal(juntarMercado({ preco: 60, pedido: 95, anuncios: 10 }, { preco: 70, pedido: 82, anuncios: 10 }), 65);
  // 40 anúncios no eBay valem 20; 5 na Wallapop valem 5
  assert.equal(juntarMercado({ preco: 60, pedido: 95, anuncios: 40 }, { preco: 85, pedido: 100, anuncios: 5 }), 65);
  assert.equal(juntarMercado(null, { preco: 70, pedido: 82, anuncios: 3 }), 70);
  assert.equal(juntarMercado(null, null), null);
});

test('Wallapop na app: sem vendas comparáveis usa a percentagem de reserva', () => {
  assert.equal(racioWallapop({ produtos: [], vendas: [], definicoes: [] }, '2026-11-07'), RACIO_WALLAPOP);
});

test('Wallapop inverosímil não conta (abaixo de metade do eBay ou de 30% do PVP)', async () => {
  const { wallapopPlausivel } = await import('../src/lib/wallapop.ts');
  assert.equal(wallapopPlausivel(15, 260, 230), false); // 76300 Arkham Asylum, nov/2026
  assert.equal(wallapopPlausivel(15, null, 230), false);
  assert.equal(wallapopPlausivel(60, 80, 70), true);
  assert.equal(wallapopPlausivel(20, null, null), true);
});
