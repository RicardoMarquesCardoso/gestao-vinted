// Função "ebay-rotacao" (Supabase Edge Function): vai pesquisando sozinha o eBay dos sets do
// Continente, para o "Vale a pena?" já ter o eBay quando chega uma promoção (pedido do Ricardo,
// nov/2026).
//
// Quem a chama: o pg_cron do Supabase, a cada 7 minutos (job "ebay-rotacao"), com o código
// definicoes.token_rotacao_ebay no corpo. Sem esse código, recusa.
//
// Em cada chamada:
//   1. Pergunta à função SQL sets_rotacao_ebay qual o próximo set: da última lista do Continente,
//      que não temos em stock (esses vêm na tarefa diária), não procurado há menos de 7 dias.
//      Primeiro os com desconto. No máximo 200 por dia (a função SQL já conta).
//   2. Pesquisa esse set nas 4 lojas do eBay, uma de cada vez, com 2 s entre pedidos.
//   3. Guarda em definicoes.ebay_pesquisas (registar_pesquisa_ebay, com "auto": true).
// Assim as ~800 chamadas por dia ficam espalhadas pelo dia, longe do limite de 5000 do eBay.
//
// Usa só a chave pública (anon) do Supabase: as funções SQL confirmam o código.

import { chavesEbay, pesquisarSet, rpc } from '../_shared/ebay.ts';

const SETS_POR_CHAMADA = 1;
const PAUSA_MS = 2000;

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

  const chaves = chavesEbay();
  if (!chaves) return responder({ erro: 'sem_chaves' });

  const r = await rpc('sets_rotacao_ebay', { token, limite: SETS_POR_CHAMADA }, cab);
  if (!r.ok) return responder({ erro: 'sets', detalhe: await r.text() }, 502);
  const sets: string[] = await r.json();
  if (!sets.length) return responder({ feitos: [] }); // sem sets por procurar, ou já 200 hoje

  const feitos = [];
  for (const set of sets) {
    try {
      const res = await pesquisarSet(set, chaves, PAUSA_MS);
      const g = await rpc('registar_pesquisa_ebay', { p_set: set, p_mediana: res.mediana, p_anuncios: res.anuncios, p_token: token }, cab);
      feitos.push({ set, mediana: res.mediana, anuncios: res.anuncios, guardada: g.ok });
    } catch (e) {
      feitos.push({ set, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return responder({ feitos });
});
