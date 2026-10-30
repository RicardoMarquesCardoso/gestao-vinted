// Fotografias: partilhar/descarregar as de um produto e limpar as dos produtos vendidos.
//
// - PartilharFotos: botões "Partilhar fotos" e "Descarregar". No telemóvel, "Partilhar" abre o
//   menu de partilha do sistema com as fotografias originais (boa qualidade) do produto, e daí
//   escolhe-se a Vinted, o WhatsApp, a galeria… Onde o browser não deixa partilhar ficheiros
//   (ex.: computador), só aparece "Descarregar", que grava cada fotografia como ficheiro.
// - LimpezaFotos: corre uma vez sempre que a app abre (só com dados reais) e, para os produtos
//   todos vendidos há mais de 7 dias, apaga as fotografias e deixa só a miniatura da primeira
//   (regras em lib/fotos.ts). Fotografias antigas, de antes das miniaturas, ganham a miniatura
//   nessa altura. Faz no máximo 10 produtos de cada vez, para não pesar ao abrir.

import { useEffect, useRef, useState } from 'react';
import { FOTO_MINIATURA, fotosALimpar, nomeFicheiroFoto } from '../lib/fotos';
import { hoje } from '../lib/format';
import type { Produto } from '../lib/types';
import { useDados } from '../state';
import { reduzirFoto } from './ui';

/** Os browsers que deixam partilhar ficheiros (sobretudo telemóveis). */
const podePartilharFicheiros = () => {
  try {
    const teste = new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' });
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [teste] });
  } catch {
    return false;
  }
};

export function PartilharFotos({ p }: { p: Produto }) {
  const { store, aviso } = useDados();
  const [aPreparar, setAPreparar] = useState(false);
  if (!p.fotos.length) return null;

  // Vai buscar as originais (ou a miniatura, se o produto já foi limpo) como ficheiros
  async function ficheiros(): Promise<File[]> {
    const r: File[] = [];
    for (const [i, ref] of p.fotos.entries()) {
      const url = await store.urlFoto(ref, 'original');
      const blob = await (await fetch(url)).blob();
      r.push(new File([blob], nomeFicheiroFoto(p, i, p.fotos.length), { type: 'image/jpeg' }));
    }
    return r;
  }

  async function partilhar() {
    setAPreparar(true);
    try {
      const fs = await ficheiros();
      await navigator.share({ files: fs, title: p.nome });
    } catch (e) {
      // Cancelar o menu de partilha não é um erro
      if (!(e instanceof DOMException && e.name === 'AbortError')) aviso(`Não foi possível partilhar: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAPreparar(false);
    }
  }

  async function descarregar() {
    setAPreparar(true);
    try {
      for (const f of await ficheiros()) {
        const url = URL.createObjectURL(f);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      aviso(`Não foi possível descarregar: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAPreparar(false);
    }
  }

  return (
    <div className="partilhar-fotos">
      {podePartilharFicheiros() && (
        <button type="button" className="btn btn-pequeno" onClick={partilhar} disabled={aPreparar}>
          {aPreparar ? 'A preparar…' : `Partilhar ${p.fotos.length === 1 ? 'foto' : `${p.fotos.length} fotos`}`}
        </button>
      )}
      <button type="button" className="btn btn-pequeno" onClick={descarregar} disabled={aPreparar}>
        Descarregar
      </button>
    </div>
  );
}

/** Limpeza automática das fotografias dos produtos vendidos (não desenha nada). */
export function LimpezaFotos() {
  const { store, dados, carregando, guardar } = useDados();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || carregando || store.modo !== 'supabase' || !dados.produtos.length) return;
    feito.current = true;
    const lista = fotosALimpar(dados.produtos, dados.vendas, hoje()).slice(0, 10);
    void (async () => {
      for (const { produto, manter, apagar } of lista) {
        try {
          // Garantir que a miniatura a manter existe: as fotografias de antes das miniaturas não a
          // têm, e cria-se agora a partir da original. Se falhar, não se apaga nada (o produto
          // ficaria sem imagem) e tenta-se da próxima vez.
          const existe = await store.urlFoto(manter, 'min').then(() => true, () => false);
          if (!existe) {
            const url = await store.urlFoto(produto.fotos[0], 'original');
            const min = await reduzirFoto(await (await fetch(url)).blob(), FOTO_MINIATURA.max, FOTO_MINIATURA.qualidade);
            await store.enviarFotoCaminho(manter, min);
          }
          await store.apagarFoto(apagar);
          await guardar('produtos', [{ ...produto, fotos: [manter] }]);
        } catch {
          /* tenta-se de novo da próxima vez que a app abrir */
        }
      }
    })();
  }, [carregando, store, dados.produtos, dados.vendas, guardar]);
  return null;
}
