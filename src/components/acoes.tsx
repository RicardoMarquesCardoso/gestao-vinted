// Abrir janelas (formulários, detalhe de produto, …) a partir de qualquer ecrã.
//
// Em vez de cada ecrã ter as suas janelas, há uma "pilha" central: useAbrir() devolve uma
// função abrir({ tipo: 'venda', … }) que põe uma janela no topo da pilha. Só a do topo aparece;
// ao fechar, volta a que estava por baixo (ex.: detalhe do produto → "Vendi" → fecha → detalhe).
//
// BOTÃO "VOLTAR" DO TELEMÓVEL: cada janela aberta acrescenta uma entrada ao histórico do browser
// (history.pushState). Assim, o gesto de voltar fecha a janela em vez de sair da app.

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { FormCompra } from './FormCompra';
import { FormConta } from './FormConta';
import { FormProduto } from './FormProduto';
import { FormVenda } from './FormVenda';
import { DetalheProduto } from './DetalheProduto';
import { FormAnunciar } from './FormAnunciar';
import { FormVendi } from './FormVendi';
import { FormPlano } from './planos';

export type Acao =
  | { tipo: 'produto'; id?: string }
  | { tipo: 'detalhe'; id: string }
  | { tipo: 'compra'; id?: string }
  | { tipo: 'venda'; id?: string; produtoId?: string }
  | { tipo: 'conta'; id?: string }
  | { tipo: 'anunciar'; ids: string[]; retirar?: boolean; preco?: number | null }
  | { tipo: 'plano'; ids: string[] }
  | { tipo: 'vendi'; ids: string[] };

const Contexto = createContext<(a: Acao) => void>(() => undefined);
export const useAbrir = () => useContext(Contexto);

/** Gere as janelas de criar/editar, que podem ser abertas a partir de qualquer ecrã. */
export function AcoesProvider({ children }: { children: ReactNode }) {
  const [pilha, setPilha] = useState<Acao[]>([]);
  // Cada janela aberta fica no histórico do browser, para o botão/gesto "voltar" a fechar.
  const abrir = (a: Acao) => {
    setPilha((p) => [...p, a]);
    try {
      history.pushState({ gvJanela: true }, '');
    } catch {
      /* ignorar */
    }
  };
  const fechar = () => {
    if ((history.state as { gvJanela?: boolean } | null)?.gvJanela) history.back(); // o popstate fecha a janela
    else setPilha((p) => p.slice(0, -1));
  };
  useEffect(() => {
    const aoVoltar = () => setPilha((p) => p.slice(0, -1));
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);
  const atual = pilha[pilha.length - 1];
  return (
    <Contexto.Provider value={abrir}>
      {children}
      {atual?.tipo === 'produto' && <FormProduto key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'detalhe' && <DetalheProduto key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'compra' && <FormCompra key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'venda' && <FormVenda key={pilha.length} id={atual.id} produtoId={atual.produtoId} aoFechar={fechar} />}
      {atual?.tipo === 'conta' && <FormConta key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'vendi' && <FormVendi key={pilha.length} ids={atual.ids} aoFechar={fechar} abrirCompleto={(produtoId) => setPilha((p) => [...p.slice(0, -1), { tipo: 'venda', produtoId }])} />}
      {atual?.tipo === 'anunciar' && <FormAnunciar key={pilha.length} ids={atual.ids} retirar={atual.retirar} precoSugerido={atual.preco} aoFechar={fechar} />}
      {atual?.tipo === 'plano' && <FormPlano key={pilha.length} ids={atual.ids} aoFechar={fechar} />}
    </Contexto.Provider>
  );
}

/** Número para mostrar num campo de texto (com vírgula decimal). */
export const paraCampo = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? '' : String(n).replace('.', ','));
export const vazioANull = (s: string) => (s.trim() ? s.trim() : null);
