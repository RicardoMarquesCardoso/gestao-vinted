// Editar produto → fotografias: o ✕ só tira a foto do formulário; a foto só é apagada do
// Storage depois de o produto ser gravado. Cancelar não apaga nada.
// Supabase simulado e dados fictícios (ver comum.mjs).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG, abrirApp, abrirBrowser, abrirProduto, dia, fecharTudo, produtoBase, verificarSemFugas } from './comum.mjs';

const dados = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }],
  contas: [{ id: 'con1', nome: 'Conta Teste', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 }],
  compras: [{ id: 'com1', data: dia(40), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Teste', metodo_pagamento: null, valor_artigos: 50, portes: 0, outros_custos: 0, notas: null, distribuicao: 'individual' }],
  produtos: [{ ...produtoBase, id: 'prod1', nome: 'Produto Teste Um', set_numero: '11111', data_compra: dia(40), preco_compra: 20, estado: 'por_anunciar', fotos: ['prod1/a.jpg', 'prod1/b.jpg'] }],
};

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

async function abrirEditar(page) {
  await abrirProduto(page, 'Produto Teste Um');
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByText('Editar produto').waitFor();
}
async function removerPrimeira(page) {
  await page.getByRole('button', { name: 'Remover fotografia' }).first().click();
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.waitForTimeout(500);
}
const pedidosApagar = (app) => app.escritas.filter((e) => /^DELETE \/storage\//.test(e));

test('remover uma fotografia e cancelar: nada é apagado nem gravado', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/produtos', esperar: 'Produto Teste Um', esperaInicial: 2500 });
  try {
    const antes = app.escritas.length;
    await abrirEditar(app.page);
    await removerPrimeira(app.page);
    await app.page.getByRole('button', { name: 'Cancelar' }).click();
    await app.page.waitForTimeout(800);
    assert.deepEqual(app.escritas.slice(antes), [], 'nenhuma escrita');
    assert.deepEqual(app.db.produtos[0].fotos, ['prod1/a.jpg', 'prod1/b.jpg']);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('remover uma fotografia e guardar: grava o produto e só depois apaga a foto', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/produtos', esperar: 'Produto Teste Um', esperaInicial: 2500 });
  try {
    const antes = app.escritas.length;
    await abrirEditar(app.page);
    await removerPrimeira(app.page);
    await app.page.getByRole('button', { name: 'Guardar' }).click();
    await app.page.waitForTimeout(1500);
    const novas = app.escritas.slice(antes);
    const iProduto = novas.indexOf('POST /rest/v1/produtos');
    const iApagar = novas.findIndex((e) => /^DELETE \/storage\//.test(e));
    assert.ok(iProduto >= 0, 'produto gravado: ' + novas.join(', '));
    assert.ok(iApagar > iProduto, 'a foto só é apagada depois de gravar: ' + novas.join(', '));
    assert.deepEqual(app.db.produtos[0].fotos, ['prod1/b.jpg']);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('se a gravação falhar, a fotografia não é apagada', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/produtos', esperar: 'Produto Teste Um', esperaInicial: 2500, falhas: [{ metodo: 'POST', tabela: 'produtos', tipo: 'antes', vezes: 1 }] });
  try {
    await abrirEditar(app.page);
    await removerPrimeira(app.page);
    await app.page.getByRole('button', { name: 'Guardar' }).click();
    await app.page.waitForTimeout(1500);
    assert.deepEqual(pedidosApagar(app), [], 'nenhuma foto apagada');
    assert.deepEqual(app.db.produtos[0].fotos, ['prod1/a.jpg', 'prod1/b.jpg']);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('acrescentar uma fotografia e cancelar: o produto não muda', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/produtos', esperar: 'Produto Teste Um', esperaInicial: 2500 });
  try {
    await abrirEditar(app.page);
    await app.page.locator('input[type=file]').first().setInputFiles({ name: 'nova.png', mimeType: 'image/png', buffer: PNG });
    await app.page.waitForTimeout(2000);
    await app.page.getByRole('button', { name: 'Cancelar' }).click();
    await app.page.waitForTimeout(800);
    assert.ok(!app.escritas.includes('POST /rest/v1/produtos'), 'produto não gravado');
    assert.deepEqual(pedidosApagar(app), []);
    assert.deepEqual(app.db.produtos[0].fotos, ['prod1/a.jpg', 'prod1/b.jpg']);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});
