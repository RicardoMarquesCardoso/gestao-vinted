import { atualizarPeriodos } from './lib/anuncios';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { chaveDe, dadosVazios } from './lib/store';
import type { Store, TabelaDados } from './lib/store';
import { SessaoExpirada } from './lib/supabase';
import type { Dados, Historico, Produto, TipoPagamento } from './lib/types';
import { LISTAS_PADRAO } from './lib/types';

interface Estado {
  store: Store;
  dados: Dados;
  carregando: boolean;
  erro: string | null;
  ultimaAtualizacao: Date | null;
  recarregar(): Promise<void>;
  /** Cria ou atualiza registos e guarda o histórico das alterações. */
  guardar(tabela: TabelaDados, linhas: object[]): Promise<void>;
  apagar(tabela: TabelaDados, id: string): Promise<void>;
  lista(chave: string): string[];
  nomePessoa(id: string | null | undefined): string;
  nomeConta(id: string | null | undefined): string;
  /** Nome de uma parte nos acertos: pessoa ou conta conjunta. */
  nomeParte(id: string | null | undefined): string;
  /** Quem pagou uma compra ou produto, em texto. */
  nomePagador(x: { tipo_pagamento: TipoPagamento; pessoa_id: string | null }): string;
  aviso(texto: string, tipo?: 'ok' | 'erro'): void;
  sessaoExpirada(): void;
}

const Contexto = createContext<Estado | null>(null);

export function useDados(): Estado {
  const c = useContext(Contexto);
  if (!c) throw new Error('useDados fora do DadosProvider');
  return c;
}

interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro';
}

export function DadosProvider(props: { store: Store; aoExpirar(): void; children: ReactNode }) {
  const { store, aoExpirar } = props;
  const [dados, setDados] = useState<Dados>(dadosVazios);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltima] = useState<Date | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const dadosRef = useRef(dados);
  dadosRef.current = dados;

  const aviso = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3000);
  }, []);

  const tratarErro = useCallback(
    (e: unknown) => {
      if (e instanceof SessaoExpirada) {
        aoExpirar();
        return;
      }
      throw e;
    },
    [aoExpirar],
  );

  const recarregar = useCallback(async () => {
    try {
      const d = await store.carregar();
      setDados(d);
      setErro(null);
      setUltima(new Date());
    } catch (e) {
      if (e instanceof SessaoExpirada) return aoExpirar();
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [store, aoExpirar]);

  useEffect(() => {
    void recarregar();
    // Sincronização: atualiza ao voltar à app e de minuto a minuto.
    const aoVoltar = () => document.visibilityState === 'visible' && void recarregar();
    document.addEventListener('visibilitychange', aoVoltar);
    const t = setInterval(() => document.visibilityState === 'visible' && void recarregar(), 60000);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      clearInterval(t);
    };
  }, [recarregar]);

  const guardar = useCallback(
    async (tabela: TabelaDados, linhas: object[]) => {
      if (!linhas.length) return;
      const chave = chaveDe(tabela);
      const atuais = dadosRef.current[tabela] as unknown as Record<string, unknown>[];
      const agora = new Date().toISOString();
      const historico: Historico[] = [];
      // Produtos: registar automaticamente os períodos em que estiveram anunciados
      if (tabela === 'produtos') {
        linhas = (linhas as Partial<Produto>[]).map((l) => {
          const antes = (atuais as unknown as Produto[]).find((x) => x.id === l.id);
          const anuncios = atualizarPeriodos(antes, l, agora);
          return anuncios ? { ...l, anuncios } : l;
        });
      }
      for (const l of linhas as Record<string, unknown>[]) {
        const antes = atuais.find((x) => x[chave] === l[chave]);
        if (antes && iguais(antes, l)) continue;
        historico.push({
          id: crypto.randomUUID(),
          quando: agora,
          utilizador: store.utilizador,
          tabela,
          registo_id: String(l[chave]),
          acao: antes ? 'editar' : 'criar',
          antes: antes ? diferencas(antes, l, 'antes') : null,
          depois: antes ? diferencas(antes, l, 'depois') : l,
        });
      }
      try {
        await store.guardar(tabela, linhas);
        await store.registar(historico).catch(() => undefined);
      } catch (e) {
        tratarErro(e);
        return;
      }
      // Atualizar já a memória para a interface responder logo
      setDados((d) => {
        const lista = [...(d[tabela] as unknown as Record<string, unknown>[])];
        for (const l of linhas as Record<string, unknown>[]) {
          const i = lista.findIndex((x) => x[chave] === l[chave]);
          if (i >= 0) lista[i] = { ...lista[i], ...l };
          else lista.unshift({ criado_em: agora, ...l });
        }
        return { ...d, [tabela]: lista };
      });
    },
    [store, tratarErro],
  );

  const apagar = useCallback(
    async (tabela: TabelaDados, id: string) => {
      const chave = chaveDe(tabela);
      const antes = (dadosRef.current[tabela] as unknown as Record<string, unknown>[]).find((x) => x[chave] === id);
      try {
        await store.apagar(tabela, id);
        await store
          .registar([
            { id: crypto.randomUUID(), quando: new Date().toISOString(), utilizador: store.utilizador, tabela, registo_id: id, acao: 'apagar', antes: antes ?? null, depois: null },
          ])
          .catch(() => undefined);
      } catch (e) {
        tratarErro(e);
        return;
      }
      setDados((d) => ({
        ...d,
        [tabela]: (d[tabela] as unknown as Record<string, unknown>[]).filter((x) => x[chave] !== id),
      }));
    },
    [store, tratarErro],
  );

  const valor = useMemo<Estado>(
    () => ({
      store,
      dados,
      carregando,
      erro,
      ultimaAtualizacao,
      recarregar,
      guardar,
      apagar,
      aviso,
      sessaoExpirada: aoExpirar,
      lista: (chave) => dados.definicoes.find((x) => x.chave === chave)?.valor ?? LISTAS_PADRAO[chave]?.valores ?? [],
      nomePessoa: (id) => (id ? dados.pessoas.find((p) => p.id === id)?.nome ?? '—' : '—'),
      nomeConta: (id) => (id ? dados.contas.find((c) => c.id === id)?.nome ?? '—' : '—'),
      nomeParte: (id) => (id === 'conjunta' ? 'Conta conjunta' : id ? dados.pessoas.find((p) => p.id === id)?.nome ?? '—' : '—'),
      nomePagador: (x) =>
        x.tipo_pagamento === 'conjunta'
          ? 'Conta conjunta'
          : x.tipo_pagamento === 'dividido'
            ? 'Dividido'
            : x.pessoa_id
              ? dados.pessoas.find((p) => p.id === x.pessoa_id)?.nome ?? '—'
              : '—',
    }),
    [store, dados, carregando, erro, ultimaAtualizacao, recarregar, guardar, apagar, aviso, aoExpirar],
  );

  return (
    <Contexto.Provider value={valor}>
      {props.children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>
            {a.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

function iguais(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.keys(b).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>, lado: 'antes' | 'depois') {
  const r: Record<string, unknown> = {};
  for (const k of Object.keys(depois)) {
    if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) r[k] = lado === 'antes' ? antes[k] ?? null : depois[k];
  }
  return r;
}
