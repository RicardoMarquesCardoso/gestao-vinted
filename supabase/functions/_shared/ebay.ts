// Pesquisa do eBay de UM set, partilhada pelas funções ebay-set (botão) e ebay-rotacao (automática).
//
// Anúncios de "novo", a preço fixo, nas lojas eBay DE/FR/ES/IT, tal como a tarefa diária
// (scripts/mercado.py): só anúncios com o n.º do set no título e que não sejam partes do set.
// Devolve a mediana do preço PEDIDO (sem os 10% mais baratos e mais caros) e o n.º de anúncios.
// É a API oficial do eBay (Browse API), com as chaves EBAY_CLIENT_ID / EBAY_CLIENT_SECRET dos
// segredos das Edge Functions (nunca no código).

export const LOJAS = ['EBAY_DE', 'EBAY_FR', 'EBAY_ES', 'EBAY_IT'];
const CATEGORIA_SETS = '19006'; // "LEGO Complete Sets & Packs"
// Anúncios que não são o set completo (caixa vazia, só instruções, minifiguras, peças…)
const EXCLUIR =
  /\b(leer|empty|vide|vac[ií]a|vuot|ohne|sans|sin|senza|nur|only|anleitung|instructions?|notice|minifig\w*|figur\w*|teile|parts|pi[eè]ces|piezas|pezzi|sticker|aufkleber|poster|box only)\b/i;

export interface ResultadoEbay {
  set: string;
  mediana: number | null; // null com menos de 3 anúncios
  anuncios: number;
  lojas: Record<string, number>;
}

/** As chaves do eBay, ou null se ainda não estiverem nos segredos. */
export function chavesEbay(): { id: string; segredo: string } | null {
  const id = Deno.env.get('EBAY_CLIENT_ID')?.trim();
  const segredo = Deno.env.get('EBAY_CLIENT_SECRET')?.trim();
  return id && segredo ? { id, segredo } : null;
}

// O token do eBay dura ~2 horas: guarda-se enquanto a função estiver "acordada"
let tokenEbay: { valor: string; ate: number } | null = null;

async function pedirTokenEbay(id: string, segredo: string): Promise<string> {
  if (tokenEbay && tokenEbay.ate > Date.now()) return tokenEbay.valor;
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${segredo}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
  });
  if (!r.ok) throw new Error(`eBay recusou as chaves (HTTP ${r.status})`);
  const j = await r.json();
  tokenEbay = { valor: j.access_token, ate: Date.now() + (Number(j.expires_in) - 120) * 1000 };
  return tokenEbay.valor;
}

const mediana = (xs: number[]) => {
  const n = xs.length;
  return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
};
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pesquisa um set nas 4 lojas. pausa > 0: uma loja de cada vez, com essa pausa entre pedidos
 * (a rotação automática espaça os pedidos); pausa = 0: as 4 ao mesmo tempo (o botão, mais rápido).
 */
export async function pesquisarSet(set: string, chaves: { id: string; segredo: string }, pausa = 0): Promise<ResultadoEbay> {
  const token = await pedirTokenEbay(chaves.id, chaves.segredo);
  const lojas: Record<string, number> = {};
  const precos: number[] = [];
  const umaLoja = async (loja: string) => {
    const q = new URLSearchParams({
      q: `lego ${set}`,
      category_ids: CATEGORIA_SETS,
      filter: 'conditionIds:{1000},buyingOptions:{FIXED_PRICE},priceCurrency:EUR', // 1000 = novo
      limit: '50',
    });
    const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${q}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': loja },
    });
    if (!r.ok) return;
    const j = await r.json();
    let n = 0;
    for (const item of j.itemSummaries ?? []) {
      const titulo: string = item.title ?? '';
      const preco = item.price ?? {};
      if (!new RegExp(`(?<!\\d)${set}(?!\\d)`).test(titulo) || EXCLUIR.test(titulo)) continue;
      if (preco.currency === 'EUR' && Number(preco.value) > 0) {
        precos.push(Number(preco.value));
        n++;
      }
    }
    lojas[loja] = n;
  };
  if (pausa > 0) {
    for (const [i, loja] of LOJAS.entries()) {
      if (i) await esperar(pausa);
      await umaLoja(loja);
    }
  } else {
    await Promise.all(LOJAS.map(umaLoja));
  }
  if (precos.length < 3) return { set, mediana: null, anuncios: precos.length, lojas };
  // Cortar os 10% mais baratos e mais caros (anúncios estranhos) antes da mediana
  precos.sort((a, b) => a - b);
  const corte = Math.floor(precos.length / 10);
  const uteis = precos.slice(corte, precos.length - corte);
  return { set, mediana: Math.round(mediana(uteis.length ? uteis : precos) * 100) / 100, anuncios: precos.length, lojas };
}

/** Chama uma função SQL (RPC) do Supabase com os cabeçalhos dados. */
export async function rpc(funcao: string, corpo: unknown, cabecalhos: Record<string, string>): Promise<Response> {
  return await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: { ...cabecalhos, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}
