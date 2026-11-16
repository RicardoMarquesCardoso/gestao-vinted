// Piloto Wallapop, de ponta a ponta: a app abre a "Wallapop" (uma página SIMULADA com os mesmos
// campos do formulário verdadeiro), e o botão da barra de favoritos (lido de Definições) preenche-a
// num só clique: resumo e fotos, "Continuar" (simulado), e o formulário final. Depois a app marca o
// produto como anunciado. Nada é publicado: a página simulada nem tem botão de publicar.
// Supabase simulado, Wallapop simulada e dados fictícios (ver comum.mjs).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, abrirBrowser, abrirProduto, dia, fecharTudo, produtoBase, verificarSemFugas } from './comum.mjs';

// O formulário do passo "Algo de que não preciso mais" (o endereço sem /consumer-goods abre antes uma escolha)
const URL_WALLAPOP = 'https://pt.wallapop.com/app/catalog/upload/consumer-goods';
// Mesmos ids e estrutura que o formulário da Wallapop (vistos a 16/11/2026): 4 passos que ficam
// todos na página, cada um com o seu "Continuar" (um <button> dentro do shadow DOM de um
// walla-button); as listas (categoria, estado) só aceitam escolhas depois de abertas e o texto das
// opções está no aria-label.
const PAGINA_WALLAPOP = `<!doctype html><meta charset="utf-8"><title>Wallapop simulada</title><body><form>
<tsl-upload-step-template id="step-title"><section>
  <textarea id="summary" name="summary" maxlength="50"></textarea>
  <walla-button class="continuar"></walla-button>
</section></tsl-upload-step-template>
</form>
<script>
// Só um dos campos de ficheiros funciona (window.campoFotos: 'semId', o da Wallapop, ou 'area'; outro valor: nenhum)
window.campoFotos = 'semId';
window.fotosRecebidas = 0;
window.cliquesContinuar = 0;
const form = document.querySelector('form');
function continuar(host, ativo, seguinte) {
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = '<button disabled>Continuar</button>';
  const b = raiz.querySelector('button');
  b.addEventListener('click', () => { window.cliquesContinuar++; b.disabled = true; setTimeout(seguinte, 400); });
  return () => { b.disabled = !ativo(); };
}
function lista(host, opcoes, escolher) {
  host.insertAdjacentHTML('beforeend', '<div role="button" class="abrir"><input type="text" readonly></div>');
  host.querySelector('.abrir').addEventListener('click', () => {
    host.insertAdjacentHTML('beforeend', '<div role="listbox">' + opcoes + '</div>');
    host.querySelectorAll('[role=option]').forEach((o) => o.addEventListener('click', (e) => { escolher(o.getAttribute('aria-label'), e); host.querySelector('[role=listbox]').remove(); }));
  });
}
const atualizar1 = continuar(document.querySelector('#step-title .continuar'), () => document.getElementById('summary').value, passoFotos);
document.getElementById('summary').addEventListener('input', atualizar1);
function passoFotos() {
  if (document.getElementById('step-photo')) return;
  form.insertAdjacentHTML('beforeend', '<tsl-upload-step-template id="step-photo"><section><div><input type="file" class="d-none" multiple accept="image/jpeg"><walla-button></walla-button></div><label><input type="file" id="dropAreaPreviewInput" hidden multiple></label><div class="previews"></div><walla-button class="continuar"></walla-button></section></tsl-upload-step-template>');
  const atualizar = continuar(document.querySelector('#step-photo .continuar'), () => window.fotosRecebidas > 0, passoCategoria);
  const receber = (n) => setTimeout(() => {
    window.fotosRecebidas += n;
    for (let i = 0; i < n; i++) document.querySelector('#step-photo .previews').insertAdjacentHTML('beforeend', '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">');
    atualizar();
  }, 600);
  document.querySelector('#step-photo input.d-none').addEventListener('change', (e) => { if (window.campoFotos === 'semId') receber(e.target.files.length); });
  document.getElementById('dropAreaPreviewInput').addEventListener('change', (e) => { if (window.campoFotos === 'area') receber(e.target.files.length); });
}
function passoCategoria() {
  if (document.getElementById('step-category')) return;
  form.insertAdjacentHTML('beforeend', '<tsl-upload-step-template id="step-category"><section><walla-dropdown id="cat"><input type="hidden" id="category_leaf_id"></walla-dropdown></section></tsl-upload-step-template>');
  lista(document.getElementById('cat'), '<span>Categorias sugeridas</span><walla-dropdown-item role="option" aria-label="Brinquedos"><walla-list-item></walla-list-item></walla-dropdown-item><walla-dropdown-item role="option" aria-label="Colecionismo"><walla-list-item></walla-list-item></walla-dropdown-item><span>Todas as categorias</span><walla-dropdown-item role="option" aria-label="Casa e jardim"><walla-list-item></walla-list-item></walla-dropdown-item>', (nome, e) => {
    document.getElementById('category_leaf_id').value = nome;
    // Como na Wallapop: o formulário final só aparece com um "clique de pessoa" (houve mousedown antes)
    if (window.ratoEmBaixo) setTimeout(window.passoFinal, 400);
  });
  document.addEventListener('mousedown', () => { window.ratoEmBaixo = true; });
}
window.passoFinal = () => {
  if (document.getElementById('title')) return;
  form.insertAdjacentHTML('beforeend', \`
    <input id="title" maxlength="50" value="Título inventado">
    <textarea id="description" maxlength="640">Descrição inventada</textarea>
    <walla-dropdown id="estadoDd"><input type="hidden" id="condition" name="condition"></walla-dropdown>
    <input id="price_amount" maxlength="11">
    \${[0, 1, 2, 3, 4, 5].map((i) => '<input type="radio" id="' + i + '" name="peso" value="' + i + '">').join('')}\`);
  lista(document.getElementById('estadoDd'), '<walla-dropdown-item role="option" aria-label="Novo"></walla-dropdown-item><walla-dropdown-item role="option" aria-label="Praticamente novo"></walla-dropdown-item>', (nome) => {
    document.getElementById('condition').value = nome === 'Novo' ? 'new' : 'outro';
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
  produtos: [
    { ...produtoBase, id: 'pw', nome: 'Castelo Teste', set_numero: '99992', preco_compra: 30, estado: 'por_anunciar', fotos: ['pw/a.jpg', 'pw/b.jpg'] },
    // Um igual já vendido a 60 €: dá ao plano um preço sugerido para o pw
    { ...produtoBase, id: 'pv', nome: 'Castelo Teste', set_numero: '99992', preco_compra: 30, estado: 'vendido', data_compra: dia(80) },
  ],
  vendas: [{ id: 'v1', produto_id: 'pv', quantidade: 1, data_venda: dia(20), data_conclusao: dia(15), preco_venda: 60, conta_id: 'cv', pessoa_id: 'pes1', comissao: 0, portes: 0, outros_custos: 0, estado: 'concluida', notas: null, acertada: false }],
};

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

test('botão Wallapop: um clique preenche tudo (com Continuar) e a app marca como anunciado', async () => {
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
    // Preço já preenchido com o sugerido pelo plano (aberto do detalhe, sem vir das tarefas)
    const sugerido = await page.locator('.janela .dinheiro input').first().inputValue();
    assert.ok(sugerido && Number(sugerido.replace(',', '.')) > 0, `preço sugerido preenchido (${sugerido})`);
    await page.locator('.janela .dinheiro input').first().fill('49,90');
    await page.waitForTimeout(300);
    assert.ok(await page.getByText('Texto para a Wallapop').isVisible());
    const [w] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Abrir na Wallapop' }).click()]);
    await w.waitForLoadState();
    assert.equal(w.url(), URL_WALLAPOP);

    // Um só clique: mostra logo um sinal (antes, a espera pela app parecia "não faz nada")
    await w.evaluate(botao);
    assert.match(await w.evaluate(() => document.getElementById('vinteduo-aviso')?.textContent ?? ''), /a pedir os dados/);
    await w.waitForFunction(() => /marcado como anunciado/.test(document.getElementById('vinteduo-aviso')?.textContent ?? ''), null, { timeout: 60000 });
    assert.equal(await w.evaluate(() => window.fotosRecebidas), 2, 'as 2 fotografias, uma só vez');
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
    assert.equal(await w.evaluate(() => document.getElementById('category_leaf_id').value), 'Brinquedos', '1.ª categoria sugerida');
    assert.equal(await w.evaluate(() => window.cliquesContinuar), 2, 'o Continuar de cada passo, uma vez');
    assert.match(await w.evaluate(() => document.getElementById('vinteduo-aviso').textContent), /revê a categoria \(Brinquedos\)/i);

    // A app marcou o produto como anunciado na conta Wallapop, ao preço escolhido
    await page.waitForTimeout(1500);
    const pw = app.db.produtos.find((p) => p.id === 'pw');
    assert.equal(pw.estado, 'anunciado');
    assert.equal(pw.conta_id, 'cw');
    assert.equal(pw.preco_anuncio, 49.9);

    // Só se gravou o produto (nada mais)
    assert.deepEqual(app.escritas.filter((e) => !e.endsWith('/historico')).map((e) => e.split('?')[0]).filter((e) => !/\/produtos$/.test(e)), []);
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('botão Wallapop: as fotos entram pelo outro campo, só uma vez, e espera pelo Continuar', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/definicoes', paginas: { [URL_WALLAPOP]: PAGINA_WALLAPOP } });
  try {
    const { page, ctx } = app;
    const botao = (await page.getByText('VinteDuo → Wallapop').getAttribute('href')).slice('javascript:'.length);
    await abrirProduto(page, 'Castelo Teste');
    await page.getByRole('button', { name: 'Anunciar', exact: true }).last().click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').first().selectOption('cw');
    await page.waitForTimeout(300);
    const [w] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Abrir na Wallapop' }).click()]);
    await w.waitForLoadState();
    await w.evaluate(() => { window.campoFotos = 'area'; });
    await w.evaluate(botao);
    await w.waitForFunction(() => /marcado como anunciado/.test(document.getElementById('vinteduo-aviso')?.textContent ?? ''), null, { timeout: 60000 });
    assert.equal(await w.evaluate(() => window.fotosRecebidas), 2, 'as 2 fotografias, uma só vez');
    assert.equal(await w.evaluate(() => document.getElementById('title').value), 'Lego 99992 Castelo Teste');
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('botão Wallapop: se a Wallapop não aceita as fotos, diz o que fazer e continua depois', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/definicoes', paginas: { [URL_WALLAPOP]: PAGINA_WALLAPOP } });
  try {
    const { page, ctx } = app;
    const botao = (await page.getByText('VinteDuo → Wallapop').getAttribute('href')).slice('javascript:'.length);
    await abrirProduto(page, 'Castelo Teste');
    await page.getByRole('button', { name: 'Anunciar', exact: true }).last().click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').first().selectOption('cw');
    await page.waitForTimeout(300);
    const [w] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Abrir na Wallapop' }).click()]);
    await w.waitForLoadState();
    await w.evaluate(() => { window.campoFotos = 'nenhum'; });
    await w.evaluate(botao);
    await w.waitForFunction(() => /não aceitou as fotografias/.test(document.getElementById('vinteduo-aviso')?.textContent ?? ''), null, { timeout: 60000 });
    assert.equal(await w.evaluate(() => !!document.getElementById('step-category')), false, 'não passa das fotos');
    await page.waitForTimeout(500);
    assert.equal(app.db.produtos.find((p) => p.id === 'pw').estado, 'por_anunciar', 'não marca como anunciado');
    // A pessoa junta as fotos à mão e carrega em Continuar: o botão continua sozinho até ao fim
    await w.evaluate(() => {
      window.campoFotos = 'semId';
      const i = document.querySelector('#step-photo input.d-none');
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'm.jpg', { type: 'image/jpeg' }));
      i.files = dt.files;
      i.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(1500);
    await w.evaluate(() => document.querySelector('#step-photo .continuar').shadowRoot.querySelector('button').click());
    await w.waitForFunction(() => /marcado como anunciado/.test(document.getElementById('vinteduo-aviso')?.textContent ?? ''), null, { timeout: 60000 });
    assert.equal(await w.evaluate(() => document.getElementById('title').value), 'Lego 99992 Castelo Teste');
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('botão Wallapop já no formulário final (Continuar carregado à mão): preenche e marca', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/definicoes', paginas: { [URL_WALLAPOP]: PAGINA_WALLAPOP } });
  try {
    const { page, ctx } = app;
    const botao = (await page.getByText('VinteDuo → Wallapop').getAttribute('href')).slice('javascript:'.length);
    await abrirProduto(page, 'Castelo Teste');
    await page.getByRole('button', { name: 'Anunciar', exact: true }).last().click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').first().selectOption('cw');
    await page.waitForTimeout(300);
    const [w] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Abrir na Wallapop' }).click()]);
    await w.waitForLoadState();
    await w.evaluate(() => window.passoFinal());
    await w.evaluate(botao);
    await w.waitForFunction(() => /marcado como anunciado/.test(document.getElementById('vinteduo-aviso')?.textContent ?? ''), null, { timeout: 15000 });
    assert.equal(await w.evaluate(() => document.getElementById('title').value), 'Lego 99992 Castelo Teste');
    await page.waitForTimeout(1500);
    const pw = app.db.produtos.find((p) => p.id === 'pw');
    assert.equal(pw.estado, 'anunciado');
    assert.equal(pw.conta_id, 'cw');
    assert.ok(pw.preco_anuncio > 0, 'com o preço sugerido');
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
    assert.match(await solta.evaluate(() => document.getElementById('vinteduo-aviso')?.textContent ?? ''), /Abrir na Wallapop/);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

