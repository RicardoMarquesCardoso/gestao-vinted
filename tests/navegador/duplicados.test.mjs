// "Repetir sem duplicar": quando uma gravação falha (antes de gravar, a meio, ou com a resposta
// perdida) e se carrega outra vez em Guardar, fica UMA venda/compra, nunca duas.
// Supabase simulado e dados fictícios (ver comum.mjs).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, abrirBrowser, anunciado, clicar, dia, fecharTudo, irPara, produtoBase, verificarSemFugas } from './comum.mjs';

const dados = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }, { id: 'pes2', nome: 'Outra Teste' }],
  contas: [{ id: 'con1', nome: 'Conta Teste', titular_id: 'pes2', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 }],
  compras: [{ id: 'com1', data: dia(50), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Teste', metodo_pagamento: null, valor_artigos: 100, portes: 0, outros_custos: 0, notas: null, distribuicao: 'individual' }],
  produtos: [
    { ...produtoBase, id: 'pSolo', nome: 'Solo Teste', preco_compra: 20, ...anunciado(50) },
    { ...produtoBase, id: 'pDuas', nome: 'Duas Unidades Teste', quantidade: 2, preco_compra: 40, ...anunciado(60) },
    { ...produtoBase, id: 'pG1', nome: 'Grupo Teste', set_numero: '99991', preco_compra: 20, ...anunciado(70) },
    { ...produtoBase, id: 'pG2', nome: 'Grupo Teste', set_numero: '99991', preco_compra: 20, estado: 'por_anunciar', data_compra: dia(40) },
  ],
};

async function abrirVendi(page, nome) {
  await page.getByText(nome).first().click();
  await page.waitForTimeout(700);
  await clicar(page, /^Vendi$/);
  await page.waitForTimeout(500);
}
async function vendiGuardar(page, preco) {
  await page.locator('.vendi-preco input').fill(String(preco));
  await page.getByRole('radio', { name: 'Conta Teste' }).click();
  await clicar(page, /^Guardar venda$/);
  await page.waitForTimeout(1200);
}
async function registarVenda(page, nome, { foraLimites = false } = {}) {
  await abrirVendi(page, nome);
  await clicar(page, /^Mais opções$/);
  await page.waitForTimeout(600);
  if (foraLimites) {
    await page.getByText('Mais detalhes').last().click();
    await page.getByText('Não conta para os limites').check();
  }
}
async function registarCompra(page) {
  await irPara(page, '#/');
  await page.getByRole('button', { name: /Registar compra/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.janela select').first().selectOption('pes1');
  const nomes = page.getByPlaceholder('Nome do produto');
  await nomes.first().fill('Compra Nova Teste A');
  await page.locator('.janela .dinheiro input').first().fill('30');
  await clicar(page, /^\+ Acrescentar produto$/);
  await nomes.nth(1).fill('Compra Nova Teste B');
  await page.locator('.janela .dinheiro input').nth(1).fill('20');
}
const repetir = async (page, botao) => {
  await page.waitForTimeout(1200);
  await clicar(page, botao);
};

// nome → { falhas, passos, vendas esperadas, produto: [id, estado], compras novas esperadas }
const cenarios = [
  ['V0 Vendi, tudo bem', [], async (pg) => { await abrirVendi(pg, 'Solo Teste'); await vendiGuardar(pg, 55); }, ['pSolo:55'], ['pSolo', 'vendido']],
  ['V1 Vendi: falha antes de gravar, repetir', [{ metodo: 'POST', tabela: 'vendas', tipo: 'antes', vezes: 1 }], async (pg) => { await abrirVendi(pg, 'Solo Teste'); await vendiGuardar(pg, 55); await repetir(pg, /^Guardar venda$/); }, ['pSolo:55'], ['pSolo', 'vendido']],
  ['V2 Vendi: venda gravada, produto falha, repetir', [{ metodo: 'POST', tabela: 'produtos', tipo: 'antes', vezes: 1 }], async (pg) => { await abrirVendi(pg, 'Solo Teste'); await vendiGuardar(pg, 55); await repetir(pg, /^Guardar venda$/); }, ['pSolo:55'], ['pSolo', 'vendido']],
  ['V3 Vendi: produto com 2 unidades falha, repetir', [{ metodo: 'POST', tabela: 'produtos', tipo: 'antes', vezes: 1 }], async (pg) => { await abrirVendi(pg, 'Duas Unidades Teste'); await vendiGuardar(pg, 65); await repetir(pg, /^Guardar venda$/); }, ['pDuas:65'], ['pDuas', 'por_anunciar']],
  ['V4 Vendi: grupo de iguais, produto falha, repetir', [{ metodo: 'POST', tabela: 'produtos', tipo: 'antes', vezes: 1 }], async (pg) => { await abrirVendi(pg, 'Grupo Teste'); await vendiGuardar(pg, 75); await repetir(pg, /^Guardar venda$/); }, ['pG1:75'], ['pG1', 'vendido']],
  ['V5 Vendi: resposta perdida, repetir', [{ metodo: 'POST', tabela: 'vendas', tipo: 'depois', vezes: 1 }], async (pg) => { await abrirVendi(pg, 'Solo Teste'); await vendiGuardar(pg, 55); await repetir(pg, /^Guardar venda$/); }, ['pSolo:55'], ['pSolo', 'vendido']],
  ['R0 Registar venda, tudo bem', [], async (pg) => { await registarVenda(pg, 'Duas Unidades Teste'); await clicar(pg, /^Guardar$/); }, ['pDuas:60'], ['pDuas', 'por_anunciar']],
  ['R1 Registar venda: produto falha, repetir', [{ metodo: 'POST', tabela: 'produtos', tipo: 'antes', vezes: 1 }], async (pg) => { await registarVenda(pg, 'Duas Unidades Teste'); await clicar(pg, /^Guardar$/); await repetir(pg, /^Guardar$/); }, ['pDuas:60'], ['pDuas', 'por_anunciar']],
  ['R2 Registar venda fora dos limites: definições falham, repetir', [{ metodo: 'POST', tabela: 'definicoes', tipo: 'antes', vezes: 1 }], async (pg) => { await registarVenda(pg, 'Solo Teste', { foraLimites: true }); await clicar(pg, /^Guardar$/); await repetir(pg, /^Guardar$/); }, ['pSolo:50'], ['pSolo', 'vendido']],
  ['R3 Registar venda: resposta perdida, repetir', [{ metodo: 'POST', tabela: 'vendas', tipo: 'depois', vezes: 1 }], async (pg) => { await registarVenda(pg, 'Solo Teste'); await clicar(pg, /^Guardar$/); await repetir(pg, /^Guardar$/); }, ['pSolo:50'], ['pSolo', 'vendido']],
  ['C0 Registar compra, tudo bem', [], async (pg) => { await registarCompra(pg); await clicar(pg, /^Guardar$/); }, [], null, 1],
  ['C1 Compra gravada, produtos falham, repetir', [{ metodo: 'POST', tabela: 'produtos', tipo: 'antes', vezes: 1 }], async (pg) => { await registarCompra(pg); await clicar(pg, /^Guardar$/); await repetir(pg, /^Guardar$/); }, [], null, 1],
  ['C2 Compra: resposta perdida, repetir', [{ metodo: 'POST', tabela: 'compras', tipo: 'depois', vezes: 1 }], async (pg) => { await registarCompra(pg); await clicar(pg, /^Guardar$/); await repetir(pg, /^Guardar$/); }, [], null, 1],
];

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

for (const [nome, falhas, passos, vendasEsperadas, produto, comprasNovas = 0] of cenarios) {
  test(nome, async () => {
    const app = await abrirApp(browser, { dados, falhas, rota: '#/produtos', esperar: 'Solo Teste' });
    try {
      await passos(app.page);
      await app.page.waitForTimeout(1500);
      const { db } = app;
      assert.deepEqual(db.vendas.map((v) => `${v.produto_id}:${v.preco_venda}`), vendasEsperadas, 'vendas gravadas');
      if (produto) assert.equal(db.produtos.find((p) => p.id === produto[0]).estado, produto[1], 'estado do produto');
      const novas = db.compras.filter((c) => c.id !== 'com1');
      assert.equal(novas.length, comprasNovas, 'compras novas');
      if (comprasNovas) assert.equal(db.produtos.filter((p) => p.compra_id === novas[0].id).length, 2, 'produtos da compra nova');
      const avisos = await app.avisos();
      if (falhas.length) assert.ok(avisos.some((a) => /Erro ao guardar/.test(a)), 'aviso do erro: ' + avisos.join(' | '));
      assert.ok(avisos.some((a) => /registada/.test(a)), 'aviso de sucesso: ' + avisos.join(' | '));
      assert.deepEqual(app.errosJs, []);
      verificarSemFugas(assert, app);
    } finally {
      await app.ctx.close();
    }
  });
}
