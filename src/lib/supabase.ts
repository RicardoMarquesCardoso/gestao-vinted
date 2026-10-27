// Cliente mínimo para o Supabase (autenticação, base de dados e fotografias),
// feito só com fetch, sem dependências externas.
//
// O QUE É O SUPABASE: uma base de dados PostgreSQL na nuvem que já traz:
//   - Auth: contas de utilizador (email + palavra-passe) e "tokens" de sessão.
//   - PostgREST: cada tabela fica acessível por HTTP (GET para ler, POST para criar, …).
//   - Storage: guardar ficheiros (as fotografias dos produtos).
//
// SEGURANÇA: cada pedido leva o token da sessão ("Authorization: Bearer …"). A base de dados
// tem regras RLS (Row Level Security, em supabase/schema.sql) que só deixam ler/escrever a quem
// tem sessão iniciada E está na tabela "membros". Sem isso, a chave pública não serve para nada.
//
// SESSÃO: ao entrar recebemos um access_token (válido ~1 hora) e um refresh_token (para pedir
// um novo sem voltar a pedir a palavra-passe). Ficam no localStorage para não ter de entrar sempre.

import { SUPABASE_KEY, SUPABASE_URL } from '../config';

export interface Sessao {
  access_token: string;
  refresh_token: string;
  expires_at: number; // segundos desde 1970
  email: string;
  user_id: string;
}

/** Onde a sessão fica guardada no browser. */
const CHAVE_SESSAO = 'gv.sessao';
let sessaoAtual: Sessao | null = lerSessaoGuardada();
// Se vários pedidos precisarem de renovar a sessão ao mesmo tempo, renovam uma só vez
let refrescamento: Promise<Sessao | null> | null = null;

function lerSessaoGuardada(): Sessao | null {
  try {
    const s = localStorage.getItem(CHAVE_SESSAO);
    return s ? (JSON.parse(s) as Sessao) : null;
  } catch {
    return null;
  }
}

function guardarSessao(s: Sessao | null) {
  sessaoAtual = s;
  try {
    if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* sem armazenamento disponível: a sessão fica só em memória */
  }
}

export function sessaoGuardada() {
  return sessaoAtual;
}

interface RespostaToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
}

/** Converte a resposta do Supabase Auth na nossa Sessao (com a hora de expiração absoluta). */
function paraSessao(r: RespostaToken): Sessao {
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + r.expires_in,
    email: r.user.email,
    user_id: r.user.id,
  };
}

/** Transforma uma resposta de erro numa mensagem legível (em português). */
async function erroDe(res: Response): Promise<Error> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = await res.json();
    msg = j.msg || j.message || j.error_description || j.error || msg;
  } catch {
    /* resposta sem JSON */
  }
  return new Error(traduzirErro(String(msg)));
}

function traduzirErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email ou palavra-passe incorretos.';
  if (/email not confirmed/i.test(msg)) return 'O email ainda não foi confirmado.';
  if (/row-level security|permission denied/i.test(msg)) return 'Sem permissão para esta operação. Confirma que tens sessão iniciada.';
  if (/relation .* does not exist|could not find the table/i.test(msg))
    return 'As tabelas ainda não existem no Supabase. Corre o ficheiro supabase/schema.sql no SQL Editor.';
  return msg;
}

/** Iniciar sessão com email e palavra-passe. */
export async function entrar(email: string, password: string): Promise<Sessao> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await erroDe(res);
  const s = paraSessao(await res.json());
  guardarSessao(s);
  return s;
}

/** Terminar sessão (aqui e no servidor). */
export async function sair() {
  const s = sessaoAtual;
  guardarSessao(null);
  if (s) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` },
    }).catch(() => undefined);
  }
}

/** Pedir um token novo com o refresh_token. Se falhar, a sessão acabou. */
async function refrescar(): Promise<Sessao | null> {
  const s = sessaoAtual;
  if (!s) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!res.ok) {
    guardarSessao(null);
    return null;
  }
  const nova = paraSessao(await res.json());
  guardarSessao(nova);
  return nova;
}

/** Devolve um token válido, renovando a sessão se estiver a expirar. */
export async function tokenValido(): Promise<string> {
  let s = sessaoAtual;
  if (!s) throw new SessaoExpirada();
  if (s.expires_at - 60 < Date.now() / 1000) {
    refrescamento ??= refrescar().finally(() => (refrescamento = null));
    s = await refrescamento;
    if (!s) throw new SessaoExpirada();
  }
  return s.access_token;
}

/** Erro especial: a app volta ao ecrã de entrar quando o recebe (ver state.tsx). */
export class SessaoExpirada extends Error {
  constructor() {
    super('A sessão terminou. Volta a entrar.');
  }
}

/** Cabeçalhos de todos os pedidos: a chave pública e o token da sessão. */
async function cabecalhos(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${await tokenValido()}`,
    ...extra,
  };
}

// ---------- Base de dados (PostgREST) ----------

// O PostgREST devolve no máximo 1000 linhas por pedido: pedimos por páginas até acabar.
const PAGINA = 1000;

/** Ler todas as linhas de uma tabela, ordenadas (ex.: 'data_venda.desc'). */
export async function listar<T>(tabela: string, ordem = 'id'): Promise<T[]> {
  const todos: T[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=*&order=${ordem}`, {
      headers: await cabecalhos({ Range: `${inicio}-${inicio + PAGINA - 1}`, 'Range-Unit': 'items' }),
    });
    if (!res.ok) throw await erroDe(res);
    const lote = (await res.json()) as T[];
    todos.push(...lote);
    if (lote.length < PAGINA) return todos;
  }
}

/** Acrescentar linhas novas (usado no histórico, que nunca se altera). */
export async function inserir<T>(tabela: string, linhas: T | T[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: await cabecalhos({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(linhas),
  });
  if (!res.ok) throw await erroDe(res);
}

/** Alterar alguns campos de uma linha. */
export async function atualizar(tabela: string, chave: string, valor: string, alteracoes: object): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${chave}=eq.${encodeURIComponent(valor)}`, {
    method: 'PATCH',
    headers: await cabecalhos({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(alteracoes),
  });
  if (!res.ok) throw await erroDe(res);
}

/**
 * "Upsert" = insert ou update: se a linha (pelo id) já existe, atualiza; senão cria.
 * É o que a app usa para guardar quase tudo.
 */
export async function upsert(tabela: string, linhas: object | object[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: await cabecalhos({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
    }),
    body: JSON.stringify(linhas),
  });
  if (!res.ok) throw await erroDe(res);
}

/** Apagar uma linha pela chave. */
export async function apagar(tabela: string, chave: string, valor: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${chave}=eq.${encodeURIComponent(valor)}`, {
    method: 'DELETE',
    headers: await cabecalhos(),
  });
  if (!res.ok) throw await erroDe(res);
}

/** Chamar uma função SQL da base de dados (ex.: e_membro, que diz se o email está autorizado). */
export async function rpc<T>(funcao: string, args: object = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: await cabecalhos({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw await erroDe(res);
  return (await res.json()) as T;
}

// ---------- Fotografias (Storage) ----------

const BUCKET = 'fotos';

/** Enviar uma fotografia para o bucket privado "fotos". */
export async function enviarFoto(caminho: string, ficheiro: Blob): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: await cabecalhos({ 'Content-Type': ficheiro.type || 'image/jpeg', 'x-upsert': 'true' }),
    body: ficheiro,
  });
  if (!res.ok) throw await erroDe(res);
}

// Cada fotografia só é descarregada uma vez por sessão
const cacheFotos = new Map<string, Promise<string>>();

/** Descarrega uma fotografia privada e devolve um URL local para a mostrar. */
export function urlFoto(caminho: string): Promise<string> {
  let p = cacheFotos.get(caminho);
  if (!p) {
    p = (async () => {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${caminho}`, {
        headers: await cabecalhos(),
      });
      if (!res.ok) throw await erroDe(res);
      return URL.createObjectURL(await res.blob());
    })();
    p.catch(() => cacheFotos.delete(caminho));
    cacheFotos.set(caminho, p);
  }
  return p;
}

/** Apagar uma fotografia do Storage. */
export async function apagarFoto(caminho: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: await cabecalhos({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [caminho] }),
  });
  if (!res.ok) throw await erroDe(res);
}
