// Avisos de gravação: quando uma gravação falha, aparece SEMPRE uma mensagem (nunca falha em
// silêncio) e nunca duas. As ações sem mensagem própria mostram "Não foi guardado: …"; os
// formulários mostram a sua. Uma leitura que falha não mostra o aviso de gravação.
// Supabase simulado e dados fictícios (ver comum.mjs).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { SB, abrirApp, abrirBrowser, anunciado, dia, fecharTudo, produtoBase, verificarSemFugas } from './comum.mjs';

const base = { ...produtoBase, tema: 'Star Wars', data_compra: dia(100) };
const dados = {
  pessoas: [{ id: 'pes1', nome: 'Pessoa Teste' }, { id: 'pes2', nome: 'Outra Teste' }],
  contas: [{ id: 'con1', nome: 'Conta Teste', titular_id: 'pes1', ativa: true, periodo: 'anual', limite_vendas: 30, limite_valor: 2000, alerta_pct: 80 }],
  compras: [{ id: 'com1', data: dia(100), tipo_pagamento: 'pessoa', pessoa_id: 'pes1', vendedor: 'Loja Teste', metodo_pagamento: null, valor_artigos: 200, portes: 0, outros_custos: 0, notas: null, distribuicao: 'individual' }],
  produtos: [
    { ...base, id: 'pBaixar', nome: 'Produto Baixar Teste', tema: 'Teste', preco_compra: 20, ...anunciado(100, 'con1', 70) },
    { ...base, id: 'pPlano', nome: 'Produto Plano Teste', tema: 'Teste', preco_compra: 30, estado: 'por_anunciar' },
    { ...base, id: 'pPoke', nome: 'ETB Teste Pokemon', marca: 'Pokémon', tema: 'Pokémon', preco_compra: 40, estado: 'por_anunciar' },
    { ...base, id: 'pParecido', nome: 'Falcon UCS grande', set_numero: '75192', preco_compra: 500, estado: 'por_anunciar' },
    { ...base, id: 'pDiferente', nome: 'Death Star', set_numero: '75313', preco_compra: 600, estado: 'por_anunciar' },
    { ...base, id: 'pTraduzido', nome: 'Casa na arvore', set_numero: '21318', tema: 'LEGO Ideas and CUUSOO', preco_compra: 150, estado: 'por_anunciar' },
    { ...base, id: 'pParecido2', nome: 'Falcon antigo', set_numero: '10179', preco_compra: 400, estado: 'por_anunciar' },
    { ...base, id: 'pTraduzido2', nome: 'Livraria', set_numero: '10270', tema: 'Modular Buildings', preco_compra: 120, estado: 'por_anunciar' },
  ],
  definicoes: [{ chave: 'promocoes', valor: [{ id: 'promo1', recebida: new Date().toISOString(), loja: 'Continente', desconto: 30, itens: [{ set: '75192' }] }] }],
};

async function detalhe(page, nome) {
  await page.goto(page.url().split('#')[0] + '#/produtos');
  await page.waitForTimeout(800);
  await page.getByText(nome).first().click();
  await page.waitForTimeout(800);
}
const cartao = (page, titulo) => page.locator('section.cartao').filter({ has: page.getByRole('heading', { name: titulo }) });

// ---------- As 13 ações sem aviso próprio (cada uma com sub-botões quando os há) ----------
const acoes = {
  '1 Baixei (O que fazer)': async (page) => {
    // "Baixar" vem depois de "Anunciar" e "Fotografar": pode estar fora das 5 primeiras tarefas
    const todas = page.getByRole('button', { name: /^Mostrar todas/ });
    if (await todas.count()) await todas.first().click();
    await page.getByRole('button', { name: 'Já baixei' }).first().click();
  },
  '2 Adiar (O que fazer)': async (page) => { await page.getByRole('button', { name: 'Adiar' }).first().click(); },
  '3 Plano manual': async (page) => {
    await detalhe(page, 'Produto Plano Teste');
    await page.getByRole('button', { name: 'Mudar plano' }).first().click();
    await page.locator('.opcao').nth(1).locator('input[type=radio]').check();
    await page.getByRole('button', { name: 'Guardar' }).last().click();
  },
  '4 PVP à mão': async (page) => {
    await detalhe(page, 'Produto Plano Teste');
    await page.getByRole('button', { name: 'indicar' }).first().click();
    await page.getByLabel('PVP em euros').fill('59,99');
    await page.getByLabel('PVP em euros').press('Enter');
  },
  '5 Associação Pokémon': async (page) => {
    await detalhe(page, 'ETB Teste Pokemon');
    await page.getByRole('button', { name: 'Indicar o produto' }).click();
    await page.getByPlaceholder('N.º ou endereço do TCGplayer').fill('123456');
    await page.locator('.associacao-tcg').getByRole('button', { name: 'Guardar' }).click();
  },
  '6 Venda fora da app': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/contas');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '+ Venda fora da app' }).first().click();
    await page.locator('.dinheiro input').last().fill('25');
    await page.getByRole('button', { name: 'Guardar' }).last().click();
  },
  '7a Pessoas: acrescentar': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/definicoes'); await page.waitForTimeout(800);
    const c = cartao(page, 'Pessoas');
    await c.getByPlaceholder('Nome').fill('Nova Teste');
    await c.getByRole('button', { name: 'Adicionar' }).click();
  },
  '7b Pessoas: renomear': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/definicoes'); await page.waitForTimeout(800);
    const i = cartao(page, 'Pessoas').getByLabel('Nome').first();
    await i.fill('Pessoa Renomeada');
    await i.blur();
  },
  '7c Pessoas: remover': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/definicoes'); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Remover Outra Teste' }).click();
    await page.getByRole('button', { name: 'Remover', exact: true }).click();
  },
  '8 Listas': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/definicoes'); await page.waitForTimeout(800);
    await page.getByText('Avançado').click();
    const c = cartao(page, 'Listas e categorias');
    await c.locator('textarea').first().fill('Valor de teste');
    await c.getByRole('button', { name: 'Guardar' }).first().click();
  },
  '9 Texto dos anúncios': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/definicoes'); await page.waitForTimeout(800);
    const c = cartao(page, 'Texto dos anúncios');
    await c.locator('textarea').first().fill('Texto de teste {nome}');
    await c.getByRole('button', { name: 'Guardar' }).click();
  },
  '10 Regras das sugestões': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/definicoes'); await page.waitForTimeout(800);
    const c = cartao(page, 'Regras das sugestões');
    await c.locator('input').first().fill('21');
    await c.getByRole('button', { name: 'Guardar' }).click();
  },
  '11a Rever nomes: usar oficial': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/rever-nomes'); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Usar oficial' }).first().click();
  },
  '11b Rever nomes: mudar n.º': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/rever-nomes'); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /^Mudar para/ }).first().click();
  },
  '11c Rever nomes: manter o nosso': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/rever-nomes'); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Manter o nosso' }).first().click();
  },
  '11d Rever nomes: manter os traduzidos': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/rever-nomes'); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /^Manter os .* nomes em português/ }).click();
  },
  '11e Rever nomes: usar todos os parecidos': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/rever-nomes'); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /^Usar o nome oficial nos/ }).click();
    await page.getByRole('button', { name: 'Substituir' }).click();
  },
  '12a Detalhe: usar nome oficial': async (page) => {
    await detalhe(page, 'Falcon UCS grande'); await page.waitForTimeout(1500);
    await page.locator('.sugestao-nome').getByRole('button', { name: 'Usar' }).click();
  },
  '12b Detalhe: mudar n.º': async (page) => {
    await detalhe(page, 'Death Star'); await page.waitForTimeout(1500);
    await page.locator('.sugestao-nome').getByRole('button', { name: 'Mudar n.º' }).click();
  },
  '13 Dispensar promoção': async (page) => {
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Dispensar' }).first().click();
  },
};

// ---------- Formulários que já tratam o erro (devem mostrar só a sua mensagem) ----------
const formularios = {
  'F1 Vendi': async (page) => {
    await detalhe(page, 'Produto Baixar Teste');
    await page.locator('button:visible', { hasText: /^Vendi$/ }).last().dispatchEvent('click');
    await page.locator('.vendi-preco input').fill('45');
    await page.getByRole('radio', { name: 'Conta Teste' }).click();
    await page.getByRole('button', { name: 'Guardar venda' }).click();
  },
  'F2 Editar produto': async (page) => {
    await detalhe(page, 'Produto Plano Teste');
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('button', { name: 'Guardar' }).last().click();
  },
  'F3 Editar conta': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/contas'); await page.waitForTimeout(800);
    await page.locator('button[aria-label^="Editar"], button[title^="Editar"]').first().click();
    await page.getByRole('button', { name: 'Guardar' }).last().click();
  },
  'F4 Transferência (Acertos)': async (page) => {
    await page.goto(page.url().split('#')[0] + '#/acertos'); await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Registar transferência|transferência/i }).first().click();
    await page.locator('.dinheiro input').last().fill('10');
    await page.getByRole('button', { name: 'Guardar' }).last().click();
  },
};


const ERRO = /Não foi guardado|Erro ao guardar|^Erro:/;
let browser;
before(async () => { browser = await abrirBrowser(); });
after(async () => { await fecharTudo(browser); });

for (const [grupo, lista, proprio] of [['ação', acoes, false], ['formulário', formularios, true]]) {
  for (const [nome, passos] of Object.entries(lista)) {
    for (const modo of ['falhar', 'ok']) {
      test(`${grupo} ${nome} (${modo === 'falhar' ? 'gravação falha' : 'gravação aceite'})`, async () => {
        const app = await abrirApp(browser, { dados, modo, rota: '#/', esperaInicial: 2500 });
        try {
          await passos(app.page);
          await app.page.waitForTimeout(1500);
          const avisos = await app.avisos();
          const escritas = app.escritas.filter((e) => !e.endsWith('/historico'));
          assert.ok(escritas.length > 0, 'a ação chegou a gravar');
          const erros = avisos.filter((a) => ERRO.test(a));
          if (modo === 'falhar') {
            assert.equal(erros.length, 1, 'exatamente uma mensagem de erro: ' + avisos.join(' | '));
            if (proprio) assert.doesNotMatch(erros[0], /Não foi guardado/, 'o formulário mostra a sua própria mensagem');
          } else {
            assert.deepEqual(erros, [], 'sem mensagens de erro');
          }
          assert.deepEqual(app.errosJs, []);
          verificarSemFugas(assert, app);
        } finally {
          await app.ctx.close();
        }
      });
    }
  }
}

test('uma leitura que falha não mostra o aviso de gravação', async () => {
  const app = await abrirApp(browser, { dados, rota: '#/', esperaInicial: 2500 });
  try {
    await app.ctx.route(SB + '/rest/v1/produtos*', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, json: { message: 'Leitura falhou' } }) : r.fallback()));
    await app.page.getByRole('button', { name: /Atualizar|↻/ }).first().click().catch(() => {});
    await app.page.waitForTimeout(1500);
    assert.ok(!(await app.avisos()).some((a) => /Não foi guardado/.test(a)));
    verificarSemFugas(assert, app);
  } finally {
    await app.ctx.close();
  }
});
