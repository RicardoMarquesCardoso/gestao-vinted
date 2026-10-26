import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { FormCompra } from './FormCompra';
import { FormConta } from './FormConta';
import { FormProduto } from './FormProduto';
import { FormVenda } from './FormVenda';
import { DetalheProduto } from './DetalheProduto';
import { FormAnunciar } from './FormAnunciar';

export type Acao =
  | { tipo: 'produto'; id?: string }
  | { tipo: 'detalhe'; id: string }
  | { tipo: 'compra'; id?: string }
  | { tipo: 'venda'; id?: string; produtoId?: string }
  | { tipo: 'conta'; id?: string }
  | { tipo: 'anunciar'; ids: string[]; retirar?: boolean };

const Contexto = createContext<(a: Acao) => void>(() => undefined);
export const useAbrir = () => useContext(Contexto);

/** Gere as janelas de criar/editar, que podem ser abertas a partir de qualquer ecrã. */
export function AcoesProvider({ children }: { children: ReactNode }) {
  const [pilha, setPilha] = useState<Acao[]>([]);
  const abrir = (a: Acao) => setPilha((p) => [...p, a]);
  const fechar = () => setPilha((p) => p.slice(0, -1));
  const atual = pilha[pilha.length - 1];
  return (
    <Contexto.Provider value={abrir}>
      {children}
      {atual?.tipo === 'produto' && <FormProduto key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'detalhe' && <DetalheProduto key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'compra' && <FormCompra key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'venda' && <FormVenda key={pilha.length} id={atual.id} produtoId={atual.produtoId} aoFechar={fechar} />}
      {atual?.tipo === 'conta' && <FormConta key={pilha.length} id={atual.id} aoFechar={fechar} />}
      {atual?.tipo === 'anunciar' && <FormAnunciar key={pilha.length} ids={atual.ids} retirar={atual.retirar} aoFechar={fechar} />}
    </Contexto.Provider>
  );
}

/** Número para mostrar num campo de texto (com vírgula decimal). */
export const paraCampo = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? '' : String(n).replace('.', ','));
export const vazioANull = (s: string) => (s.trim() ? s.trim() : null);
