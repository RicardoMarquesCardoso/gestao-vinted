// Anúncios em várias plataformas (fase 2, nov/2026), de ponta a ponta com dados fictícios:
//   1. um set anunciado na Vinted gera a tarefa "Anunciar … na Wallapop"; anunciar abre o anúncio da
//      Wallapop SEM fechar o da Vinted;
//   2. vender na Vinted a última unidade fecha o anúncio da Vinted e deixa o da Wallapop aberto, com a
//      tarefa "Retirar … da Wallapop"; "Retirei" fecha-o (a app nunca o retira sozinha);
//   3. na Vinted só pode haver um anúncio aberto por set: a janela Anunciar não deixa outro.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, abrirBrowser, abrirProduto, dia, fecharTudo, produtoBase, verificarSemFugas } from './comum.mjs';

const contas = [
  { id: 'cv', nome: 'Vinted Teste', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80, plataforma: 'vinted' },
  { id: 'cw', nome: 'Teste (Wallapop)', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80, plataforma: 'wallapop' },
];
const base = (x) => ({ ...produtoBase, set_numero: '99994', nome: 'Torre Teste', preco_compra: 30, condicao: 'Novo e selado', fotos: ['pt/a.jpg'], ...x });
const anuncio = (x) => ({ precos: [], fim: null, motivo: null, aproximado: false, id_externo: null, inicio: `${dia(5)}T10:00:00.000Z`, ...x });

const dadosUm = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }],
  contas,
  produtos: [base({ id: 'pt', estado: 'anunciado', conta_id: 'cv', preco_anuncio: 50, data_anuncio: dia(5) })],
  anuncios: [anuncio({ id: 'av', produto_id: 'pt', conta_id: 'cv', plataforma: 'vinted', preco: 50 })],
};

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

test('tarefa "Anunciar na Wallapop": abre o anúncio da Wallapop e mantém o da Vinted', async () => {
  const app = await abrirApp(browser, { dados: dadosUm, rota: '#/' });
  try {
    const { page } = app;
    const tarefa = page.locator('.tarefa', { hasText: 'na Wallapop' });
    await tarefa.waitFor({ timeout: 10000 });
    assert.match(await tarefa.textContent(), /Anunciar Torre Teste na Wallapop a 50,00/);
    await tarefa.getByRole('button', { name: 'Anunciar', exact: true }).click();
    await page.waitForTimeout(500);
    // A janela abre já na conta Wallapop
    assert.equal(await page.locator('.janela select').first().inputValue(), 'cw');
    await page.getByRole('button', { name: 'Marcar como anunciado' }).click();
    await page.waitForTimeout(1000);
    const abertos = app.db.anuncios.filter((a) => a.produto_id === 'pt' && !a.fim).map((a) => a.plataforma).sort();
    assert.deepEqual(abertos, ['vinted', 'wallapop'], 'os dois abertos');
    // O resumo do produto continua com a Vinted (principal)
    assert.equal(app.db.produtos.find((p) => p.id === 'pt').conta_id, 'cv');
    // O detalhe mostra as duas contas
    await abrirProduto(page, 'Torre Teste');
    assert.match(await page.locator('.linha-anuncio').first().textContent(), /Vinted Teste · Teste \(Wallapop\)/);
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('vender na Vinted a última unidade: fecha a Vinted, a Wallapop fica com "Retirar"; "Retirei" fecha-a', async () => {
  const dados = {
    ...dadosUm,
    anuncios: [...dadosUm.anuncios, anuncio({ id: 'aw', produto_id: 'pt', conta_id: 'cw', plataforma: 'wallapop', preco: 50, inicio: `${dia(3)}T10:00:00.000Z` })],
  };
  const app = await abrirApp(browser, { dados, rota: '#/' });
  try {
    const { page } = app;
    await abrirProduto(page, 'Torre Teste');
    await page.locator('button:visible', { hasText: /^Vendi$/ }).last().dispatchEvent('click');
    await page.waitForTimeout(500);
    // A conta da Vinted (principal) vem escolhida
    assert.equal(await page.getByRole('radio', { name: 'Vinted Teste' }).getAttribute('aria-checked'), 'true');
    await page.locator('.vendi-preco input').fill('50');
    await page.getByRole('button', { name: 'Guardar venda' }).click();
    await page.waitForTimeout(1200);
    assert.ok((await app.avisos()).some((t) => /Retira o anúncio da Wallapop/.test(t)), 'aviso para retirar');
    const av = app.db.anuncios.find((a) => a.id === 'av');
    const aw = app.db.anuncios.find((a) => a.id === 'aw');
    assert.equal(av.motivo, 'vendido');
    assert.equal(aw.fim, null, 'a Wallapop não se retira sozinha');
    assert.equal(app.db.produtos.find((p) => p.id === 'pt').estado, 'vendido');

    // No Painel: "Retirar Torre Teste da Wallapop" → Retirei
    await page.goto('https://ricardomarquescardoso.github.io/gestao-vinted/#/');
    const tarefa = page.locator('.tarefa', { hasText: 'da Wallapop' });
    await tarefa.waitFor({ timeout: 10000 });
    assert.match(await tarefa.textContent(), /Retirar Torre Teste da Wallapop/);
    await tarefa.getByRole('button', { name: 'Retirei' }).click();
    await page.waitForTimeout(1000);
    const aw2 = app.db.anuncios.find((a) => a.id === 'aw');
    assert.ok(aw2.fim, 'fechado');
    assert.equal(aw2.motivo, 'retirado');
    assert.equal(await page.locator('.tarefa', { hasText: 'da Wallapop' }).count(), 0);
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});

test('Vinted: só um anúncio aberto por set (a 2.ª unidade não se anuncia lá)', async () => {
  const dados = {
    ...dadosUm,
    produtos: [...dadosUm.produtos, base({ id: 'pt2', estado: 'por_anunciar', fotos: [], data_compra: dia(10) })],
  };
  const app = await abrirApp(browser, { dados, rota: '#/' });
  try {
    const { page } = app;
    // Sem tarefa "Anunciar na Vinted" para o set (já lá está)
    assert.equal(await page.locator('.tarefa', { hasText: /Anunciar .* na Vinted a/ }).count(), 0);
    // Forçar pela janela, a partir da 2.ª unidade: na conta Vinted fica bloqueado
    await page.evaluate(() => { location.hash = '#/produtos'; });
    await page.waitForTimeout(800);
    await abrirProduto(page, 'Torre Teste');
    // Na janela do grupo, "Anunciar" (há a Wallapop por anunciar); escolher a conta Vinted
    await page.getByRole('button', { name: 'Anunciar', exact: true }).last().click();
    await page.waitForTimeout(500);
    await page.locator('.janela select').first().selectOption('cv');
    await page.waitForTimeout(300);
    const texto = await page.locator('.janela').last().textContent();
    assert.match(texto, /Já está anunciado na Vinted|só pode haver um anúncio por set/);
    assert.equal(await page.getByRole('button', { name: 'Marcar como anunciado' }).isDisabled(), true);
    const antes = app.db.anuncios.length;
    await page.waitForTimeout(300);
    assert.equal(app.db.anuncios.length, antes, 'nada gravado');
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});
