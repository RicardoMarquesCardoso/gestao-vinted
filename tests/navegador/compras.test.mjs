// Compras: só se registam (não se editam depois); a lista de Compras é só de consulta; as
// correções fazem-se em cada produto. E o CSV dos produtos leva os campos da compra.
// Supabase simulado e dados fictícios (ver comum.mjs).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { abrirApp, abrirBrowser, abrirProduto, anunciado, clicar, dia, fecharTudo, produtoBase, verificarSemFugas } from './comum.mjs';

const dados = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }, { id: 'pes2', nome: 'Outra Teste' }],
  contas: [{ id: 'con1', nome: 'Conta Teste', titular_id: 'pes2', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 }],
  compras: [
    { id: 'com2', data: dia(80), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Antiga', metodo_pagamento: 'MB Way', valor_artigos: 40, portes: 3, outros_custos: 0, notas: 'Nota de teste', distribuicao: 'individual' },
    { id: 'com1', data: dia(50), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Teste', metodo_pagamento: null, valor_artigos: 100, portes: 0, outros_custos: 0, notas: null, distribuicao: 'individual' },
  ],
  produtos: [
    { ...produtoBase, id: 'pSolo', nome: 'Solo Teste', preco_compra: 20, ...anunciado(50) },
    { ...produtoBase, id: 'pMistoA', nome: 'Antiga Misto A', compra_id: 'com2', data_compra: dia(80), preco_compra: 30, custos_adicionais: 1.5, estado: 'por_anunciar' },
    { ...produtoBase, id: 'pMistoB', nome: 'Antiga Misto B', compra_id: 'com2', data_compra: dia(75), preco_compra: 10, custos_adicionais: 0.77, estado: 'por_anunciar', pessoa_id: 'pes2' },
  ],
};

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

test('tocar numa compra da lista não abre formulário de edição', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/compras' });
  try {
    await app.page.locator('.lista-registos .registo').first().click({ force: true });
    await app.page.waitForTimeout(800);
    assert.equal(await app.page.locator('.janela').count(), 0, 'nenhuma janela aberta');
    assert.equal(await app.page.getByText('Editar compra').count(), 0);
    assert.deepEqual(app.escritas.filter((e) => !e.endsWith('/historico')), []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('registar compra: todos os produtos herdam a data e quem pagou', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/' });
  try {
    const { page } = app;
    await page.getByRole('button', { name: /Registar compra/ }).first().click();
    await page.waitForTimeout(600);
    assert.equal((await page.locator('.janela h2').first().innerText()).trim(), 'Nova compra');
    await page.locator('.janela select').first().selectOption('pes2');
    const nomes = page.getByPlaceholder('Nome do produto');
    for (const [i, preco] of ['30', '20', '10'].entries()) {
      if (i) {
        await clicar(page, /^\+ Acrescentar produto$/);
        await page.waitForTimeout(200);
      }
      await nomes.nth(i).fill('Nova Compra Produto ' + 'ABC'[i]);
      await page.locator('.janela .dinheiro input').nth(i).fill(preco);
    }
    await clicar(page, /^Guardar$/);
    await page.waitForTimeout(1500);
    const nova = app.db.compras.find((c) => !['com1', 'com2'].includes(c.id));
    assert.ok(nova, 'compra nova gravada');
    const produtos = app.db.produtos.filter((p) => p.compra_id === nova.id);
    assert.equal(produtos.length, 3);
    for (const p of produtos) {
      assert.equal(p.pessoa_id, 'pes2', 'herda quem pagou');
      assert.equal(p.data_compra, nova.data, 'herda a data');
    }
    assert.ok(!app.escritas.some((e) => e.startsWith('DELETE')), 'nada apagado');
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('corrigir um produto não mexe nos outros produtos da mesma compra', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/produtos', esperar: 'Antiga Misto A' });
  try {
    const { page } = app;
    await abrirProduto(page, 'Antiga Misto A');
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').filter({ has: page.locator('option[value="pes2"]') }).first().selectOption('pes2');
    await page.locator('.janela .dinheiro input').first().fill('33');
    await page.getByRole('button', { name: 'Guardar' }).last().click();
    await page.waitForTimeout(1500);
    const a = app.db.produtos.find((p) => p.id === 'pMistoA');
    const b = app.db.produtos.find((p) => p.id === 'pMistoB');
    assert.equal(a.pessoa_id, 'pes2');
    assert.equal(Number(a.preco_compra), 33);
    assert.equal(b.pessoa_id, 'pes2', 'o outro produto mantém o seu pagador');
    assert.equal(Number(b.preco_compra), 10, 'o outro produto mantém o seu custo');
    assert.deepEqual(app.db.compras.map((c) => c.id), ['com2', 'com1'], 'compras intactas');
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('CSV dos produtos leva os campos da compra', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/produtos', esperar: 'Solo Teste' });
  try {
    const [download] = await Promise.all([app.page.waitForEvent('download'), app.page.getByRole('button', { name: 'Exportar CSV' }).first().click()]);
    const linhas = fs.readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    const cab = linhas[0].split(';');
    for (const c of ['Quem pagou', 'Comprado a', 'Método de pagamento', 'Notas da compra']) assert.ok(cab.includes(c), 'coluna ' + c);
    const linhaB = linhas.find((l) => l.startsWith('Antiga Misto B;')).split(';');
    const col = (n) => linhaB[cab.indexOf(n)];
    assert.equal(col('Quem pagou'), 'Outra Teste');
    assert.equal(col('Comprado a'), 'Loja Antiga');
    assert.equal(col('Método de pagamento'), 'MB Way');
    assert.equal(col('Notas da compra'), 'Nota de teste');
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

