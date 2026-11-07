// Função "wallapop-rotacao" (Supabase Edge Function): vai pesquisando sozinha na Wallapop os sets
// LEGO que temos em stock, para o preço de referência ter o "preço da concorrência" (pedido do
// Ricardo, nov/2026).
//
// Quem a chama: o pg_cron do Supabase, a cada 10 minutos (job "wallapop-rotacao"), com o código
// definicoes.token_rotacao_ebay no corpo (o mesmo da rotação do eBay). Sem esse código, recusa.
//
// Em cada chamada:
//   1. Pergunta à função SQL sets_rotacao_wallapop qual o próximo set: dos que estão em stock
//      (por anunciar ou anunciados), não procurado há menos de 7 dias. No máximo 100 por dia.
//   2. Faz UMA pesquisa na Wallapop (ver _shared/wallapop.ts: filtros e mediana).
//   3. Guarda em definicoes.wallapop_pesquisas (registar_pesquisa_wallapop).
// Com ~75 sets em stock, isto dá ~11 pesquisas por dia: volume de uma pessoa a navegar.
//
// Usa só a chave pública (anon) do Supabase: as funções SQL confirmam o código.

import { pesquisarWallapop } from '../_shared/wallapop.ts';
import { rpc } from '../_shared/ebay.ts';

const responder = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  let token = '';
  try {
    token = String((await req.json()).token ?? '');
  } catch {
    /* corpo inválido */
  }
  if (!token) return responder({ erro: 'sem_codigo' }, 403);

  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const cab = { apikey: anon, Authorization: `Bearer ${anon}` };

  const r = await rpc('sets_rotacao_wallapop', { token, limite: 1 }, cab);
  if (!r.ok) return responder({ erro: 'sets', detalhe: await r.text() }, 502);
  const sets: string[] = await r.json();
  if (!sets.length) return responder({ feitos: [] }); // nada por procurar, ou já 100 hoje

  const feitos = [];
  for (const set of sets) {
    try {
      const res = await pesquisarWallapop(set);
      const g = await rpc('registar_pesquisa_wallapop', { p_set: set, p_mediana: res.mediana, p_anuncios: res.anuncios, p_token: token }, cab);
      feitos.push({ ...res, guardada: g.ok });
    } catch (e) {
      // A Wallapop recusou (bloqueio, mudança no site…): não se guarda nada e tenta-se mais tarde
      feitos.push({ set, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return responder({ feitos });
});
