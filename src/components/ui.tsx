import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { UsoLimite } from '../lib/calc';
import { fmtEuro, fmtNum } from '../lib/format';
import { ESTADOS_PRODUTO, ESTADOS_VENDA } from '../lib/types';
import type { EstadoProduto, EstadoVenda, TipoPagamento } from '../lib/types';
import { useDados } from '../state';

// ---------- Janela (modal) ----------

export function Janela(props: { titulo: string; aoFechar(): void; children: ReactNode; rodape?: ReactNode; larga?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && props.aoFechar();
    document.addEventListener('keydown', tecla);
    document.body.classList.add('sem-scroll');
    ref.current?.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.classList.remove('sem-scroll');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="janela-fundo" onMouseDown={(e) => e.target === e.currentTarget && props.aoFechar()}>
      <div className={`janela ${props.larga ? 'janela-larga' : ''}`} role="dialog" aria-modal="true" aria-label={props.titulo} ref={ref}>
        <header className="janela-topo">
          <h2>{props.titulo}</h2>
          <button className="btn-icone" onClick={props.aoFechar} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="janela-corpo">{props.children}</div>
        {props.rodape && <footer className="janela-rodape">{props.rodape}</footer>}
      </div>
    </div>
  );
}

// ---------- Confirmação ----------

interface PedidoConfirmacao {
  titulo: string;
  texto: string;
  botao?: string;
  perigo?: boolean;
  resolver(ok: boolean): void;
}

const ContextoConfirmar = createContext<(p: Omit<PedidoConfirmacao, 'resolver'>) => Promise<boolean>>(async () => false);

export function ConfirmarProvider(props: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const pedir = (p: Omit<PedidoConfirmacao, 'resolver'>) => new Promise<boolean>((resolver) => setPedido({ ...p, resolver }));
  const fechar = (ok: boolean) => {
    pedido?.resolver(ok);
    setPedido(null);
  };
  return (
    <ContextoConfirmar.Provider value={pedir}>
      {props.children}
      {pedido && (
        <Janela
          titulo={pedido.titulo}
          aoFechar={() => fechar(false)}
          rodape={
            <>
              <button className="btn" onClick={() => fechar(false)}>
                Cancelar
              </button>
              <button className={`btn ${pedido.perigo ? 'btn-perigo' : 'btn-primario'}`} onClick={() => fechar(true)}>
                {pedido.botao ?? 'Confirmar'}
              </button>
            </>
          }
        >
          <p className="confirmar-texto">{pedido.texto}</p>
        </Janela>
      )}
    </ContextoConfirmar.Provider>
  );
}

export const useConfirmar = () => useContext(ContextoConfirmar);

// ---------- Campos de formulário ----------

export function Campo(props: { rotulo: string; children: ReactNode; ajuda?: string; largo?: boolean }) {
  return (
    <label className={`campo ${props.largo ? 'campo-largo' : ''}`}>
      <span className="campo-rotulo">{props.rotulo}</span>
      {props.children}
      {props.ajuda && <span className="campo-ajuda">{props.ajuda}</span>}
    </label>
  );
}

/** Campo de texto livre com sugestões (lista de valores das Definições). */
export function TextoSugerido(props: { valor: string; mudar(v: string): void; sugestoes: string[]; id: string; placeholder?: string }) {
  return (
    <>
      <input value={props.valor} onChange={(e) => props.mudar(e.target.value)} list={props.id} placeholder={props.placeholder} />
      <datalist id={props.id}>
        {props.sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

export function Dinheiro(props: { valor: string; mudar(v: string): void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="dinheiro">
      <input
        inputMode="decimal"
        value={props.valor}
        onChange={(e) => props.mudar(e.target.value.replace(/[^\d.,-]/g, ''))}
        placeholder={props.placeholder ?? '0,00'}
        disabled={props.disabled}
      />
      <span>€</span>
    </div>
  );
}

export function SelecionarPessoa(props: { valor: string; mudar(v: string): void; vazio?: string }) {
  const { dados } = useDados();
  return (
    <select value={props.valor} onChange={(e) => props.mudar(e.target.value)}>
      <option value="">{props.vazio ?? '—'}</option>
      {dados.pessoas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  );
}

/** Valor do seletor "Quem pagou": id da pessoa, 'conjunta' ou 'dividido'. */
export const valorPagador = (x: { tipo_pagamento: TipoPagamento; pessoa_id: string | null }) =>
  x.tipo_pagamento === 'pessoa' ? x.pessoa_id ?? '' : x.tipo_pagamento;
export const lerPagador = (v: string): { tipo_pagamento: TipoPagamento; pessoa_id: string | null } =>
  v === 'conjunta' || v === 'dividido' ? { tipo_pagamento: v, pessoa_id: null } : { tipo_pagamento: 'pessoa', pessoa_id: v || null };

export function SelecionarPagador(props: { valor: string; mudar(v: string): void }) {
  const { dados } = useDados();
  return (
    <select value={props.valor} onChange={(e) => props.mudar(e.target.value)}>
      <option value="">—</option>
      {dados.pessoas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
      <option value="conjunta">Conta conjunta</option>
      {dados.pessoas.length > 1 && <option value="dividido">Dividido entre {dados.pessoas.length === 2 ? 'os dois' : 'todos'}</option>}
    </select>
  );
}

export function SelecionarConta(props: { valor: string; mudar(v: string): void; vazio?: string }) {
  const { dados } = useDados();
  return (
    <select value={props.valor} onChange={(e) => props.mudar(e.target.value)}>
      <option value="">{props.vazio ?? '—'}</option>
      {dados.contas
        .filter((c) => c.ativa || c.id === props.valor)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
    </select>
  );
}

// ---------- Etiquetas ----------

export function EtiquetaProduto({ estado }: { estado: EstadoProduto }) {
  return <span className={`etiqueta et-${estado}`}>{ESTADOS_PRODUTO.find((e) => e.valor === estado)?.nome ?? estado}</span>;
}

export function EtiquetaVenda({ estado }: { estado: EstadoVenda }) {
  return <span className={`etiqueta et-v-${estado}`}>{ESTADOS_VENDA.find((e) => e.valor === estado)?.nome ?? estado}</span>;
}

export function Valor({ n, sinal }: { n: number; sinal?: boolean }) {
  const cls = sinal ? (n > 0 ? 'positivo' : n < 0 ? 'negativo' : '') : '';
  return <span className={`valor ${cls}`}>{sinal && n > 0 ? '+' : ''}{fmtEuro(n)}</span>;
}

// ---------- Limites ----------

const NOMES_NIVEL = { ok: 'Dentro do limite', aviso: 'Perto do limite', excedido: 'Limite atingido', sem_limite: 'Sem limite' };

export function BarraLimite({ l }: { l: UsoLimite }) {
  const fmt = (n: number) => (l.dinheiro ? fmtEuro(n) : fmtNum(n));
  if (l.limite === null) {
    return (
      <div className="limite">
        <div className="limite-topo">
          <span>{l.nome}</span>
          <span className="mudo">{fmt(l.usado)} · sem limite</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`limite limite-${l.nivel}`}>
      <div className="limite-topo">
        <span>{l.nome}</span>
        <span>
          <strong>{fmt(l.usado)}</strong> / {fmt(l.limite)}
        </span>
      </div>
      <div className="limite-barra" role="meter" aria-valuemin={0} aria-valuemax={l.limite} aria-valuenow={l.usado} aria-label={l.nome}>
        <div style={{ width: `${Math.min(l.pct, 100)}%` }} />
      </div>
      <div className="limite-rodape">
        <span className={`nivel nivel-${l.nivel}`}>
          {l.nivel === 'excedido' ? '⛔' : l.nivel === 'aviso' ? '⚠️' : '✓'} {NOMES_NIVEL[l.nivel]}
        </span>
        <span className="mudo">faltam {fmt(l.restante ?? 0)}</span>
      </div>
    </div>
  );
}

// ---------- Outros ----------

export function Vazio(props: { titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <p className="vazio-titulo">{props.titulo}</p>
      {props.texto && <p className="mudo">{props.texto}</p>}
      {props.acao}
    </div>
  );
}

export function Foto({ refFoto, alt, className }: { refFoto: string; alt: string; className?: string }) {
  const { store } = useDados();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    store
      .urlFoto(refFoto)
      .then((u) => ativo && setUrl(u))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [refFoto, store]);
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <div className={`foto-vazia ${className ?? ''}`} />;
}

/** Reduz uma fotografia para no máximo 1280 px, em JPEG, antes de a guardar. */
export async function reduzirFoto(ficheiro: File, max = 1280): Promise<Blob> {
  const img = await createImageBitmap(ficheiro);
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Fotografia inválida'))), 'image/jpeg', 0.82));
}

export function Cartao(props: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`cartao ${props.className ?? ''}`}>
      {(props.titulo || props.acao) && (
        <header className="cartao-topo">
          {props.titulo && <h3>{props.titulo}</h3>}
          {props.acao}
        </header>
      )}
      {props.children}
    </section>
  );
}

// ---------- Lista pesquisável (combobox) ----------

export interface OpcaoProcura {
  id: string;
  titulo: string;
  detalhe?: string;
  imagem?: string | null;
}

/** Campo único: escreve-se para filtrar e escolhe-se da lista que aparece por baixo. */
export function ProcurarLista(props: { opcoes: OpcaoProcura[]; valor: string; mudar(id: string): void; placeholder?: string }) {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState('');
  const [ativo, setAtivo] = useState(0);
  const selecionada = props.opcoes.find((o) => o.id === props.valor);
  const t = texto.trim().toLowerCase();
  const filtradas = (t ? props.opcoes.filter((o) => `${o.titulo} ${o.detalhe ?? ''}`.toLowerCase().includes(t)) : props.opcoes).slice(0, 80);

  function escolher(o: OpcaoProcura) {
    props.mudar(o.id);
    setTexto('');
    setAberta(false);
  }

  return (
    <div className="procurar" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setAberta(false)}>
      <div className="procurar-campo">
        <input
          value={aberta ? texto : selecionada?.titulo ?? ''}
          placeholder={selecionada ? selecionada.titulo : props.placeholder ?? 'Escreve para procurar…'}
          onFocus={() => {
            setAberta(true);
            setTexto('');
            setAtivo(0);
          }}
          onClick={() => setAberta(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAtivo(0);
            setAberta(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAtivo((a) => Math.min(a + 1, filtradas.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && aberta && filtradas[ativo]) {
              e.preventDefault();
              escolher(filtradas[ativo]);
            } else if (e.key === 'Escape' && aberta) {
              e.stopPropagation();
              setAberta(false);
            }
          }}
          role="combobox"
          aria-expanded={aberta}
          aria-autocomplete="list"
        />
        <span className="procurar-seta" aria-hidden="true">▾</span>
      </div>
      {selecionada?.detalhe && !aberta && <span className="campo-ajuda">{selecionada.detalhe}</span>}
      {aberta && (
        <ul className="procurar-lista" role="listbox">
          {filtradas.length === 0 && <li className="procurar-vazio">Nenhum produto encontrado</li>}
          {filtradas.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === props.valor}>
              <button
                type="button"
                className={`procurar-opcao ${i === ativo ? 'ativa' : ''} ${o.id === props.valor ? 'escolhida' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o)}
                onMouseEnter={() => setAtivo(i)}
              >
                {o.imagem !== undefined && <ImagemReferencia url={o.imagem} className="procurar-img" />}
                <span className="procurar-texto">
                  <span className="truncar">{o.titulo}</span>
                  {o.detalhe && <small className="mudo truncar">{o.detalhe}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Imagens de referência dos sets LEGO ----------

/**
 * Imagem oficial do set, a partir do número (Brickset; se falhar, Rebrickable).
 * Não é guardada: é mostrada diretamente a partir desses sites.
 */
export function urlReferencia(p: { marca: string | null; set_numero: string | null }, grande = false): string | null {
  const set = (p.set_numero || '').trim();
  if (!/^\d{4,7}$/.test(set)) return null;
  if (p.marca && !/lego/i.test(p.marca)) return null;
  return `https://images.brickset.com/sets/${grande ? 'images' : 'small'}/${set}-1.jpg`;
}

export function ImagemReferencia({ url, className, alt = '', vazio }: { url: string | null; className?: string; alt?: string; vazio?: ReactNode }) {
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => setTentativa(0), [url]);
  if (!url || tentativa > 1) return <div className={`foto-vazia ${className ?? ''}`}>{vazio}</div>;
  const src = tentativa === 0 ? url : url.replace(/^https:\/\/images\.brickset\.com\/sets\/(images|small)\//, 'https://cdn.rebrickable.com/media/sets/');
  return <img src={src} alt={alt} className={`img-ref ${className ?? ''}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setTentativa((t) => t + 1)} />;
}
