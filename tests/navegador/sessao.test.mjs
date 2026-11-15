// Sessão expirada: nenhuma gravação pode mostrar sucesso sem ter sido gravada. Quando a sessão
// termina a meio de uma gravação, a app volta ao ecrã de entrada com a mensagem própria.
// Supabase simulado, sessão falsa e dados fictícios (ver comum.mjs).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, abrirBrowser, anunciado, clicar, dia, fecharTudo, irPara, produtoBase, verificarSemFugas } from './comum.mjs';

const MSG_GRAVACAO = /A sessão terminou a meio de uma gravação/;
const dados = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }, { id: 'pes2', nome: 'Outra Teste' }],
  contas: [{ id: 'con1', nome: 'Conta Teste', titular_id: 'pes2', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 }],
  compras: [{ id: 'com1', data: dia(50), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Teste', metodo_pagamento: null, valor_artigos: 100, portes: 0, outros_custos: 0, notas: null, distribuicao: 'individual' }],
  produtos: [
    { ...produtoBase, id: 'pSolo', nome: 'Solo Teste', preco_compra: 20, ...anunciado(50) },
    { ...produtoBase, id: 'pBaixar', nome: 'Baixar Teste', preco_compra: 20, ...anunciado(100, 'con1', 70) },
  ],
};

async function vendi(app, { matarAoGuardar = false } = {}) {
  const { page } = app;
  await page.getByText('Solo Teste').first().click();
  await page.waitForTimeout(700);
  await clicar(page, /^Vendi$/);
  await page.waitForTimeout(500);
  await page.locator('.vendi-preco input').fill('55');
  await page.getByRole('radio', { name: 'Conta Teste' }).click();
  if (matarAoGuardar) app.matar();
  await clicar(page, /^Guardar venda$/);
  await page.waitForTimeout(2000);
}
async function compra(app, { matarAoGuardar = false } = {}) {
  const { page } = app;
  await irPara(page, '#/');
  await page.getByRole('button', { name: /Registar compra/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.janela select').first().selectOption('pes1');
  await page.getByPlaceholder('Nome do produto').first().fill('Compra Nova Teste A');
  await page.locator('.janela .dinheiro input').first().fill('30');
  if (matarAoGuardar) app.matar();
  await clicar(page, /^Guardar$/);
  await page.waitForTimeout(2000);
}
const textoEcra = (page) => page.locator('body').innerText();

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

async function cenario(nome, opcoes, corpo) {
  test(nome, async () => {
    const app = await abrirApp(browser, { dados, rota: '#/produtos', esperar: 'Solo Teste', ...opcoes });
    try {
      await corpo(app);
      assert.deepEqual(app.errosJs, []);
      verificarSemFugas(assert, app);
    } finally {
      await app.ctx.close();
    }
  });
}

cenario('gravação normal: Vendi grava e mostra sucesso', {}, async (app) => {
  await vendi(app);
  assert.equal(app.db.vendas.length, 1);
  assert.ok((await app.avisos()).some((a) => /Venda registada/.test(a)));
});

for (const morre of ['renovacao', '401']) {
  const como = morre === 'renovacao' ? 'renovação recusada' : 'base de dados responde 401';
  cenario(`sessão termina antes de gravar (${como}): Vendi não grava nem mostra sucesso`, { sessao: { expiraEm: morre === 'renovacao' ? 30 : 86400, morre } }, async (app) => {
    await vendi(app, { matarAoGuardar: true });
    assert.equal(app.db.vendas.length, 0, 'nenhuma venda gravada');
    assert.ok(!(await app.avisos()).some((a) => /registada/.test(a)), 'sem aviso de sucesso');
    assert.match(await textoEcra(app.page), MSG_GRAVACAO);
  });
  cenario(`sessão termina antes de gravar (${como}): Registar compra não grava`, { sessao: { expiraEm: morre === 'renovacao' ? 30 : 86400, morre } }, async (app) => {
    await compra(app, { matarAoGuardar: true });
    assert.equal(app.db.compras.length, 1, 'nenhuma compra nova');
    assert.ok(!(await app.avisos()).some((a) => /registada/.test(a)));
    assert.match(await textoEcra(app.page), MSG_GRAVACAO);
  });
}

cenario('venda gravada e a sessão termina antes do produto: sem sucesso falso', { sessao: { morre: '401' } }, async (app) => {
  app.estado.aoEscrever = (m, tabela) => { if (m === 'POST' && tabela === 'vendas') app.matar(); };
  await vendi(app);
  assert.equal(app.db.vendas.length, 1, 'a venda ficou gravada');
  assert.equal(app.db.produtos.find((p) => p.id === 'pSolo').estado, 'anunciado', 'o produto não mudou');
  assert.ok(!(await app.avisos()).some((a) => /registada/.test(a)), 'sem aviso de sucesso');
  assert.match(await textoEcra(app.page), MSG_GRAVACAO);
});

cenario('erro 500 do Supabase: mostra o erro e não grava', { falhas: [{ metodo: 'POST', tabela: 'vendas', tipo: 'antes', vezes: 1 }] }, async (app) => {
  await vendi(app);
  assert.equal(app.db.vendas.length, 0);
  assert.ok((await app.avisos()).some((a) => /Erro ao guardar/.test(a)));
  assert.doesNotMatch(await textoEcra(app.page), MSG_GRAVACAO);
});

cenario('"Já baixei" com a sessão terminada: não mostra sucesso', { sessao: { expiraEm: 30, morre: 'renovacao' }, rota: '#/', esperar: null }, async (app) => {
  await app.page.waitForTimeout(800);
  app.matar();
  await clicar(app.page, /^Já baixei$/);
  await app.page.waitForTimeout(2000);
  assert.equal(app.db.produtos.find((p) => p.id === 'pBaixar').preco_anuncio, 100, 'preço não mudou');
  assert.ok(!(await app.avisos()).some((a) => /Preço atualizado/.test(a)));
  assert.match(await textoEcra(app.page), MSG_GRAVACAO);
});
