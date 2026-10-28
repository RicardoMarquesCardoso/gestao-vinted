// Formulário de edição de um produto já registado (nome, set, categoria, condição,
// quantidade, custos, estado, conta, fotografias). Os produtos novos entram por "Registar compra".

import { useState } from 'react';
import { custoTotalProduto } from '../lib/calc';
import { fmtData, fmtEuro, hoje, lerNumero } from '../lib/format';
import type { EstadoProduto, Produto } from '../lib/types';
import { ESTADOS_PRODUTO } from '../lib/types';
import { useDados } from '../state';
import { paraCampo, vazioANull } from './acoes';
import { Campo, Dinheiro, Foto, Janela, SelecionarConta, SelecionarPagador, TextoSugerido, lerPagador, reduzirFoto, useConfirmar, valorPagador , EscolherOuEscrever, ImagemReferencia, NomeComSugestoes, urlReferencia, IconeLixo } from './ui';
import { useCatalogo, useInfoPorSet } from './catalogo';

export function FormProduto({ id, aoFechar }: { id?: string; aoFechar(): void }) {
  const { dados, guardar, apagar, lista, store, aviso } = useDados();
  const confirmar = useConfirmar();
  const catalogo = useCatalogo();
  const infoSet = useInfoPorSet();
  const [autoNome, setAutoNome] = useState('');
  const existente = dados.produtos.find((p) => p.id === id);
  const [novoId] = useState(() => id ?? crypto.randomUUID());
  const compra = existente?.compra_id ? dados.compras.find((c) => c.id === existente.compra_id) : undefined;
  const temVendas = dados.vendas.some((v) => v.produto_id === novoId);

  const [f, setF] = useState(() => ({
    nome: existente?.nome ?? '',
    descricao: existente?.descricao ?? '',
    marca: existente?.marca ?? 'LEGO',
    tema: existente?.tema ?? '',
    set_numero: existente?.set_numero ?? '',
    condicao: existente?.condicao ?? '',
    quantidade: String(existente?.quantidade ?? 1),
    data_compra: existente?.data_compra ?? hoje(),
    preco_compra: paraCampo(existente?.preco_compra),
    custos_adicionais: paraCampo(existente?.custos_adicionais),
    pagador: existente ? valorPagador(existente) : '',
    estado: (existente?.estado ?? 'por_anunciar') as EstadoProduto,
    conta_id: existente?.conta_id ?? '',
    data_anuncio: existente?.data_anuncio ?? '',
    preco_anuncio: paraCampo(existente?.preco_anuncio),
    notas: existente?.notas ?? '',
  }));
  const [fotos, setFotos] = useState<string[]>(existente?.fotos ?? []);
  const [aEnviar, setAEnviar] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const mudar = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // Reduz cada fotografia (até 1280 px) e envia para o Storage
  async function adicionarFotos(ficheiros: FileList | null) {
    if (!ficheiros?.length) return;
    setAEnviar(true);
    try {
      for (const ficheiro of Array.from(ficheiros)) {
        const blob = await reduzirFoto(ficheiro, store.modo === 'demo' ? 640 : 1280);
        const ref = await store.enviarFoto(novoId, blob);
        setFotos((x) => [...x, ref]);
      }
    } catch (e) {
      aviso(`Não foi possível enviar a fotografia: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAEnviar(false);
    }
  }

  // Apagar uma fotografia (do produto e do Storage)
  async function removerFoto(ref: string) {
    if (!(await confirmar({ titulo: 'Remover fotografia', texto: 'A fotografia vai ser apagada.', botao: 'Remover', perigo: true }))) return;
    setFotos((x) => x.filter((r) => r !== ref));
    store.apagarFoto(ref).catch(() => undefined);
  }

  // Validar e guardar as alterações do produto
  async function submeter() {
    if (!f.nome.trim()) return aviso('Indica o nome do produto.', 'erro');
    const quantidade = Math.max(Math.round(lerNumero(f.quantidade)) || 1, 1);
    const p: Produto = {
      id: novoId,
      compra_id: existente?.compra_id ?? null,
      nome: f.nome.trim(),
      descricao: vazioANull(f.descricao),
      marca: vazioANull(f.marca),
      tema: vazioANull(f.tema),
      set_numero: vazioANull(f.set_numero),
      condicao: vazioANull(f.condicao),
      quantidade,
      data_compra: f.data_compra || null,
      preco_compra: lerNumero(f.preco_compra),
      custos_adicionais: lerNumero(f.custos_adicionais),
      ...lerPagador(f.pagador),
      estado: f.estado,
      conta_id: f.conta_id || null,
      data_anuncio: f.data_anuncio || (f.estado === 'anunciado' ? hoje() : null),
      preco_anuncio: f.preco_anuncio ? lerNumero(f.preco_anuncio) : null,
      notas: vazioANull(f.notas),
      fotos,
    };
    setAGuardar(true);
    try {
      await guardar('produtos', [p]);
      aviso(existente ? 'Produto atualizado.' : 'Produto criado.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao guardar: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAGuardar(false);
    }
  }

  // Apagar o produto (com confirmação)
  async function eliminar() {
    if (temVendas) return aviso('Este produto tem vendas registadas. Apaga primeiro as vendas, ou muda o estado para "Cancelado".', 'erro');
    const ok = await confirmar({
      titulo: 'Apagar produto',
      texto: `Vais apagar "${existente?.nome}" (custo ${fmtEuro(existente ? custoTotalProduto(existente) : 0)}). Fica registado no histórico de alterações. Continuar?`,
      botao: 'Apagar produto',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apagar('produtos', novoId);
      aviso('Produto apagado.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao apagar: ${e instanceof Error ? e.message : e}`, 'erro');
    }
  }

  return (
    <Janela
      titulo={existente ? 'Editar produto' : 'Novo produto'}
      aoFechar={aoFechar}
      larga
      rodape={
        <>
          {existente && (
            <button className="btn btn-perigo-texto" onClick={eliminar}>
              Apagar
            </button>
          )}
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={submeter} disabled={aGuardar || aEnviar}>
            {aGuardar ? 'A guardar…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="grelha-form">
        <div className="campo campo-largo">
          <span className="campo-rotulo">Nome *</span>
          <NomeComSugestoes
            valor={f.nome}
            mudar={(v) => mudar('nome', v)}
            sugestoes={catalogo.sugestoes}
            escolher={(x) => setF((a) => ({ ...a, nome: x.nome, set_numero: x.set_numero ?? '', marca: x.marca ?? '', tema: x.tema ?? '' }))}
            placeholder="Escreve para ver produtos que já existem"
          />
        </div>
        <Campo rotulo="Categoria">
          <EscolherOuEscrever valor={f.marca} mudar={(v) => mudar('marca', v)} opcoes={catalogo.marcas} placeholder="Ex.: LEGO" ariaLabel="Categoria" />
        </Campo>
        <Campo rotulo="Subcategoria">
          <EscolherOuEscrever valor={f.tema} mudar={(v) => mudar('tema', v)} opcoes={catalogo.temasDe(f.marca)} placeholder="Ex.: Star Wars" ariaLabel="Subcategoria" />
        </Campo>
        <Campo rotulo="Número do set">
          <input
            value={f.set_numero}
            onChange={(e) => {
              const v = e.target.value;
              const info = infoSet(v);
              setF((a) => {
                const automatico = !a.nome || a.nome === autoNome;
                if (info && automatico) {
                  setAutoNome(info.nome);
                  return { ...a, set_numero: v, nome: info.nome, marca: info.marca, tema: info.tema };
                }
                return { ...a, set_numero: v };
              });
            }}
            placeholder="Ex.: 60374"
            inputMode="numeric"
          />
        </Campo>
        <Campo rotulo="Preço de compra">
          <Dinheiro valor={f.preco_compra} mudar={(v) => mudar('preco_compra', v)} />
        </Campo>
        <Campo rotulo="Quem pagou">
          <SelecionarPagador valor={f.pagador} mudar={(v) => mudar('pagador', v)} />
        </Campo>
        <Campo rotulo="Estado">
          <select value={f.estado} onChange={(e) => mudar('estado', e.target.value as EstadoProduto)}>
            {ESTADOS_PRODUTO.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.nome}
              </option>
            ))}
          </select>
        </Campo>
        {f.estado === 'anunciado' && (
          <>
            <Campo rotulo="Conta da Vinted">
              <SelecionarConta valor={f.conta_id} mudar={(v) => mudar('conta_id', v)} />
            </Campo>
            <Campo rotulo="Preço anunciado">
              <Dinheiro valor={f.preco_anuncio} mudar={(v) => mudar('preco_anuncio', v)} />
            </Campo>
          </>
        )}
      </div>
      {compra && (
        <p className="nota">
          Faz parte da compra de {fmtData(compra.data)}{compra.vendedor ? ` (${compra.vendedor})` : ''}.
        </p>
      )}

      {fotos.length === 0 && urlReferencia({ marca: f.marca, set_numero: f.set_numero }) && (
        <figure className="referencia referencia-form">
          <ImagemReferencia url={urlReferencia({ marca: f.marca, set_numero: f.set_numero }, true)} alt={`Set ${f.set_numero}`} className="referencia-img" />
          <figcaption className="mudo">Imagem de referência do set (usada enquanto não houver fotografia vossa)</figcaption>
        </figure>
      )}
      <div className="fotos-edicao fotos-form">
        {fotos.map((r) => (
          <div key={r} className="foto-item">
            <Foto refFoto={r} alt={f.nome} />
            <button className="btn-icone foto-remover" onClick={() => removerFoto(r)} aria-label="Remover fotografia">
              <IconeLixo />
            </button>
          </div>
        ))}
        <label className="foto-adicionar">
          <input type="file" accept="image/*" multiple onChange={(e) => adicionarFotos(e.target.files)} hidden />
          {aEnviar ? 'A enviar…' : '📷 Fotografia'}
        </label>
      </div>

      <details className="mais-detalhes">
        <summary>Mais detalhes</summary>
        <div className="grelha-form">
          <Campo rotulo="Data de compra">
            <input type="date" value={f.data_compra} onChange={(e) => mudar('data_compra', e.target.value)} />
          </Campo>
          <Campo rotulo="Custos adicionais" ajuda="Portes, peças em falta…">
            <Dinheiro valor={f.custos_adicionais} mudar={(v) => mudar('custos_adicionais', v)} />
          </Campo>
          <Campo rotulo="Condição">
            <TextoSugerido id="l-condicoes" valor={f.condicao} mudar={(v) => mudar('condicao', v)} sugestoes={lista('condicoes')} />
          </Campo>
          <Campo rotulo="Quantidade" ajuda="Unidades neste registo">
            <input inputMode="numeric" value={f.quantidade} onChange={(e) => mudar('quantidade', e.target.value.replace(/\D/g, ''))} />
          </Campo>
          {f.estado !== 'anunciado' && (
            <Campo rotulo="Conta da Vinted">
              <SelecionarConta valor={f.conta_id} mudar={(v) => mudar('conta_id', v)} />
            </Campo>
          )}
          <Campo rotulo="Anunciado em">
            <input type="date" value={f.data_anuncio} onChange={(e) => mudar('data_anuncio', e.target.value)} />
          </Campo>
          <Campo rotulo="Notas" largo>
            <textarea rows={2} value={f.notas} onChange={(e) => mudar('notas', e.target.value)} />
          </Campo>
          <Campo rotulo="Descrição" largo>
            <textarea rows={2} value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} />
          </Campo>
        </div>
      </details>
    </Janela>
  );
}
