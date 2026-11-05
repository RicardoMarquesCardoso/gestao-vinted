// Sincronizar os dados entre os dois telemóveis (Ricardo e Cass) sem perder alterações.
//
// PORQUÊ: a app carrega tudo de minuto a minuto. Há três problemas que este ficheiro resolve:
//
// 1. DEFINIÇÕES GUARDADAS COMO UM SÓ BLOCO (planos, tarefas adiadas, listas…): cada uma é um
//    objeto/lista inteiro numa linha de "definicoes". Se o Ricardo muda um plano e a Cass adia uma
//    tarefa no mesmo minuto, cada um envia o bloco inteiro tal como o tinha, e o último apagava a
//    alteração do outro. fundir() junta as duas: aplica só o que ESTE telemóvel mudou por cima do
//    que está agora no servidor ("fusão a três": antes / depois / servidor).
//
// 2. CARREGAMENTOS QUE CHEGAM TARDE: se um carregamento começa, entretanto se grava algo e depois
//    o carregamento acaba, ele trazia os dados de ANTES da gravação e a alteração "desaparecia"
//    durante um minuto. Isso é tratado em state.tsx (carregamentos durante gravações são ignorados).
//
// 3. RECALCULAR SEM NECESSIDADE: cada carregamento criava listas novas mesmo sem nada mudar, e os
//    cálculos pesados (lib/memo.ts) repetiam-se todos os minutos. juntarDados() reaproveita as
//    listas e as linhas que não mudaram, por isso os cálculos só se repetem quando há mudanças.
//
// Funções puras (sem rede nem ecrã), testadas em tests/sincronizar.test.ts.

import type { Dados } from './types';

/** Igualdade profunda (pelo JSON, que chega para dados vindos da base de dados). */
export const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const objetoSimples = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Fusão a três de um valor de definições.
 *   antes    = o que este telemóvel tinha antes de alterar;
 *   depois   = o que este telemóvel quer gravar;
 *   servidor = o que está agora na base de dados (pode já ter alterações do outro telemóvel).
 * Regras:
 *   - se ninguém mais mexeu (servidor = antes), grava-se "depois" tal e qual;
 *   - objetos: chave a chave, o que este telemóvel mudou ganha; o resto fica como no servidor;
 *   - listas: acrescentam-se os elementos que este telemóvel acrescentou e tiram-se os que tirou,
 *     mantendo os que o outro acrescentou;
 *   - outros valores: ganha "depois".
 */
export function fundir(antes: unknown, depois: unknown, servidor: unknown): unknown {
  if (servidor === undefined || igual(servidor, antes)) return depois;
  if (igual(depois, antes)) return servidor;
  if (objetoSimples(antes) && objetoSimples(depois) && objetoSimples(servidor)) {
    const r: Record<string, unknown> = { ...servidor };
    for (const k of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
      if (igual(antes[k], depois[k])) continue; // este telemóvel não mexeu nesta chave
      if (!(k in depois)) delete r[k]; // apagada aqui
      else r[k] = k in servidor ? fundir(antes[k], depois[k], servidor[k]) : depois[k];
    }
    return r;
  }
  if (Array.isArray(antes) && Array.isArray(depois) && Array.isArray(servidor)) {
    const chave = (x: unknown) => JSON.stringify(x);
    const ant = new Set(antes.map(chave));
    const dep = new Set(depois.map(chave));
    const tirados = new Set([...ant].filter((x) => !dep.has(x)));
    const r = servidor.filter((x) => !tirados.has(chave(x)));
    const ja = new Set(r.map(chave));
    for (const x of depois) if (!ant.has(chave(x)) && !ja.has(chave(x))) r.push(x);
    return r;
  }
  return depois;
}

// ---------- Reaproveitar o que não mudou ----------

// O JSON de cada linha já vista, para não o calcular duas vezes
const jsonDe = new WeakMap<object, string>();
const json = (o: object) => {
  let s = jsonDe.get(o);
  if (s === undefined) jsonDe.set(o, (s = JSON.stringify(o)));
  return s;
};

/**
 * Lista nova (acabada de carregar) que reaproveita as linhas iguais da antiga. Se nada mudou,
 * devolve a lista antiga (o mesmo objeto), e os cálculos memorizados não se repetem.
 */
export function juntarLista<T extends object>(antiga: T[], nova: T[], chave: keyof T): T[] {
  const porChave = new Map(antiga.map((x) => [x[chave], x]));
  let mudou = antiga.length !== nova.length;
  const r = nova.map((x, i) => {
    const velha = porChave.get(x[chave]);
    if (velha && json(velha) === json(x)) {
      if (antiga[i] !== velha) mudou = true; // mesma linha, mas noutra posição
      return velha;
    }
    mudou = true;
    return x;
  });
  return mudou ? r : antiga;
}

/** Junta os dados acabados de carregar com os atuais, tabela a tabela (ver juntarLista). */
export function juntarDados(antigos: Dados, novos: Dados): Dados {
  const r = { ...novos } as Record<string, object[]>;
  let mudou = false;
  for (const t of Object.keys(novos) as (keyof Dados)[]) {
    const chave = t === 'definicoes' ? 'chave' : 'id';
    const a = (antigos[t] ?? []) as unknown as Record<string, unknown>[];
    const n = novos[t] as unknown as Record<string, unknown>[];
    r[t] = juntarLista(a, n, chave);
    if (r[t] !== a) mudou = true;
  }
  return mudou ? (r as unknown as Dados) : antigos;
}
