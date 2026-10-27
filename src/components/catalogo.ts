import { useEffect, useMemo, useState } from 'react';
import { chaveComparacao, custoUnitario, emInventario, unidadesDisponiveis } from '../lib/calc';
import { fmtEuro } from '../lib/format';
import { useDados } from '../state';
import type { SugestaoProduto } from './ui';
import { urlReferencia } from './ui';

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();


const unicos = (xs: (string | null | undefined)[]) => {
  const vistos = new Map<string, string>();
  for (const x of xs) {
    const v = (x ?? '').trim();
    if (v && !vistos.has(v.toLowerCase())) vistos.set(v.toLowerCase(), v);
  }
  return [...vistos.values()];
};

/** Produtos já conhecidos, categorias e subcategorias, para sugerir ao escrever. */
export function useCatalogo() {
  const { dados, lista } = useDados();

  const sugestoes = useMemo<SugestaoProduto[]>(() => {
    const grupos = new Map<string, typeof dados.produtos>();
    for (const p of dados.produtos) grupos.set(chaveComparacao(p), [...(grupos.get(chaveComparacao(p)) ?? []), p]);
    return [...grupos.entries()]
      .map(([chave, ps]) => {
        const p = [...ps].sort((a, b) => (b.data_compra ?? '').localeCompare(a.data_compra ?? ''))[0];
        const stock = ps.reduce((a, x) => a + (emInventario(x) ? unidadesDisponiveis(x, dados.vendas) : 0), 0);
        const media = ps.reduce((a, x) => a + custoUnitario(x), 0) / ps.length;
        return {
          chave,
          nome: p.nome,
          set_numero: p.set_numero,
          marca: p.marca,
          tema: p.tema,
          imagem: urlReferencia(p),
          detalhe: [
            [p.marca, p.tema].filter(Boolean).join(' › '),
            p.set_numero && `Set ${p.set_numero}`,
            stock ? `${stock} em stock` : null,
            `custo médio ${fmtEuro(media)}`,
          ]
            .filter(Boolean)
            .join(' · '),
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dados.produtos, dados.vendas]);

  const marcas = useMemo(() => unicos([...lista('marcas'), ...dados.produtos.map((p) => p.marca)]), [dados.produtos, lista]);

  /** Subcategorias já usadas com esta categoria (as mais usadas primeiro). */
  const temasDe = (marca: string) => {
    const m = marca.trim().toLowerCase();
    const conta = new Map<string, number>();
    for (const p of dados.produtos) {
      if (!p.tema || (m && (p.marca ?? '').toLowerCase() !== m)) continue;
      conta.set(p.tema, (conta.get(p.tema) ?? 0) + 1);
    }
    const usados = [...conta.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return unicos([...usados, ...(!m || m === 'lego' ? lista('temas') : [])]);
  };

  /** Dados conhecidos de um número de set, para preencher automaticamente. */
  const doSet = (set: string) => {
    const s = set.trim().toLowerCase();
    return s ? sugestoes.find((x) => (x.set_numero ?? '').trim().toLowerCase() === s) : undefined;
  };

  return { sugestoes, marcas, temasDe, doSet };
}

// ---------- Catálogo oficial de sets LEGO (gerado mensalmente a partir do Rebrickable) ----------

export interface InfoSet {
  numero: string;
  nome: string;
  ano: number | null;
  tema: string | null;
  subtema: string | null;
}

let catalogoSets: Promise<Record<string, [string, number | null, string | null, string | null]>> | null = null;

function carregarCatalogoSets() {
  catalogoSets ??= fetch('catalogo-sets.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : { sets: {} }))
    .then((j) => j.sets ?? {})
    .catch(() => {
      catalogoSets = null; // tentar de novo da próxima vez
      return {};
    });
  return catalogoSets;
}

/** Procura um n.º de set no catálogo (carregado só quando é preciso). */
export function useCatalogoSets() {
  const [sets, setSets] = useState<Record<string, [string, number | null, string | null, string | null]> | null>(null);
  useEffect(() => {
    let ativo = true;
    void carregarCatalogoSets().then((s) => ativo && setSets(s));
    return () => {
      ativo = false;
    };
  }, []);
  const procurar = (numero: string): InfoSet | undefined => {
    const n = numero.trim().replace(/-\d+$/, '');
    const x = n && sets?.[n];
    return x ? { numero: n, nome: x[0], ano: x[1], tema: x[2], subtema: x[3] } : undefined;
  };
  /** Sets do mesmo tema cujo nome oficial se parece com o nosso (para sugerir o n.º certo). */
  procurar.parecidos = (nome: string, tema: string | null, ano: number | null, excluir: string): InfoSet[] => {
    if (!sets || !tema) return [];
    const palavras = new Set(normalizar(nome).split(' ').filter((w) => w.length > 2 && !GENERICAS.has(w)));
    if (!palavras.size) return [];
    const r: { info: InfoSet; pontos: number }[] = [];
    for (const [n, x] of Object.entries(sets)) {
      if (n === excluir || x[2] !== tema) continue;
      const pw = normalizar(x[0]).split(' ');
      const comuns = [...palavras].filter((w) => pw.some((y) => y === w || (w.length > 4 && y.startsWith(w)))).length;
      if (!comuns || comuns < Math.min(palavras.size, 2)) continue;
      r.push({ info: { numero: n, nome: x[0], ano: x[1], tema: x[2], subtema: x[3] }, pontos: comuns * 10 - Math.abs((x[1] ?? 0) - (ano ?? 0)) });
    }
    return r.sort((a, b) => b.pontos - a.pontos).slice(0, 2).map((x) => x.info);
  };
  return procurar;
}

// Palavras demasiado comuns para identificar um set
const GENERICAS = new Set(['lego', 'set', 'the', 'and', 'mf', 'microfighter', 'mech', 'pack', 'box', 'random', 'minifigura', 'minifigure']);

/**
 * Dados a preencher a partir do n.º de set: primeiro o que já registámos (os nossos nomes),
 * senão o catálogo oficial.
 */
export function useInfoPorSet() {
  const { doSet } = useCatalogo();
  const doCatalogo = useCatalogoSets();
  return (numero: string): { nome: string; marca: string; tema: string; ano?: number | null } | undefined => {
    const nosso = doSet(numero);
    if (nosso) return { nome: nosso.nome, marca: nosso.marca ?? 'LEGO', tema: nosso.tema ?? '' };
    const c = doCatalogo(numero);
    if (c) return { nome: c.nome, marca: 'LEGO', tema: c.tema ?? '', ano: c.ano };
    return undefined;
  };
}

// ---------- Comparar os nossos nomes com os oficiais ----------

/** 'igual' (só muda a escrita), 'parecido' (partilham palavras) ou 'diferente' (talvez o n.º esteja errado). */
export function compararNomes(nosso: string, oficial: string): 'igual' | 'parecido' | 'diferente' {
  const a = normalizar(nosso);
  const b = normalizar(oficial);
  if (a === b || a.replace(/ /g, '') === b.replace(/ /g, '')) return 'igual';
  if (a.includes(b) || b.includes(a)) return 'parecido';
  const pa = new Set(a.split(' ').filter((w) => w.length > 2));
  const pb = new Set(b.split(' ').filter((w) => w.length > 2));
  const comuns = [...pa].filter((w) => pb.has(w) || [...pb].some((x) => x.startsWith(w) || w.startsWith(x))).length;
  return comuns > 0 ? 'parecido' : 'diferente';
}

export const mesmoTema = (a: string | null, b: string | null) => !!a && !!b && normalizar(a).replace(/ /g, '') === normalizar(b).replace(/ /g, '');
