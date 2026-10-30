// Camada de dados: o mesmo interface serve para o Supabase (dados reais,
// sincronizados) e para o modo de demonstração (dados guardados só neste browser).
//
// CONCEITO: "Store" é um contrato (interface) com as operações básicas — carregar tudo,
// guardar linhas, apagar, histórico e fotografias. Há duas implementações:
//   - storeSupabase: fala com a base de dados na nuvem (ver supabase.ts).
//   - storeDemo: guarda tudo no localStorage do browser (só neste dispositivo).
// O resto da app (state.tsx e os ecrãs) só conhece o contrato, por isso funciona igual nos dois.
//
// A app carrega TODOS os dados de uma vez (são poucos milhares de linhas no máximo) e faz as
// contas no próprio browser (lib/calc.ts). É simples e rápido para este volume.

import * as sb from './supabase';
import { FOTO_MINIATURA, eMiniatura, miniaturaDe, originalDe, reduzirFoto } from './fotos';
import type { Dados, Historico, Tabela } from './types';

/** Tabelas com dados normais (o histórico é especial: só se acrescenta, nunca se altera). */
export type TabelaDados = Exclude<Tabela, 'historico'>;

export interface Store {
  modo: 'supabase' | 'demo';
  utilizador: string;
  carregar(): Promise<Dados>;
  guardar(tabela: TabelaDados, linhas: object[]): Promise<void>;
  apagar(tabela: TabelaDados, id: string): Promise<void>;
  historico(): Promise<Historico[]>;
  registar(h: Historico[]): Promise<void>;
  /** Envia a original e a miniatura; devolve o caminho a guardar no produto (o da original). */
  enviarFoto(produtoId: string, original: Blob, miniatura?: Blob): Promise<string>;
  /** Endereço local para mostrar a fotografia: a miniatura (listas) ou a original (partilhar). */
  urlFoto(ref: string, tamanho?: 'min' | 'original'): Promise<string>;
  /** Grava uma fotografia num caminho exato (usado para criar miniaturas que faltam). */
  enviarFotoCaminho(caminho: string, ficheiro: Blob): Promise<void>;
  /** Apaga a fotografia (as duas versões) ou uma lista de caminhos exatos. */
  apagarFoto(ref: string | string[]): Promise<void>;
}

/** Nome da coluna que identifica cada linha (as definições usam a "chave" em vez de um id). */
export const chaveDe = (tabela: TabelaDados) => (tabela === 'definicoes' ? 'chave' : 'id');

export const dadosVazios = (): Dados => ({
  pessoas: [],
  contas: [],
  compras: [],
  produtos: [],
  vendas: [],
  acertos: [],
  definicoes: [],
});

// ---------- Supabase ----------

export function storeSupabase(email: string): Store {
  return {
    modo: 'supabase',
    utilizador: email,
    async carregar() {
      // Primeiro confirma que este email está na lista de membros (senão as regras RLS escondiam tudo
      // e a app parecia vazia sem explicação). Depois carrega as 7 tabelas em paralelo.
      const autorizado = await sb.rpc<boolean>('e_membro');
      if (!autorizado)
        throw new Error(`O email ${email} não está autorizado. Acrescenta-o à tabela "membros" no Supabase (ver supabase/schema.sql).`);
      const [pessoas, contas, compras, produtos, vendas, acertos, definicoes] = await Promise.all([
        sb.listar<Dados['pessoas'][number]>('pessoas', 'nome'),
        sb.listar<Dados['contas'][number]>('contas', 'nome'),
        sb.listar<Dados['compras'][number]>('compras', 'data.desc'),
        sb.listar<Dados['produtos'][number]>('produtos', 'criado_em.desc'),
        sb.listar<Dados['vendas'][number]>('vendas', 'data_venda.desc'),
        sb.listar<Dados['acertos'][number]>('acertos', 'data.desc'),
        sb.listar<Dados['definicoes'][number]>('definicoes', 'chave'),
      ]);
      return { pessoas, contas, compras: numeros(compras), produtos: numeros(produtos), vendas: numeros(vendas), acertos: numeros(acertos), definicoes };
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
    // As fotografias vão para o Storage do Supabase (bucket "fotos"); no produto fica só o caminho
    // da original. A miniatura fica ao lado, com ".min.jpg" (ver lib/fotos.ts).
    async enviarFoto(produtoId, original, miniatura) {
      const caminho = `${produtoId}/${crypto.randomUUID()}.jpg`;
      await sb.enviarFoto(caminho, original);
      if (miniatura) await sb.enviarFoto(miniaturaDe(caminho), miniatura).catch(() => undefined);
      return caminho;
    },
    enviarFotoCaminho: (caminho, ficheiro) => sb.enviarFoto(caminho, ficheiro),
    // Miniatura: se não existir (fotografias antigas, de antes das miniaturas), usa-se a original
    urlFoto: (ref, tamanho = 'original') => {
      if (ref.startsWith('data:')) return Promise.resolve(ref);
      if (tamanho === 'min' && !eMiniatura(ref))
        return sb.urlFoto(miniaturaDe(ref)).catch(async () => {
          // Fotografia antiga, sem miniatura: mostra-se a original e cria-se a miniatura para a próxima vez
          const url = await sb.urlFoto(ref);
          void fetch(url)
            .then((r) => r.blob())
            .then((b) => reduzirFoto(b, FOTO_MINIATURA.max, FOTO_MINIATURA.qualidade))
            .then((min) => sb.enviarFoto(miniaturaDe(ref), min))
            .catch(() => undefined);
          return url;
        });
      return sb.urlFoto(tamanho === 'original' ? originalDe(ref) : ref).catch((e) => (eMiniatura(ref) ? sb.urlFoto(ref) : Promise.reject(e)));
    },
    apagarFoto: (ref) => {
      if (Array.isArray(ref)) return ref.length ? sb.apagarFoto(ref) : Promise.resolve();
      return ref.startsWith('data:') ? Promise.resolve() : sb.apagarFoto([originalDe(ref), miniaturaDe(ref)]);
    },
  };
}

/** O PostgREST devolve colunas numeric como texto; convertemos para número. */
function numeros<T extends object>(linhas: T[]): T[] {
  const campos = [
    'valor_artigos', 'portes', 'outros_custos', 'preco_compra', 'custos_adicionais',
    'preco_anuncio', 'preco_venda', 'comissao', 'quantidade', 'valor',
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

/** Modo demonstração: igual ao Supabase, mas tudo fica no localStorage deste browser. */
export function storeDemo(): Store {
  let g = lerDemo();
  return {
    modo: 'demo',
    utilizador: 'demonstração',
    async carregar() {
      g = lerDemo();
      g.dados = { ...dadosVazios(), ...g.dados };
      return structuredClone(g.dados);
    },
    async guardar(tabela, linhas) {
      const chave = chaveDe(tabela);
      g.dados[tabela] ??= [] as never;
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
    // Sem servidor, a fotografia fica guardada dentro do próprio texto ("data URL")
    async enviarFoto(_produtoId, ficheiro) { // em demonstração guarda-se só uma versão (pequena)
      return await new Promise<string>((ok, falha) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => falha(r.error);
        r.readAsDataURL(ficheiro);
      });
    },
    urlFoto: async (ref) => ref,
    enviarFotoCaminho: async () => undefined,
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
