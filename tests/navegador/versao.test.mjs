// Aviso "Há uma versão nova — Recarregar" (components/VersaoNova.tsx), com dados fictícios.
// A app compara o código de versão que traz dentro com o de versao.json (publicado ao lado). Aqui
// simula-se a publicação de uma versão nova trocando a resposta de versao.json.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, abrirBrowser, fecharTudo, verificarSemFugas } from './comum.mjs';

let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

test('versão nova: sem mudança não aparece; com versão publicada diferente aparece e recarrega', async () => {
  const app = await abrirApp(browser, {});
  try {
    const { page, ctx } = app;
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.versao-nova').count(), 0, 'mesma versão: sem faixa');

    // "Publica-se" uma versão nova
    await ctx.route('**/versao.json*', (r) => r.fulfill({ body: JSON.stringify({ versao: 'outra-versao' }), contentType: 'application/json' }));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.versao-nova').waitFor({ timeout: 5000 });
    assert.match(await page.locator('.versao-nova').textContent(), /versão nova/);

    // Recarregar volta a abrir a app (aqui a "nova" continua diferente, por isso a faixa volta)
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Recarregar' }).click()]);
    assert.deepEqual(app.errosJs, []);
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});
