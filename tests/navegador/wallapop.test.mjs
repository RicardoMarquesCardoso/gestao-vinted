// Piloto Wallapop, de ponta a ponta: a app abre a "Wallapop" (uma página SIMULADA com os mesmos
// campos do formulário verdadeiro), e o botão da barra de favoritos (lido de Definições) preenche-a
// em dois cliques. Nada é publicado: a página simulada nem tem botão de publicar.
// Supabase simulado, Wallapop simulada e dados fictícios (ver comum.mjs).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, abrirBrowser, abrirProduto, dia, fecharTudo, produtoBase, verificarSemFugas } from './comum.mjs';

const URL_WALLAPOP = 'https://pt.wallapop.com/app/catalog/upload';
// Mesmos ids e estrutura que o formulário da Wallapop (lidos em nov/2026)
const PAGINA_WALLAPOP = `<!doctype html><meta charset="utf-8"><title>Wallapop simulada</title><body>
<div id="passo1">
  <textarea id="summary" name="summary" maxlength="50"></textarea>
  <div><input type="file" class="d-none" multiple accept="image/jpeg, image/png"></div>
  <label><input type="file" id="dropAreaPreviewInput" hidden multiple></label>
</div>
<script>
window.passo2 = () => {
  document.getElementById('passo1').remove();
  document.body.insertAdjacentHTML('beforeend', \`
    <input id="title" maxlength="50" value="Título inventado">
    <textarea id="description" maxlength="640">Descrição inventada</textarea>
    <div role="button" id="estadoBtn"><span>Estado*</span><input type="text" readonly><input type="hidden" id="condition" name="condition"></div>
    <input id="price_amount" maxlength="11">
    \${[0, 1, 2, 3, 4, 5].map((i) => '<input type="radio" id="' + i + '" name="' + i + '" value="' + i + '">').join('')}\`);
  document.getElementById('estadoBtn').addEventListener('click', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="lista"><div role="option">NovoNunca foi usado</div><div role="option">Praticamente novoPraticamente novo</div></div>');
    document.querySelectorAll('[role=option]').forEach((o) => o.addEventListener('click', () => {
      document.getElementById('condition').value = o.textContent.startsWith('Novo') ? 'new' : 'outro';
      document.getElementById('lista').remove();
    }));
  });
};
</script>`;

const dados = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }],
  contas: [
    { id: 'cv', nome: 'Conta Teste', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 },
    { id: 'cw', nome: 'Teste (Wallapop)', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 },
  ],
  compras: [{ id: 'com1', data: dia(30), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Teste', metodo_pagamento: null, valor_artigos: 50, portes: 0, outros_custos: 0, notas: null, distribuicao: 'individual' }],
  produtos: [{ ...produtoBase, id: 'pw', nome: 'Castelo Teste', set_numero: '99992', preco_compra: 30, estado: 'por_anunciar', fotos: ['pw/a.jpg', 'pw/b.jpg'] }],
};

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

test('botão Wallapop: preenche resumo e fotos, depois título, descrição, estado e preço', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/definicoes', paginas: { [URL_WALLAPOP]: PAGINA_WALLAPOP } });
  try {
    const { page, ctx } = app;
    // O botão da barra de favoritos, tal como aparece em Definições
    const href = await page.getByText('VinteDuo → Wallapop').getAttribute('href');
    assert.ok(href?.startsWith('javascript:'), 'endereço javascript: do botão');
    const botao = href.slice('javascript:'.length);

    // Janela Anunciar com a conta Wallapop
    await abrirProduto(page, 'Castelo Teste');
    await page.getByRole('button', { name: 'Anunciar', exact: true }).last().click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').first().selectOption('cw');
    await page.locator('.janela .dinheiro input').first().fill('49,90');
    await page.waitForTimeout(300);
    assert.ok(await page.getByText('Texto para a Wallapop').isVisible());
    const [w] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Abrir na Wallapop' }).click()]);
    await w.waitForLoadState();
    assert.equal(w.url(), URL_WALLAPOP);

    // 1.º clique
    await w.evaluate(botao);
    await w.waitForTimeout(2500);
    const p1 = await w.evaluate(() => ({ resumo: document.getElementById('summary').value, fotos: document.querySelector('input.d-none').files.length }));
    assert.equal(p1.resumo, 'Lego 99992 Castelo Teste');
    assert.equal(p1.fotos, 2, 'as duas fotografias');

    // 2.º clique, no formulário final
    await w.evaluate(() => window.passo2());
    await w.evaluate(botao);
    await w.waitForTimeout(2500);
    const p2 = await w.evaluate(() => ({
      titulo: document.getElementById('title').value,
      descricao: document.getElementById('description').value,
      preco: document.getElementById('price_amount').value,
      estado: document.getElementById('condition').value,
    }));
    assert.equal(p2.titulo, 'Lego 99992 Castelo Teste');
    assert.match(p2.descricao, /^Novo e selado/);
    assert.ok(p2.descricao.length <= 640);
    assert.equal(p2.preco, '49,9');
    assert.equal(p2.estado, 'new');

    // Nada foi gravado nem publicado por causa disto
    assert.deepEqual(app.escritas.filter((e) => !e.endsWith('/historico')), []);
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('botão Wallapop numa página aberta à mão (sem a app): não preenche nada', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/definicoes', paginas: { [URL_WALLAPOP]: PAGINA_WALLAPOP } });
  try {
    const href = await app.page.getByText('VinteDuo → Wallapop').getAttribute('href');
    const solta = await app.ctx.newPage();
    await solta.goto(URL_WALLAPOP);
    await solta.evaluate(href.slice('javascript:'.length));
    await solta.waitForTimeout(800);
    assert.equal(await solta.evaluate(() => document.getElementById('summary').value), '');
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

