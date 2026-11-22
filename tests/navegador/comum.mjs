// Base comum dos testes de browser (Playwright + Chromium).
//
// REGRAS DE SEGURANÇA (aplicadas aqui para todos os testes):
//   1. Nunca se tocam dados reais. A app é compilada para uma pasta temporária (nunca em docs/)
//      e servida pelo próprio teste. Todos os pedidos ao Supabase são respondidos por um
//      Supabase SIMULADO, em memória, com dados fictícios que cada teste cria. Nenhum pedido
//      ao Supabase verdadeiro chega a sair.
//   2. A sessão é falsa (token "falso", email @exemplo.invalid) e cada teste usa um browser novo,
//      isolado: não se usa a sessão nem os dados do browser de quem corre os testes.
//   3. Qualquer outro pedido para fora é bloqueado. Se um pedido que não seja de leitura (POST,
//      PUT, PATCH, DELETE…) tentar sair para um endereço não simulado, o teste FALHA
//      (verificarSemFugas). Leituras de imagens externas (ex.: Brickset) são bloqueadas em silêncio.
//   4. As pastas temporárias só são apagadas depois de confirmar que estão dentro da pasta
//      temporária do sistema (scripts/destino.mjs).
//
// Não precisa de serviços pagos nem de rede: só Node, Playwright e um Chromium (o do Playwright,
// `npx playwright install chromium`, ou o Chrome do sistema; GV_CHROME=<caminho> para outro).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { destinoSeguro } from '../../scripts/destino.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** O endereço do Supabase que a app usa (lido do código, para o simulador o apanhar sempre). */
export const SB = /SUPABASE_URL\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(RAIZ, 'src/config.ts'), 'utf8'))[1];
/** A app é servida no seu endereço verdadeiro, mas a partir da pasta temporária (nada sai para a rede). */
export const URL_APP = 'https://ricardomarquescardoso.github.io/gestao-vinted/';
const ORIGEM_APP = new URL(URL_APP).origin;

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const SESSAO_FALSA = { access_token: 'falso', refresh_token: 'falso', email: 'teste@exemplo.invalid', user_id: 'u1' };

// ---------------------------------------------------------------------------
// Datas e dados fictícios de base
// ---------------------------------------------------------------------------
const agora = new Date();
/** Data de há n dias (AAAA-MM-DD). */
export const dia = (n) => new Date(agora.getTime() - n * 864e5).toISOString().slice(0, 10);
export const AGORA = agora.toISOString();

/** Campos comuns de um produto fictício. */
export const produtoBase = {
  descricao: null, marca: 'LEGO', tema: 'Teste', condicao: 'Novo', quantidade: 1, custos_adicionais: 0,
  tipo_pagamento: 'pessoa', pessoa_id: 'pes1', conta_id: null, data_anuncio: null, preco_anuncio: null,
  notas: null, anuncios: [], fotos: [], compra_id: 'com1', data_compra: dia(50), criado_em: AGORA, set_numero: null,
};
/** Campos de um produto anunciado há 5 dias na conta con1. */
export const anunciado = (preco, conta = 'con1', dias = 5) => ({
  estado: 'anunciado', conta_id: conta, data_anuncio: dia(dias), preco_anuncio: preco,
  anuncios: [{ inicio: dia(dias) + 'T10:00:00.000Z', fim: null, conta_id: conta, preco, precos: [] }],
});

// ---------------------------------------------------------------------------
// Compilar a app para uma pasta temporária (uma vez por ficheiro de teste)
// ---------------------------------------------------------------------------
let pastaApp = null;
function compilarApp() {
  if (pastaApp) return pastaApp;
  const pasta = destinoSeguro(fs.mkdtempSync(path.join(os.tmpdir(), 'vinteduo-teste-')), RAIZ);
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts/build.mjs')], {
    env: { ...process.env, GV_DESTINO: pasta },
    stdio: 'pipe',
  });
  pastaApp = pasta;
  return pasta;
}

/** Apaga uma pasta temporária, só depois de confirmar que está dentro da pasta temporária do sistema. */
export function apagarTemporaria(pasta) {
  fs.rmSync(destinoSeguro(pasta, RAIZ), { recursive: true, force: true });
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------
/** Abre o Chromium (o do Playwright; senão o Chrome do sistema; GV_CHROME escolhe outro). */
export async function abrirBrowser() {
  compilarApp();
  const op = { headless: true };
  if (process.env.GV_CHROME) return chromium.launch({ ...op, executablePath: process.env.GV_CHROME });
  try {
    return await chromium.launch(op);
  } catch {
    return chromium.launch({ ...op, channel: 'chrome' });
  }
}

/** Fecha o browser e apaga a app compilada desta corrida. */
export async function fecharTudo(browser) {
  await browser?.close();
  if (pastaApp) apagarTemporaria(pastaApp);
  pastaApp = null;
}

// ---------------------------------------------------------------------------
// Supabase simulado
// ---------------------------------------------------------------------------
const chaveDe = (t) => (t === 'definicoes' ? 'chave' : 'id');

/**
 * Abre a app num browser isolado, com um Supabase simulado.
 *
 * opcoes:
 *   dados       objeto { tabela: [linhas] } (fictício; é copiado)
 *   rota        hash inicial (ex.: '#/produtos')
 *   esperar     texto que tem de aparecer antes de começar
 *   modo        'ok' (gravações aceites) | 'falhar' (todas as gravações recusadas, exceto o histórico)
 *   falhas      [{ metodo, tabela, tipo: 'antes' | 'depois', vezes }] — 'antes' recusa sem gravar;
 *               'depois' grava mas a resposta perde-se
 *   sessao      { expiraEm (segundos), morre: 'renovacao' | '401' } — ver matar()
 *   paginas     { 'https://…': html } páginas externas simuladas (ex.: Wallapop)
 *   viewport    tamanho do ecrã (por defeito telemóvel)
 *
 * Devolve { ctx, page, db, escritas, errosJs, fugas, estado, matar, avisos() }.
 */
/** Anúncios (tabela) a partir dos produtos de um teste: períodos antigos e produtos "anunciado". */
function anunciosDoTeste(produtos, contas) {
  const plataforma = (id) => {
    const c = contas.find((x) => x.id === id);
    return c?.plataforma ?? (/\(\s*wallapop\s*\)/i.test(c?.nome ?? '') ? 'wallapop' : /\(\s*ebay\s*\)/i.test(c?.nome ?? '') ? 'ebay' : 'vinted');
  };
  const r = [];
  let n = 0;
  for (const p of produtos) {
    const periodos = p.anuncios ?? [];
    if (p.estado === 'anunciado' && !periodos.some((x) => !x.fim))
      r.push({ id: `an-${++n}`, produto_id: p.id, conta_id: p.conta_id ?? null, plataforma: plataforma(p.conta_id), preco: p.preco_anuncio ?? null, precos: [], inicio: `${p.data_anuncio ?? p.data_compra ?? '2026-01-01'}T12:00:00.000Z`, fim: null, motivo: null, aproximado: true, id_externo: null });
    for (const x of periodos)
      r.push({ id: `an-${++n}`, produto_id: p.id, conta_id: x.conta_id ?? null, plataforma: x.plataforma ?? plataforma(x.conta_id), preco: x.preco ?? null, precos: x.precos ?? [], inicio: x.inicio, fim: x.fim ?? null, motivo: x.motivo ?? null, aproximado: !!x.aproximado, id_externo: null });
  }
  return r;
}

export async function abrirApp(browser, opcoes = {}) {
  const pasta = compilarApp();
  const db = structuredClone(opcoes.dados ?? {});
  for (const t of ['pessoas', 'contas', 'compras', 'produtos', 'vendas', 'acertos', 'definicoes', 'historico']) db[t] ??= [];
  // Anúncios por plataforma (nov/2026): se o teste não os dá, saem dos produtos anunciados, como fez a
  // migração na produção (os testes antigos descrevem os anúncios dentro de cada produto)
  db.anuncios ??= anunciosDoTeste(db.produtos, db.contas);
  const falhas = structuredClone(opcoes.falhas ?? []);
  const sessao = opcoes.sessao ?? {};
  const estado = { renovacaoMorta: false, rest401: false, pedidosDepois: [], aoEscrever: null };
  const matar = () => {
    if (sessao.morre === 'renovacao') estado.renovacaoMorta = true;
    if (sessao.morre === '401') estado.rest401 = true;
  };
  const escritas = [];
  const fugas = [];

  const ctx = await browser.newContext({ viewport: opcoes.viewport ?? { width: 420, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.addInitScript(([s, expira]) => {
    if (location.origin !== 'https://ricardomarquescardoso.github.io') return;
    localStorage.setItem('gv.sessao', JSON.stringify({ ...s, expires_at: Math.floor(Date.now() / 1000) + expira }));
    // Regista todos os avisos que aparecem (desaparecem passados uns segundos)
    window.__avisos = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList?.contains('aviso')) window.__avisos.push(n.textContent);
    }).observe(document, { childList: true, subtree: true });
  }, [SESSAO_FALSA, sessao.expiraEm ?? 86400]);

  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const m = req.method();

    // A app, servida a partir da pasta temporária
    if (u.origin === ORIGEM_APP) {
      let rel = decodeURIComponent(u.pathname.replace(/^\/gestao-vinted\/?/, ''));
      if (!rel || rel.endsWith('/')) rel += 'index.html';
      const f = path.join(pasta, rel);
      if (!f.startsWith(pasta + path.sep) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(f), contentType: TIPOS[path.extname(f)] ?? 'application/octet-stream' });
    }

    // Páginas externas simuladas (ex.: o formulário da Wallapop)
    const simulada = opcoes.paginas?.[u.origin + u.pathname];
    if (simulada !== undefined) return route.fulfill({ body: simulada, contentType: 'text/html; charset=utf-8' });

    // Tudo o que não seja o Supabase simulado: bloqueado (escritas contam como fuga → teste falha)
    if (u.origin !== SB) {
      if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') fugas.push(`${m} ${u.origin}${u.pathname}`);
      return route.abort();
    }

    // ---------- Supabase simulado ----------
    const p = u.pathname;
    if (p === '/auth/v1/token') {
      if (estado.renovacaoMorta) return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Refresh Token Not Found' } });
      return route.fulfill({ json: { access_token: 'falso2', refresh_token: 'falso2', expires_in: Math.min(sessao.expiraEm ?? 3600, 3600), user: { id: 'u1', email: SESSAO_FALSA.email } } });
    }
    if (p.startsWith('/auth/')) return route.fulfill({ status: 204, body: '' });
    if (estado.renovacaoMorta || estado.rest401) estado.pedidosDepois.push(`${m} ${p}`);
    if (estado.rest401 && p.startsWith('/rest/')) return route.fulfill({ status: 401, json: { message: 'JWT expired' } });
    if (p === '/rest/v1/rpc/e_membro') return route.fulfill({ json: true });

    if (p.startsWith('/storage/')) {
      if (m === 'GET' && p.includes('/object/')) return route.fulfill({ body: PNG, contentType: 'image/png' });
      if (p.includes('/object/sign/')) return route.fulfill({ json: { signedURL: '/object/sign/x?token=falso' } });
      if (m !== 'GET') escritas.push(`${m} ${p}`);
      if (opcoes.modo === 'falhar' && m !== 'GET') return route.fulfill({ status: 500, json: { message: 'Falha simulada' } });
      return route.fulfill({ status: 200, json: {} });
    }
    if (p.startsWith('/functions/')) return route.fulfill({ status: 404, json: { erro: 'simulado' } });

    const tabela = p.split('/')[3];
    if (m === 'GET') {
      const filtroChave = u.searchParams.get('chave');
      if (tabela === 'definicoes' && filtroChave) return route.fulfill({ json: db.definicoes.filter((d) => filtroChave.includes(d.chave)) });
      return route.fulfill({ json: db[tabela] ?? [] });
    }

    escritas.push(`${m} ${p}`);
    estado.aoEscrever?.(m, tabela);
    if (opcoes.modo === 'falhar' && tabela !== 'historico') return route.fulfill({ status: 500, json: { message: 'Falha simulada' } });
    const regra = falhas.find((f) => f.vezes > 0 && f.metodo === m && f.tabela === tabela);
    if (regra?.tipo === 'antes') {
      regra.vezes--;
      return route.fulfill({ status: 500, json: { message: 'Falha simulada' } });
    }
    // Aplicar a escrita à base de dados simulada
    if (m === 'POST') {
      const linhas = JSON.parse(req.postData() || '[]');
      for (const l of Array.isArray(linhas) ? linhas : [linhas]) {
        const k = chaveDe(tabela);
        const i = (db[tabela] ??= []).findIndex((x) => x[k] === l[k]);
        if (i >= 0) db[tabela][i] = { ...db[tabela][i], ...l };
        else db[tabela].push(l);
      }
    } else if (m === 'DELETE') {
      const id = (u.searchParams.get('id') || u.searchParams.get('chave') || '').replace(/^eq\./, '');
      db[tabela] = (db[tabela] ?? []).filter((x) => x.id !== id && x.chave !== id);
    } else if (m === 'PATCH') {
      const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      const mud = JSON.parse(req.postData() || '{}');
      db[tabela] = (db[tabela] ?? []).map((x) => (x.id === id ? { ...x, ...mud } : x));
    }
    if (regra?.tipo === 'depois') {
      regra.vezes--;
      return route.fulfill({ status: 500, json: { message: 'Resposta perdida (simulada)' } });
    }
    return route.fulfill({ status: m === 'POST' ? 201 : 200, json: [] });
  });

  const page = await ctx.newPage();
  const errosJs = [];
  page.on('pageerror', (e) => errosJs.push(e.message));
  await page.goto(URL_APP + (opcoes.rota ?? '#/'));
  if (opcoes.esperar) await page.getByText(opcoes.esperar).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(opcoes.esperaInicial ?? 1200);
  const avisos = () => page.evaluate(() => window.__avisos ?? []);
  return { ctx, page, db, escritas, errosJs, fugas, estado, matar, avisos };
}

/** Falha se algum pedido de escrita tentou sair da simulação. */
export function verificarSemFugas(assert, app) {
  assert.deepEqual(app.fugas, [], 'pedidos de escrita para fora da simulação');
}

// ---------------------------------------------------------------------------
// Ações frequentes na app
// ---------------------------------------------------------------------------
export const clicar = (page, texto) => page.locator('button').filter({ hasText: texto }).last().click({ force: true });

export async function irPara(page, rota) {
  await page.goto(URL_APP + rota);
  await page.waitForTimeout(1000);
}

export async function abrirProduto(page, nome) {
  await irPara(page, '#/produtos');
  await page.getByText(nome).first().click();
  await page.waitForTimeout(700);
}
