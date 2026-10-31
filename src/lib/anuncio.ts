// Texto pronto a copiar para a Vinted ao anunciar (título e descrição).
//
// O modelo tem "marcadores" — {marca}, {numero}, {nome}, {tema} — que são trocados pelos dados do
// produto. {marca} é a categoria do produto ("Lego", "Pokémon", "Hot Wheels"…), para o texto não
// dizer "Lego" num produto Pokémon. Há uma descrição para produtos novos e outra para usados.
//
// DESCRIÇÃO POR CONTA (pedido do Ricardo): cada conta da Vinted pode ter a sua descrição (novos e
// usados), para as contas não terem anúncios com texto igual. Sem descrição própria, a conta usa a
// geral. O modelo muda-se em Definições → Texto dos anúncios (guardado em definicoes.modelo_anuncio).

import type { Definicao, Produto } from './types';

export const CHAVE_MODELO_ANUNCIO = 'modelo_anuncio';

export interface TextoConta {
  novo?: string;
  usado?: string;
}

export interface ModeloAnuncio {
  titulo: string;
  novo: string;
  usado: string;
  /** Descrições próprias de cada conta (id da conta → textos); vazias = usa a geral. */
  contas?: Record<string, TextoConta>;
}

/** O texto original da Cass (com "sent" corrigido), com a marca em vez de "Lego". */
export const MODELO_PADRAO: ModeloAnuncio = {
  titulo: '{marca} {numero} {nome}',
  novo: 'New, sealed and in perfect conditions\n\nNew and sealed {marca}\nCarefully sent in box ✨\n\nI have other {marca} items on my page',
  usado: 'Used, complete and in great condition\n\nCarefully sent in box ✨\n\nI have other {marca} items on my page',
};

/** Sugestão de descrição diferente para uma segunda conta (mesma informação, outras palavras). */
export const TEXTO_ALTERNATIVO: Required<TextoConta> = {
  novo: 'Brand new and factory sealed 📦\nNever opened, box in very good condition\nShipped well protected in a sturdy box\n\nMore {marca} on my profile – feel free to ask for a bundle!',
  usado: 'Pre-owned, complete and in great condition\nShipped well protected in a sturdy box\n\nMore {marca} on my profile – feel free to ask for a bundle!',
};

/** O modelo guardado, com os campos em falta preenchidos pelo original. */
export function modeloAnuncio(definicoes: Definicao[]): ModeloAnuncio {
  const v = definicoes.find((d) => d.chave === CHAVE_MODELO_ANUNCIO)?.valor as Partial<ModeloAnuncio> | undefined;
  return { ...MODELO_PADRAO, ...(v && typeof v === 'object' && !Array.isArray(v) ? v : {}) };
}

/** Um produto conta como novo se não tiver condição indicada ou se a condição começar por "Novo". */
export const produtoNovo = (p: Pick<Produto, 'condicao'>) => !p.condicao || /^novo/i.test(p.condicao.trim());

/** A marca como aparece no texto: "LEGO" → "Lego" (como o texto da Cass); as outras como estão. */
export const marcaTexto = (marca: string | null | undefined) => {
  const m = (marca ?? '').trim();
  return /^lego$/i.test(m) ? 'Lego' : m;
};

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const preencher = (modelo: string, p: Pick<Produto, 'nome' | 'set_numero' | 'tema' | 'marca'>) => {
  const marca = marcaTexto(p.marca);
  // Evitar "Lego Lego …" / "Pokémon Pokémon …" quando o nome já começa pela marca
  const nome = marca ? p.nome.trim().replace(new RegExp(`^${escapar(marca)}\\s+`, 'i'), '') : p.nome.trim();
  return modelo
    .replace(/\{marca\}/g, marca)
    .replace(/\{numero\}/g, (p.set_numero ?? '').trim())
    .replace(/\{nome\}/g, nome)
    .replace(/\{tema\}/g, (p.tema ?? '').trim());
};

/** Título e descrição finais para um produto (e a conta onde vai ser anunciado, se houver). */
export function textoAnuncio(p: Pick<Produto, 'nome' | 'set_numero' | 'tema' | 'condicao' | 'marca'>, m: ModeloAnuncio, contaId?: string | null) {
  const novo = produtoNovo(p);
  const daConta = contaId ? m.contas?.[contaId] : undefined;
  const descricao = (novo ? daConta?.novo : daConta?.usado)?.trim() || (novo ? m.novo : m.usado);
  return {
    titulo: preencher(m.titulo, p).replace(/[ \t]+/g, ' ').trim(),
    descricao: preencher(descricao, p)
      .replace(/[ \t]+\n/g, '\n')
      .trim(),
  };
}
