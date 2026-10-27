// Gera a app em docs/ (a pasta que o GitHub Pages publica).
//
// O QUE FAZ: o browser não percebe TypeScript nem JSX, e é mais rápido carregar um ficheiro do
// que dezenas. O esbuild junta src/main.tsx e tudo o que ele importa num só ficheiro
// JavaScript (docs/assets/app.js) e o CSS em docs/assets/app.css. Depois copia public/
// (ícones, manifest, catálogos JSON) e o index.html para docs/.
// Cada ficheiro gerado leva um código de versão no endereço, para o telemóvel não usar uma cópia antiga.
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

// Começar do zero: apagar docs/ e copiar os ficheiros estáticos de public/
rmSync(destino, { recursive: true, force: true });
mkdirSync(resolve(destino, 'assets'), { recursive: true });
cpSync(resolve(raiz, 'public'), destino, { recursive: true });

// Código de versão (muda a cada compilação) posto nos endereços do CSS e JS do index.html
const versao = Date.now().toString(36);
const html = readFileSync(resolve(raiz, 'index.html'), 'utf8').replaceAll('%VERSAO%', versao);
writeFileSync(resolve(destino, 'index.html'), html);
// .nojekyll diz ao GitHub Pages para servir os ficheiros tal como estão
writeFileSync(resolve(destino, '.nojekyll'), '');

// Opções do esbuild: juntar tudo (bundle), JSX do React, minificar em produção,
// e compatível com Safari 15 (iPhones mais antigos)
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

// Modo dev: recompila ao gravar e serve em localhost:5173. Senão, compila uma vez.
if (dev) {
  const ctx = await esbuild.context(opcoes);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: destino, port: 5173 });
  console.log(`\n  App em http://localhost:${port}\n`);
} else {
  await esbuild.build(opcoes);
}
