// Navegação entre ecrãs ("rotas").
//
// Como o site está no GitHub Pages (que só serve ficheiros estáticos), usamos rotas com "#":
// o endereço fica .../gestao-vinted/#/produtos. Tudo o que vem depois do "#" nunca vai ao
// servidor, por isso não é preciso configurar nada para cada ecrã existir.
//
// - rotaAtual(): lê a rota do endereço (ex.: "/produtos").
// - navegar(rota): muda de ecrã (muda o "#" e volta ao topo).
// - useRota(): "hook" React que devolve a rota e faz o componente redesenhar quando ela muda.

import { useEffect, useState } from 'react';

export function rotaAtual() {
  return location.hash.replace(/^#/, '') || '/';
}

export function navegar(rota: string) {
  location.hash = rota;
  window.scrollTo(0, 0);
}

export function useRota() {
  const [rota, setRota] = useState(rotaAtual);
  useEffect(() => {
    const mudou = () => setRota(rotaAtual());
    window.addEventListener('hashchange', mudou);
    return () => window.removeEventListener('hashchange', mudou);
  }, []);
  return rota;
}
