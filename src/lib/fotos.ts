// Regras das fotografias dos produtos (sem ecrã, testadas em tests/fotos.test.ts).
//
// COMO SE GUARDAM: cada fotografia tem duas versões no Storage do Supabase (bucket "fotos"):
//   - a ORIGINAL, com boa qualidade (até 2048 px, JPEG a 90%, ~0,5–1 MB): é a que se partilha
//     ou descarrega para pôr no anúncio da Vinted;
//   - a MINIATURA (até 400 px, ~30 KB), no mesmo caminho com ".min.jpg": é a que a app mostra nas
//     listas e no detalhe, para poupar o tráfego do plano grátis (5 GB por mês).
// No produto (produtos.fotos) guarda-se só o caminho da original: "id-do-produto/uuid.jpg".
//
// LIMPEZA (pedido do Ricardo): as fotografias são do SET, não da unidade: enquanto houver alguma
// unidade igual em stock (mesmo set e condição) servem para a anunciar e não se apagam. Só quando o
// set fica sem stock, com a última venda há mais de 7 dias (numa devolução a Vinted mantém as fotos
// do anúncio), se apagam as fotografias e fica só a miniatura da primeira, para o produto continuar
// a ter imagem nas listas. O produto passa a ter fotos = ["…/uuid.min.jpg"].

import { produtoNovo } from './anuncio';
import { chaveComparacao, diasEntre, emInventario, unidadesDisponiveis, vendaValida } from './calc';
import type { Produto, Venda } from './types';

/** Tamanho e qualidade das versões guardadas. */
export const FOTO_ORIGINAL = { max: 2048, qualidade: 0.9 };
export const FOTO_MINIATURA = { max: 400, qualidade: 0.75 };
/** Dias depois da última venda até se apagarem as fotografias de um produto todo vendido. */
export const DIAS_LIMPAR_FOTOS = 7;

const MIN = /\.min\.jpg$/;

/** É uma miniatura (o produto já foi limpo)? As fotos do modo demonstração ("data:") não têm versões. */
export const eMiniatura = (ref: string) => MIN.test(ref);

/** Caminho da miniatura de uma fotografia. */
export const miniaturaDe = (ref: string) => (ref.startsWith('data:') || eMiniatura(ref) ? ref : ref.replace(/\.jpg$/i, '.min.jpg'));

/** Caminho da original de uma fotografia (se só resta a miniatura, a original já não existe). */
export const originalDe = (ref: string) => (ref.startsWith('data:') ? ref : ref.replace(MIN, '.jpg'));

export interface LimpezaFotos {
  produto: Produto;
  /** Caminho a manter no produto: a miniatura da primeira fotografia. */
  manter: string;
  /** Caminhos a apagar do Storage: todas as originais e as miniaturas das outras fotografias. */
  apagar: string[];
}

/** Grupo de iguais para as fotografias: mesmo set (ou nome) e mesma condição (novo/usado). */
const grupoFotos = (p: Produto) => `${chaveComparacao(p)}|${produtoNovo(p) ? 'novo' : 'usado'}`;

/**
 * Produtos cujas fotografias já se podem limpar: vendidos, sem unidades por vender, sem devolução em
 * curso, SEM NENHUMA UNIDADE IGUAL (mesmo set e condição) AINDA EM STOCK, com a última venda do
 * grupo há mais de DIAS_LIMPAR_FOTOS dias, e com algo para apagar (mais de uma fotografia, ou a
 * primeira ainda tem a original).
 */
export function fotosALimpar(produtos: Produto[], vendas: Venda[], hoje: string, dias = DIAS_LIMPAR_FOTOS): LimpezaFotos[] {
  // Por grupo de iguais: tem stock? e a data da última venda válida
  const grupos = new Map<string, { stock: boolean; ultima: string | null; ids: Set<string> }>();
  for (const p of produtos) {
    const k = grupoFotos(p);
    const g = grupos.get(k) ?? { stock: false, ultima: null, ids: new Set<string>() };
    g.ids.add(p.id);
    if (emInventario(p) && unidadesDisponiveis(p, vendas) > 0) g.stock = true;
    grupos.set(k, g);
  }
  const grupoDe = new Map<string, { stock: boolean; ultima: string | null }>();
  for (const g of grupos.values()) for (const id of g.ids) grupoDe.set(id, g);
  for (const v of vendas) {
    const g = grupoDe.get(v.produto_id);
    if (g && vendaValida(v) && (!g.ultima || v.data_venda > g.ultima)) g.ultima = v.data_venda;
  }
  const r: LimpezaFotos[] = [];
  for (const p of produtos) {
    const fotos = (p.fotos ?? []).filter((f) => !f.startsWith('data:'));
    if (!fotos.length || p.estado !== 'vendido') continue;
    if (fotos.length === 1 && eMiniatura(fotos[0])) continue; // já limpo
    if (unidadesDisponiveis(p, vendas) > 0) continue;
    const g = grupoDe.get(p.id)!;
    if (g.stock) continue; // ainda há iguais em stock: as fotos servem para os anunciar
    if (!g.ultima || diasEntre(g.ultima, hoje) <= dias) continue;
    const manter = miniaturaDe(fotos[0]);
    const apagar = new Set<string>();
    fotos.forEach((f, i) => {
      if (!eMiniatura(f)) apagar.add(originalDe(f));
      if (i > 0) apagar.add(miniaturaDe(f));
    });
    apagar.delete(manter);
    r.push({ produto: p, manter, apagar: [...apagar] });
  }
  return r;
}

/* Só no browser (usa um canvas para desenhar a fotografia mais pequena). */
/** Reduz uma fotografia para no máximo "max" px, em JPEG com a qualidade dada (0–1). */
export async function reduzirFoto(ficheiro: Blob, max = 1280, qualidade = 0.82): Promise<Blob> {
  const img = await createImageBitmap(ficheiro);
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Fotografia inválida'))), 'image/jpeg', qualidade));
}

/** Nome de ficheiro para descarregar/partilhar: "LEGO 76303 Tumbler Batman - 1.jpg". */
export function nomeFicheiroFoto(p: Pick<Produto, 'nome' | 'set_numero' | 'marca'>, i: number, total: number) {
  const marca = p.marca?.trim() ?? '';
  const base = [marca && !p.nome.toLowerCase().includes(marca.toLowerCase()) ? marca : '', p.set_numero?.trim(), p.nome.trim()]
    .filter(Boolean)
    .join(' ')
    .replace(/[\\/:*?"<>|]+/g, '')
    .slice(0, 60)
    .trim();
  return total > 1 ? `${base} - ${i + 1}.jpg` : `${base}.jpg`;
}
