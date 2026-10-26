import { useEffect, useState } from 'react';

// Rotas com "#" (ex.: #/vendas), que funcionam no GitHub Pages sem configuração.

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
