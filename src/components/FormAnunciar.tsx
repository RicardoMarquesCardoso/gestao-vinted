import { useState } from 'react';
import { fmtEuro, hoje, lerNumero } from '../lib/format';
import type { Produto } from '../lib/types';
import { useDados } from '../state';
import { modeloAnuncio, textoAnuncio } from '../lib/anuncio';
import { Campo, Dinheiro, Janela, SelecionarConta } from './ui';

const CHAVE_CONTA = 'gv.ultimaConta';

/**
 * Marca rapidamente unidades como anunciadas (ou retira o anúncio).
 * Para um grupo de produtos iguais, escolhe-se quantas unidades.
 */
export function FormAnunciar({ ids, retirar, precoSugerido, aoFechar }: { ids: string[]; retirar?: boolean; precoSugerido?: number | null; aoFechar(): void }) {
  const { dados, guardar, aviso } = useDados();
  // Candidatos: os que estão no estado certo, os mais antigos primeiro
  const candidatos = ids
    .map((id) => dados.produtos.find((p) => p.id === id))
    .filter((p): p is Produto => !!p && p.estado === (retirar ? 'anunciado' : 'por_anunciar'))
    .sort((a, b) => (a.data_compra ?? '').localeCompare(b.data_compra ?? ''));
  const nome = candidatos[0]?.nome ?? 'Produto';

  const [conta, setConta] = useState(() => {
    try {
      const c = localStorage.getItem(CHAVE_CONTA);
      if (c && dados.contas.some((x) => x.id === c && x.ativa)) return c;
    } catch {
      /* ignorar */
    }
    return dados.contas.find((c) => c.ativa)?.id ?? '';
  });
  const [qtd, setQtd] = useState(String(candidatos.length));
  const [preco, setPreco] = useState(precoSugerido ? String(precoSugerido).replace('.', ',') : '');
  const [aGuardar, setAGuardar] = useState(false);

  async function submeter() {
    const n = Math.min(Math.max(Math.round(lerNumero(qtd)) || 1, 1), candidatos.length);
    if (!retirar && !conta) return aviso('Escolhe a conta da Vinted.', 'erro');
    const escolhidos = candidatos.slice(0, n);
    const alterados = escolhidos.map((p) =>
      retirar
        ? { ...p, estado: 'por_anunciar' as const, data_anuncio: null }
        : { ...p, estado: 'anunciado' as const, conta_id: conta, data_anuncio: hoje(), preco_anuncio: preco ? lerNumero(preco) : p.preco_anuncio },
    );
    setAGuardar(true);
    try {
      await guardar('produtos', alterados);
      try {
        if (!retirar) localStorage.setItem(CHAVE_CONTA, conta);
      } catch {
        /* ignorar */
      }
      aviso(retirar ? `Anúncio retirado (${n}).` : `${n} unidade(s) marcada(s) como anunciada(s).`);
      aoFechar();
    } catch (e) {
      aviso(`Erro: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAGuardar(false);
    }
  }

  if (!candidatos.length) {
    return (
      <Janela titulo={retirar ? 'Retirar anúncio' : 'Anunciar'} aoFechar={aoFechar}>
        <p>{retirar ? 'Não há unidades anunciadas.' : 'Não há unidades por anunciar.'}</p>
      </Janela>
    );
  }

  return (
    <Janela
      titulo={retirar ? `Retirar anúncio: ${nome}` : `Anunciar: ${nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={submeter} disabled={aGuardar}>
            {retirar ? 'Retirar' : 'Marcar como anunciado'}
          </button>
        </>
      }
    >
      <div className="grelha-form">
        {!retirar && (
          <Campo rotulo="Conta da Vinted">
            <SelecionarConta valor={conta} mudar={setConta} />
          </Campo>
        )}
        {candidatos.length > 1 && (
          <Campo rotulo="Quantas unidades" ajuda={`de ${candidatos.length} ${retirar ? 'anunciadas' : 'por anunciar'}`}>
            <input inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        )}
        {!retirar && (
          <Campo rotulo="Preço do anúncio" ajuda={precoSugerido ? 'Sugerido pela app' : candidatos[0].preco_anuncio ? `Atual: ${fmtEuro(candidatos[0].preco_anuncio)}` : 'Opcional'}>
            <Dinheiro valor={preco} mudar={setPreco} placeholder="" />
          </Campo>
        )}
      </div>
      {!retirar && <TextoVinted produto={candidatos[0]} />}
    </Janela>
  );
}

/** Título e descrição prontos a copiar para a Vinted. */
function TextoVinted({ produto }: { produto: Produto }) {
  const { dados, aviso } = useDados();
  const t = textoAnuncio(produto, modeloAnuncio(dados.definicoes));
  async function copiar(texto: string, o: string) {
    try {
      await navigator.clipboard.writeText(texto);
      aviso(`${o} copiado.`);
    } catch {
      aviso('Não foi possível copiar. Seleciona o texto e copia à mão.', 'erro');
    }
  }
  return (
    <div className="texto-vinted">
      <h4>Texto para a Vinted</h4>
      <div className="texto-vinted-bloco">
        <div className="texto-vinted-topo">
          <span className="campo-rotulo">Título</span>
          <button type="button" className="btn btn-pequeno" onClick={() => copiar(t.titulo, 'Título')}>Copiar</button>
        </div>
        <p className="texto-vinted-titulo">{t.titulo}</p>
      </div>
      <div className="texto-vinted-bloco">
        <div className="texto-vinted-topo">
          <span className="campo-rotulo">Descrição</span>
          <button type="button" className="btn btn-pequeno" onClick={() => copiar(t.descricao, 'Descrição')}>Copiar</button>
        </div>
        <p className="texto-vinted-descricao">{t.descricao}</p>
      </div>
      <p className="mudo pequeno">O texto muda-se em Definições → Texto dos anúncios.</p>
    </div>
  );
}
