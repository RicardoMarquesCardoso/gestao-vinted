// Camada de dados: o mesmo interface serve para o Supabase (dados reais,
// sincronizados) e para o modo de demonstração (dados guardados só neste browser).

import * as sb from './supabase';
import type { Dados, Historico, Tabela } from './types';

export type TabelaDados = Exclude<Tabela, 'historico'>;

export interface Store {
  modo: 'supabase' | 'demo';
  utilizador: string;
  carregar(): Promise<Dados>;
  guardar(tabela: TabelaDados, linhas: object[]): Promise<void>;
  apagar(tabela: TabelaDados, id: string): Promise<void>;
  historico(): Promise<Historico[]>;
  registar(h: Historico[]): Promise<void>;
  enviarFoto(produtoId: string, ficheiro: Blob): Promise<string>;
  urlFoto(ref: string): Promise<string>;
  apagarFoto(ref: string): Promise<void>;
}

export const chaveDe = (tabela: TabelaDados) => (tabela === 'definicoes' ? 'chave' : 'id');

export const dadosVazios = (): Dados => ({
  pessoas: [],
  contas: [],
  compras: [],
  produtos: [],
  vendas: [],
  definicoes: [],
});

// ---------- Supabase ----------

export function storeSupabase(email: string): Store {
  return {
    modo: 'supabase',
    utilizador: email,
    async carregar() {
      const autorizado = await sb.rpc<boolean>('e_membro');
      if (!autorizado)
        throw new Error(`O email ${email} não está autorizado. Acrescenta-o à tabela "membros" no Supabase (ver supabase/schema.sql).`);
      const [pessoas, contas, compras, produtos, vendas, definicoes] = await Promise.all([
        sb.listar<Dados['pessoas'][number]>('pessoas', 'nome'),
        sb.listar<Dados['contas'][number]>('contas', 'nome'),
        sb.listar<Dados['compras'][number]>('compras', 'data.desc'),
        sb.listar<Dados['produtos'][number]>('produtos', 'criado_em.desc'),
        sb.listar<Dados['vendas'][number]>('vendas', 'data_venda.desc'),
        sb.listar<Dados['definicoes'][number]>('definicoes', 'chave'),
      ]);
      return { pessoas, contas, compras: numeros(compras), produtos: numeros(produtos), vendas: numeros(vendas), definicoes };
    },
    async guardar(tabela, linhas) {
      // O Supabase exige que todas as linhas de um pedido tenham as mesmas colunas:
      // agrupamos por conjunto de colunas e deixamos a data de criação para a base de dados.
      const grupos = new Map<string, object[]>();
      for (const l of linhas) {
        const { criado_em: _c, ...resto } = l as Record<string, unknown>;
        const k = Object.keys(resto).sort().join(',');
        grupos.set(k, [...(grupos.get(k) ?? []), resto]);
      }
      for (const g of grupos.values()) await sb.upsert(tabela, g);
    },
    async apagar(tabela, id) {
      await sb.apagar(tabela, chaveDe(tabela), id);
    },
    async historico() {
      const h = await sb.listar<Historico>('historico', 'quando.desc');
      return h;
    },
    async registar(h) {
      if (h.length) await sb.inserir('historico', h);
    },
    async enviarFoto(produtoId, ficheiro) {
      const caminho = `${produtoId}/${crypto.randomUUID()}.jpg`;
      await sb.enviarFoto(caminho, ficheiro);
      return caminho;
    },
    urlFoto: (ref) => (ref.startsWith('data:') ? Promise.resolve(ref) : sb.urlFoto(ref)),
    apagarFoto: (ref) => (ref.startsWith('data:') ? Promise.resolve() : sb.apagarFoto(ref)),
  };
}

/** O PostgREST devolve colunas numeric como texto; convertemos para número. */
function numeros<T extends object>(linhas: T[]): T[] {
  const campos = [
    'valor_artigos', 'portes', 'outros_custos', 'preco_compra', 'custos_adicionais',
    'preco_anuncio', 'preco_venda', 'comissao', 'quantidade',
  ];
  for (const l of linhas as Record<string, unknown>[]) {
    for (const c of campos) {
      if (typeof l[c] === 'string') l[c] = Number(l[c]);
    }
  }
  return linhas;
}

// ---------- Demonstração (localStorage) ----------

const CHAVE_DEMO = 'gv.demo';

interface Guardado {
  dados: Dados;
  historico: Historico[];
}

function lerDemo(): Guardado {
  try {
    const s = localStorage.getItem(CHAVE_DEMO);
    if (s) return JSON.parse(s) as Guardado;
  } catch {
    /* ignorar */
  }
  return { dados: dadosVazios(), historico: [] };
}

function gravarDemo(g: Guardado) {
  try {
    localStorage.setItem(CHAVE_DEMO, JSON.stringify(g));
  } catch {
    /* sem espaço ou armazenamento bloqueado: os dados ficam só em memória */
  }
}

export function demoTemDados() {
  const g = lerDemo();
  return g.dados.produtos.length > 0 || g.dados.compras.length > 0;
}

export function storeDemo(): Store {
  let g = lerDemo();
  return {
    modo: 'demo',
    utilizador: 'demonstração',
    async carregar() {
      g = lerDemo();
      return structuredClone(g.dados);
    },
    async guardar(tabela, linhas) {
      const chave = chaveDe(tabela);
      const lista = g.dados[tabela] as unknown as Record<string, unknown>[];
      for (const l of linhas as Record<string, unknown>[]) {
        const i = lista.findIndex((x) => x[chave] === l[chave]);
        if (i >= 0) lista[i] = { ...lista[i], ...l };
        else lista.push({ criado_em: new Date().toISOString(), ...l });
      }
      gravarDemo(g);
    },
    async apagar(tabela, id) {
      const chave = chaveDe(tabela);
      (g.dados[tabela] as unknown as Record<string, unknown>[]) = (
        g.dados[tabela] as unknown as Record<string, unknown>[]
      ).filter((x) => x[chave] !== id);
      gravarDemo(g);
    },
    async historico() {
      return [...g.historico].sort((a, b) => b.quando.localeCompare(a.quando));
    },
    async registar(h) {
      g.historico.push(...h);
      if (g.historico.length > 2000) g.historico = g.historico.slice(-2000);
      gravarDemo(g);
    },
    async enviarFoto(_produtoId, ficheiro) {
      return await new Promise<string>((ok, falha) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => falha(r.error);
        r.readAsDataURL(ficheiro);
      });
    },
    urlFoto: async (ref) => ref,
    apagarFoto: async () => undefined,
  };
}

export function limparDemo() {
  try {
    localStorage.removeItem(CHAVE_DEMO);
  } catch {
    /* ignorar */
  }
}
