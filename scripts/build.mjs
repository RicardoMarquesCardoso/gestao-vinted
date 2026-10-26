// Gera a app em docs/ (a pasta que o GitHub Pages publica).
//   npm run build  -> gera docs/
//   npm run dev    -> gera e serve em http://localhost:5173, atualizando ao gravar
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destino = resolve(raiz, 'docs');
const dev = process.argv.includes('--dev');

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  // Alternativa para ambientes com o esbuild instalado globalmente
  esbuild = await import(resolve(process.env.ESBUILD_PATH ?? '', 'lib/main.js'));
}

rmSync(destino, { recursive: true, force: true });
mkdirSync(resolve(destino, 'assets'), { recursive: true });
cpSync(resolve(raiz, 'public'), destino, { recursive: true });

const versao = Date.now().toString(36);
const html = readFileSync(resolve(raiz, 'index.html'), 'utf8').replaceAll('%VERSAO%', versao);
writeFileSync(resolve(destino, 'index.html'), html);
writeFileSync(resolve(destino, '.nojekyll'), '');

const opcoes = {
  entryPoints: { app: resolve(raiz, 'src/main.tsx') },
  bundle: true,
  outdir: resolve(destino, 'assets'),
  format: 'esm',
  target: ['es2022', 'safari15'],
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  nodePaths: [resolve(raiz, 'node_modules'), ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)],
  logLevel: 'info',
};

if (dev) {
  const ctx = await esbuild.context(opcoes);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: destino, port: 5173 });
  console.log(`\n  App em http://localhost:${port}\n`);
} else {
  await esbuild.build(opcoes);
}
