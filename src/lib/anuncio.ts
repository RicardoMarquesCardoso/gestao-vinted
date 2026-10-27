// Texto pronto a copiar para a Vinted ao anunciar (título e descrição).
//
// O modelo tem "marcadores" — {numero}, {nome}, {tema} — que são trocados pelos dados do
// produto. Há uma descrição para produtos novos e outra para usados. O modelo pode ser
// alterado em Definições → Texto dos anúncios (guardado em definicoes.modelo_anuncio).

import type { Definicao, Produto } from './types';

export const CHAVE_MODELO_ANUNCIO = 'modelo_anuncio';

export interface ModeloAnuncio {
  titulo: string;
  novo: string;
  usado: string;
}

/** O texto original da Cass (com "sent" corrigido). */
export const MODELO_PADRAO: ModeloAnuncio = {
  titulo: 'Lego {numero} {nome}',
  novo: 'New, sealed and in perfect conditions\n\nNew and sealed Legos\nCarefully sent in box ✨\n\nI have other Lego items on my page',
  usado: 'Used, complete and in great condition\n\nCarefully sent in box ✨\n\nI have other Lego items on my page',
};

/** O modelo guardado, com os campos em falta preenchidos pelo original. */
export function modeloAnuncio(definicoes: Definicao[]): ModeloAnuncio {
  const v = definicoes.find((d) => d.chave === CHAVE_MODELO_ANUNCIO)?.valor as Partial<ModeloAnuncio> | undefined;
  return { ...MODELO_PADRAO, ...(v && typeof v === 'object' && !Array.isArray(v) ? v : {}) };
}

/** Um produto conta como novo se não tiver condição indicada ou se a condição começar por "Novo". */
export const produtoNovo = (p: Pick<Produto, 'condicao'>) => !p.condicao || /^novo/i.test(p.condicao.trim());

const preencher = (modelo: string, p: Pick<Produto, 'nome' | 'set_numero' | 'tema'>) => {
  // Evitar "Lego Lego ..." quando o nome já começa pela marca
  const nome = p.nome.trim().replace(/^lego\s+/i, '');
  return modelo
    .replace(/\{numero\}/g, (p.set_numero ?? '').trim())
    .replace(/\{nome\}/g, nome)
    .replace(/\{tema\}/g, (p.tema ?? '').trim());
};

/** Título e descrição finais para um produto. */
export function textoAnuncio(p: Pick<Produto, 'nome' | 'set_numero' | 'tema' | 'condicao'>, m: ModeloAnuncio) {
  return {
    titulo: preencher(m.titulo, p).replace(/[ \t]+/g, ' ').trim(),
    descricao: preencher(produtoNovo(p) ? m.novo : m.usado, p).trim(),
  };
}
