// Fotografias: partilhar/descarregar as de um produto e limpar as dos produtos vendidos.
//
// - PartilharFotos: botões com ícones de partilhar e descarregar, ao lado das fotos do produto.
//   Só as fotos NOSSAS (nunca as imagens genéricas). No telemóvel, partilhar abre o menu de
//   partilha do sistema com as originais (boa qualidade), e daí escolhe-se a Vinted, o WhatsApp,
//   a galeria… Onde o browser não deixa partilhar ficheiros (ex.: computador), só há descarregar.
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

// Ícones (24×24, traço) para os botões de partilhar e descarregar
const IconePartilhar = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3" />
    <path d="M7 8l5-5 5 5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);
const IconeDescarregar = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

/**
 * Botões de partilhar e descarregar as fotografias NOSSAS de um produto (p.fotos). As imagens
 * genéricas (Brickset, TCGplayer) nunca entram: só aparecem quando o produto não tem fotos nossas,
 * e nesse caso estes botões não aparecem.
 *
 * PORQUE É QUE A PARTILHA É EM DOIS TEMPOS (às vezes): o telemóvel só deixa abrir o menu de
 * partilha logo a seguir a um toque. Se for preciso descarregar as fotos primeiro, esse "toque" já
 * expirou quando elas chegam e o telemóvel recusa. Por isso: 1.º toque prepara as fotos (e tenta
 * partilhar); se o telemóvel recusar, o botão fica destacado e o 2.º toque partilha logo, com as
 * fotos já prontas. As fotos ficam preparadas enquanto a janela estiver aberta.
 *
 * vertical: só ícones, em coluna, ao lado das fotos (detalhe do produto).
 */
export function PartilharFotos({ p, vertical }: { p: Produto; vertical?: boolean }) {
  const { store, aviso } = useDados();
  const [aPreparar, setAPreparar] = useState(false);
  const [pronto, setPronto] = useState(false);
  const preparados = useRef<{ chave: string; ficheiros: File[] } | null>(null);
  const chave = p.fotos.join('|');
  if (!p.fotos.length) return null;

  // Vai buscar as originais (ou a miniatura, se o produto já foi limpo) como ficheiros
  async function ficheiros(): Promise<File[]> {
    if (preparados.current?.chave === chave) return preparados.current.ficheiros;
    const r: File[] = [];
    for (const [i, ref] of p.fotos.entries()) {
      const url = await store.urlFoto(ref, 'original');
      const blob = await (await fetch(url)).blob();
      r.push(new File([blob], nomeFicheiroFoto(p, i, p.fotos.length), { type: 'image/jpeg' }));
    }
    preparados.current = { chave, ficheiros: r };
    return r;
  }

  async function partilhar() {
    // Fotos já preparadas: partilhar logo, ainda dentro do toque
    if (preparados.current?.chave === chave) {
      try {
        await navigator.share({ files: preparados.current.ficheiros });
        setPronto(false);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) aviso(`Não foi possível partilhar: ${e instanceof Error ? e.message : e}`, 'erro');
      }
      return;
    }
    setAPreparar(true);
    try {
      const fs = await ficheiros();
      try {
        await navigator.share({ files: fs });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // cancelou o menu
        // O toque já expirou enquanto se descarregavam as fotos: pedir um 2.º toque
        setPronto(true);
        aviso('Fotografias prontas: toca outra vez em partilhar.');
      }
    } catch (e) {
      aviso(`Não foi possível preparar as fotografias: ${e instanceof Error ? e.message : e}`, 'erro');
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

  const n = p.fotos.length === 1 ? 'a fotografia' : `as ${p.fotos.length} fotografias`;
  return (
    <div className={vertical ? 'acoes-fotos acoes-fotos-vertical' : 'acoes-fotos'}>
      {podePartilharFicheiros() && (
        <button
          type="button"
          className={`btn-redondo ${pronto ? 'btn-redondo-primario' : ''}`}
          onClick={partilhar}
          disabled={aPreparar}
          aria-label={`Partilhar ${n}`}
          title={pronto ? 'Toca para partilhar' : `Partilhar ${n}`}
        >
          {aPreparar ? <span className="a-rodar">↻</span> : <IconePartilhar />}
        </button>
      )}
      <button type="button" className="btn-redondo" onClick={descarregar} disabled={aPreparar} aria-label={`Descarregar ${n}`} title={`Descarregar ${n}`}>
        <IconeDescarregar />
      </button>
      {!vertical && <span className="mudo pequeno">{p.fotos.length === 1 ? '1 fotografia' : `${p.fotos.length} fotografias`}</span>}
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
