import { useState } from 'react';
import { custoTotalProduto } from '../lib/calc';
import { fmtData, fmtEuro, hoje, lerNumero } from '../lib/format';
import type { EstadoProduto, Produto } from '../lib/types';
import { ESTADOS_PRODUTO } from '../lib/types';
import { useDados } from '../state';
import { paraCampo, vazioANull } from './acoes';
import { Campo, Dinheiro, Foto, Janela, SelecionarConta, SelecionarPessoa, TextoSugerido, reduzirFoto, useConfirmar } from './ui';

export function FormProduto({ id, aoFechar }: { id?: string; aoFechar(): void }) {
  const { dados, guardar, apagar, lista, store, aviso } = useDados();
  const confirmar = useConfirmar();
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
    pessoa_id: existente?.pessoa_id ?? '',
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

  async function removerFoto(ref: string) {
    if (!(await confirmar({ titulo: 'Remover fotografia', texto: 'A fotografia vai ser apagada.', botao: 'Remover', perigo: true }))) return;
    setFotos((x) => x.filter((r) => r !== ref));
    store.apagarFoto(ref).catch(() => undefined);
  }

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
      pessoa_id: f.pessoa_id || null,
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
        <Campo rotulo="Nome *" largo>
          <input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} placeholder="Ex.: Carro de bombeiros" />
        </Campo>
        <Campo rotulo="Número do set">
          <input value={f.set_numero} onChange={(e) => mudar('set_numero', e.target.value)} placeholder="Ex.: 60374" inputMode="numeric" />
        </Campo>
        <Campo rotulo="Marca">
          <TextoSugerido id="l-marcas" valor={f.marca} mudar={(v) => mudar('marca', v)} sugestoes={lista('marcas')} />
        </Campo>
        <Campo rotulo="Tema">
          <TextoSugerido id="l-temas" valor={f.tema} mudar={(v) => mudar('tema', v)} sugestoes={lista('temas')} />
        </Campo>
        <Campo rotulo="Condição">
          <TextoSugerido id="l-condicoes" valor={f.condicao} mudar={(v) => mudar('condicao', v)} sugestoes={lista('condicoes')} />
        </Campo>
        <Campo rotulo="Quantidade">
          <input inputMode="numeric" value={f.quantidade} onChange={(e) => mudar('quantidade', e.target.value.replace(/\D/g, ''))} />
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
        <Campo rotulo="Descrição" largo>
          <textarea rows={2} value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} />
        </Campo>
      </div>

      <h4 className="secao-form">Custo</h4>
      {compra && (
        <p className="nota">
          Faz parte da compra de {fmtData(compra.data)}{compra.vendedor ? ` (${compra.vendedor})` : ''}. Para redistribuir os custos, edita a
          compra.
        </p>
      )}
      <div className="grelha-form">
        <Campo rotulo="Data de compra">
          <input type="date" value={f.data_compra} onChange={(e) => mudar('data_compra', e.target.value)} />
        </Campo>
        <Campo rotulo="Quem pagou">
          <SelecionarPessoa valor={f.pessoa_id} mudar={(v) => mudar('pessoa_id', v)} />
        </Campo>
        <Campo rotulo="Preço de compra (total)" ajuda="Por todas as unidades">
          <Dinheiro valor={f.preco_compra} mudar={(v) => mudar('preco_compra', v)} />
        </Campo>
        <Campo rotulo="Custos adicionais" ajuda="Portes, peças em falta…">
          <Dinheiro valor={f.custos_adicionais} mudar={(v) => mudar('custos_adicionais', v)} />
        </Campo>
      </div>

      <h4 className="secao-form">Anúncio</h4>
      <div className="grelha-form">
        <Campo rotulo="Conta da Vinted">
          <SelecionarConta valor={f.conta_id} mudar={(v) => mudar('conta_id', v)} />
        </Campo>
        <Campo rotulo="Anunciado em">
          <input type="date" value={f.data_anuncio} onChange={(e) => mudar('data_anuncio', e.target.value)} />
        </Campo>
        <Campo rotulo="Preço anunciado">
          <Dinheiro valor={f.preco_anuncio} mudar={(v) => mudar('preco_anuncio', v)} />
        </Campo>
        <Campo rotulo="Notas" largo>
          <textarea rows={2} value={f.notas} onChange={(e) => mudar('notas', e.target.value)} />
        </Campo>
      </div>

      <h4 className="secao-form">Fotografias</h4>
      <div className="fotos-edicao">
        {fotos.map((r) => (
          <div key={r} className="foto-item">
            <Foto refFoto={r} alt={f.nome} />
            <button className="btn-icone foto-remover" onClick={() => removerFoto(r)} aria-label="Remover fotografia">
              ✕
            </button>
          </div>
        ))}
        <label className="foto-adicionar">
          <input type="file" accept="image/*" multiple onChange={(e) => adicionarFotos(e.target.files)} hidden />
          {aEnviar ? 'A enviar…' : '+ Fotografia'}
        </label>
      </div>
    </Janela>
  );
}
