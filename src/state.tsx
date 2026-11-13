// Estado global da app: os dados carregados e as funções para os alterar.
//
// CONCEITO: em React, cada componente pode ter o seu "estado" (useState). Mas os dados
// (produtos, vendas, contas…) são precisos em quase todos os ecrãs. Em vez de os passar
// de componente em componente, usamos um "Contexto": o <DadosProvider> guarda os dados
// uma vez, e qualquer componente lá dentro chama useDados() para os ler.
//
// FLUXO DE UMA ALTERAÇÃO (ex.: registar uma venda):
//   1. O formulário chama guardar('vendas', [venda]).
//   2. guardar() compara com o que já existia e prepara o registo do histórico.
//   3. Envia para a base de dados (store.guardar) e grava o histórico (store.registar).
//   4. Atualiza logo a memória (setDados), para o ecrã mudar sem esperar por novo carregamento.
//
// SE A GRAVAÇÃO FALHAR: guardar()/apagar() lançam um ErroGravacao. Os formulários que tratam o
// erro mostram a sua mensagem ("Erro ao guardar: …"). Nos botões que não o tratam, o erro fica
// "por apanhar" e o DadosProvider mostra o aviso "Não foi guardado: …" (uma só mensagem, nunca
// duas). Só as gravações usam este aviso: leituras e fotografias que falham não o mostram.
//
// SINCRONIZAÇÃO ENTRE OS DOIS: os dados voltam a ser carregados ao regressar à app
// e de minuto a minuto, para verem o que a outra pessoa registou. Para isso ser seguro
// (lib/sincronizar.ts):
//   - um carregamento que esteve a decorrer enquanto se gravava é ignorado (trazia os dados de
//     antes da gravação e a alteração "desaparecia" até ao minuto seguinte);
//   - de dois carregamentos ao mesmo tempo, só conta o último a começar;
//   - o que não mudou continua a ser o mesmo objeto, para os cálculos pesados não se repetirem;
//   - as definições (planos, tarefas adiadas, listas…) juntam-se com o que está no servidor antes
//     de gravar, para uma alteração do Ricardo não apagar uma da Cass feita no mesmo minuto.

import { atualizarPeriodos } from './lib/anuncios';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { chaveDe, dadosVazios } from './lib/store';
import type { Store, TabelaDados } from './lib/store';
import { SessaoExpirada } from './lib/supabase';
import { fundir, juntarDados } from './lib/sincronizar';
import type { Dados, Historico, Produto, TipoPagamento } from './lib/types';
import { LISTAS_PADRAO } from './lib/types';

/** Tudo o que useDados() disponibiliza aos componentes. */
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

/** Erro de uma gravação (guardar/apagar) que falhou. Tem a mesma mensagem do erro original. */
export class ErroGravacao extends Error {
  constructor(original: unknown) {
    super(original instanceof Error ? original.message : String(original));
    this.name = 'ErroGravacao';
  }
}

/** Acesso aos dados e às funções de guardar/apagar, em qualquer componente. */
export function useDados(): Estado {
  const c = useContext(Contexto);
  if (!c) throw new Error('useDados fora do DadosProvider');
  return c;
}

/** Mensagem curta que aparece em baixo ("Venda registada.") e desaparece sozinha. */
interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro';
}

export function DadosProvider(props: { store: Store; aoExpirar(duranteGravacao?: boolean): void; children: ReactNode }) {
  const { store, aoExpirar } = props;
  const [dados, setDados] = useState<Dados>(dadosVazios);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltima] = useState<Date | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  // Referência sempre atualizada aos dados, para as funções abaixo lerem o valor mais recente
  // sem terem de ser recriadas a cada alteração.
  const dadosRef = useRef(dados);
  dadosRef.current = dados;
  // Contador de gravações (sobe ao começar e ao acabar cada uma) e n.º do último carregamento
  const gravacoes = useRef(0);
  const ultimoPedido = useRef(0);

  const aviso = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3000);
  }, []);

  // Erro ao gravar (só é usado por guardar e apagar). Se a sessão expirou (a palavra-passe tem de
  // ser pedida outra vez), volta ao ecrã de entrar com o aviso de que foi a meio de uma gravação, e
  // a gravação FALHA (relança o erro): assim nenhum formulário continua para os passos seguintes nem
  // mostra sucesso. Outro erro é relançado como ErroGravacao, com a mesma mensagem, para se saber que
  // foi uma gravação que falhou (ver o aviso central abaixo).
  const tratarErro = useCallback(
    (e: unknown): never => {
      if (e instanceof SessaoExpirada) {
        aoExpirar(true);
        throw e; // a única mensagem é a do ecrã de entrar (o aviso central ignora este erro)
      }
      throw new ErroGravacao(e);
    },
    [aoExpirar],
  );

  // Aviso central: uma gravação que falhou e que o ecrã não tratou (botões sem mensagem de erro
  // própria, ex.: "Baixei", "Adiar", Definições) mostra "Não foi guardado: …". Os formulários que
  // apanham o erro já mostram a sua mensagem e não chegam aqui, por isso nunca há duas mensagens.
  useEffect(() => {
    const porApanhar = (ev: PromiseRejectionEvent) => {
      if (!(ev.reason instanceof ErroGravacao)) return; // só gravações de dados
      ev.preventDefault();
      aviso(`Não foi guardado: ${ev.reason.message}`, 'erro');
    };
    window.addEventListener('unhandledrejection', porApanhar);
    return () => window.removeEventListener('unhandledrejection', porApanhar);
  }, [aviso]);

  // Ir buscar todos os dados à base de dados (ou ao modo demonstração).
  const recarregar = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    const gravacoesAntes = gravacoes.current;
    try {
      const d = await store.carregar();
      // Houve gravações durante o carregamento, ou começou outro mais recente: estes dados já
      // estão desatualizados (o próximo carregamento traz tudo)
      if (pedido !== ultimoPedido.current || gravacoes.current !== gravacoesAntes) return;
      setDados((atual) => juntarDados(atual, d));
      setErro(null);
      setUltima(new Date());
    } catch (e) {
      if (e instanceof SessaoExpirada) return aoExpirar();
      if (pedido === ultimoPedido.current) setErro(e instanceof Error ? e.message : String(e));
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

  // Gravar de facto (guardar, abaixo, só conta as gravações à volta disto)
  const guardarAgora = useCallback(
    async (tabela: TabelaDados, linhas: object[]) => {
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
      // Histórico: para cada linha, guardar só os campos que mudaram (antes → depois)
      for (const l of linhas as Record<string, unknown>[]) {
        const antes = atuais.find((x) => x[chave] === l[chave]);
        if (antes && iguais(antes, l)) continue; // nada mudou
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
        // Definições: juntar com o que está agora no servidor (ver lib/sincronizar.ts, fundir)
        if (tabela === 'definicoes') {
          const servidor = await store.lerDefinicoes(linhas.map((l) => String((l as Record<string, unknown>).chave)));
          linhas = (linhas as { chave: string; valor: unknown }[]).map((l) => {
            const antes = (atuais as unknown as { chave: string; valor: unknown }[]).find((x) => x.chave === l.chave)?.valor;
            return { ...l, valor: fundir(antes, l.valor, servidor[l.chave]) };
          });
        }
        await store.guardar(tabela, linhas);
        await store.registar(historico).catch(() => undefined);
      } catch (e) {
        tratarErro(e); // lança sempre (ver tratarErro)
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

  const guardar = useCallback(
    async (tabela: TabelaDados, linhas: object[]) => {
      if (!linhas.length) return;
      gravacoes.current++;
      try {
        await guardarAgora(tabela, linhas);
      } finally {
        gravacoes.current++;
      }
    },
    [guardarAgora],
  );

  // Apagar um registo. O histórico guarda o registo completo, para se poder recuperar.
  const apagar = useCallback(
    async (tabela: TabelaDados, id: string) => {
      const chave = chaveDe(tabela);
      const antes = (dadosRef.current[tabela] as unknown as Record<string, unknown>[]).find((x) => x[chave] === id);
      gravacoes.current++;
      try {
        await store.apagar(tabela, id);
        await store
          .registar([
            { id: crypto.randomUUID(), quando: new Date().toISOString(), utilizador: store.utilizador, tabela, registo_id: id, acao: 'apagar', antes: antes ?? null, depois: null },
          ])
          .catch(() => undefined);
      } catch (e) {
        tratarErro(e); // lança sempre (ver tratarErro)
      } finally {
        gravacoes.current++;
      }
      setDados((d) => ({
        ...d,
        [tabela]: (d[tabela] as unknown as Record<string, unknown>[]).filter((x) => x[chave] !== id),
      }));
    },
    [store, tratarErro],
  );

  // O que fica disponível em useDados(). useMemo evita recriar o objeto sem necessidade.
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
      sessaoExpirada: () => aoExpirar(),
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

/** true se todos os campos de b já têm o mesmo valor em a. */
function iguais(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.keys(b).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

/** Só os campos que mudaram, com o valor de antes ou de depois. */
function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>, lado: 'antes' | 'depois') {
  const r: Record<string, unknown> = {};
  for (const k of Object.keys(depois)) {
    if (JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) r[k] = lado === 'antes' ? antes[k] ?? null : depois[k];
  }
  return r;
}
