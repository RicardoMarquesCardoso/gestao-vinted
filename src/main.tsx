// Ponto de entrada da app.
//
// O browser carrega docs/index.html, que tem um <div id="root"> vazio e o ficheiro
// assets/app.js (gerado a partir deste ficheiro pelo esbuild, ver scripts/build.mjs).
// Aqui dizemos ao React para desenhar o componente <App /> dentro desse <div>.
// A partir daí, tudo o que se vê no ecrã é React.
//
// <StrictMode> só tem efeito durante o desenvolvimento: avisa de práticas arriscadas.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
