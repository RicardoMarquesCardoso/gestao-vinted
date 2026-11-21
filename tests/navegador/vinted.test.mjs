// "Abrir na Vinted" (computador), de ponta a ponta com dados fictícios: um clique descarrega as
// fotografias, copia a descrição e depois o título, e abre a página "Vender" da Vinted (aqui uma
// página SIMULADA: nada sai para a Vinted verdadeira). Nada corre dentro da página da Vinted.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, abrirBrowser, abrirProduto, dia, fecharTudo, produtoBase, verificarSemFugas } from './comum.mjs';

const URL_VINTED = 'https://www.vinted.pt/items/new';
const PAGINA_VINTED = '<!doctype html><title>Vender</title><p>Página simulada</p>';

const dados = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }],
  contas: [
    { id: 'cv', nome: 'Conta Teste', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 },
    { id: 'cw', nome: 'Teste (Wallapop)', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 },
  ],
  compras: [{ id: 'com1', data: dia(30), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Teste', metodo_pagamento: null, valor_artigos: 30, portes: 0, outros_custos: 0, notas: null, distribuicao: 'individual' }],
  produtos: [{ ...produtoBase, id: 'pf', nome: 'Farol Teste', set_numero: '99993', preco_compra: 30, estado: 'por_anunciar', fotos: ['pf/a.jpg', 'pf/b.jpg'] }],
};

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

test('Abrir na Vinted: descarrega as fotos, copia descrição e título, abre a página Vender', async () => {
  const app = await abrirApp(browser, { dados, paginas: { [URL_VINTED]: PAGINA_VINTED } });
  try {
    const { page, ctx } = app;
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    // Ver as cópias pela ordem em que acontecem (o histórico do Windows guarda as duas)
    await page.evaluate(() => {
      window.copias = [];
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (t) => { window.copias.push(t); return original(t); };
    });
    await abrirProduto(page, 'Farol Teste');
    await page.getByRole('button', { name: 'Anunciar', exact: true }).last().click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').first().selectOption('cv');
    await page.waitForTimeout(800); // as fotografias preparam-se ao abrir a janela

    const descarregados = [];
    page.on('download', (d) => descarregados.push(d.suggestedFilename()));
    const [v] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Abrir na Vinted' }).click()]);
    await v.waitForLoadState();
    assert.equal(v.url(), URL_VINTED);
    await page.waitForTimeout(1000);

    assert.equal(descarregados.length, 2, 'as 2 fotografias');
    assert.ok(descarregados[0].endsWith('1.jpg') && descarregados[1].endsWith('2.jpg'), `por ordem (${descarregados})`);
    const copias = await page.evaluate(() => window.copias);
    assert.equal(copias.length, 2, 'descrição e título');
    assert.match(copias[1], /99993/, 'o título fica por último (Ctrl+V)');
    assert.ok(copias[0].length > copias[1].length, 'a descrição primeiro (Win+V)');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), copias[1]);

    // Não marca nada como anunciado nem grava (isso continua a ser o "Marcar como anunciado")
    assert.deepEqual(app.escritas.filter((e) => !e.endsWith('/historico')), []);
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('Abrir na Vinted não aparece nas contas Wallapop', async () => {
  const app = await abrirApp(browser, { dados });
  try {
    const { page } = app;
    await abrirProduto(page, 'Farol Teste');
    await page.getByRole('button', { name: 'Anunciar', exact: true }).last().click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').first().selectOption('cw');
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole('button', { name: 'Abrir na Vinted' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Abrir na Wallapop' }).count(), 1);
  } finally {
    await app.ctx.close();
  }
});
