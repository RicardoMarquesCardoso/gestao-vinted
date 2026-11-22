// O que acontece aos anúncios quando se vende (Vendi e Registar venda), nov/2026.
//
// Junta as regras de lib/anuncios.ts (operacoesVenda) com o que só se sabe aqui: que unidades
// ficam em stock depois da venda (lib/calc.ts) e o que é "o mesmo set" (chavePlano, lib/plano.ts:
// mesmo n.º ou nome e mesma condição, porque as fotos são do set).
//
// Devolve as linhas a gravar: primeiro os anúncios, depois os produtos (o vendido e, se for o caso,
// a unidade igual em stock que recebeu os anúncios das outras plataformas).

import { abertosDoProduto, nomePlataforma, operacoesVenda } from './anuncios';
import { emInventario, unidadesDisponiveis } from './calc';
import { chavePlano } from './plano';
import type { Anuncio, Dados, Plataforma, Produto, Venda } from './types';

export function depoisDaVenda(
  dados: Pick<Dados, 'produtos' | 'anuncios' | 'contas'>,
  produto: Produto,
  contaVenda: string | null,
  vendasDepois: Venda[],
  agora: string,
): { anuncios: Anuncio[]; produtos: Produto[]; retirarDe: Plataforma[] } {
  const sobram = unidadesDisponiveis(produto, vendasDepois);
  const r = operacoesVenda({
    produto,
    contaVenda,
    sobram,
    estadoSemAnuncios: sobram > 0 ? 'por_anunciar' : 'vendido',
    produtos: dados.produtos,
    anuncios: dados.anuncios,
    contas: dados.contas,
    chaveSet: chavePlano,
    emStock: (x) => emInventario(x) && unidadesDisponiveis(x, vendasDepois) > 0,
    agora,
  });
  // Anúncios que ficaram abertos num produto sem unidades: é preciso retirá-los à mão (só aviso)
  const ficam = sobram > 0 ? [] : abertosDoProduto(
    [...dados.anuncios.filter((a) => !r.anuncios.some((x) => x.id === a.id)), ...r.anuncios],
    produto.id,
  ).map((a) => a.plataforma);
  return { anuncios: r.anuncios, produtos: [{ ...produto, ...r.resumo }, ...r.outros], retirarDe: ficam };
}

/** Texto curto para o aviso depois da venda: "Retira o anúncio da Wallapop." */
export const textoRetirar = (plataformas: Plataforma[]) =>
  plataformas.length ? ` Retira o anúncio da ${plataformas.map(nomePlataforma).join(' e da ')}.` : '';
