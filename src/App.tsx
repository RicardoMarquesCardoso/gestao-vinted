import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AcoesProvider } from './components/acoes';
import { ConfirmarProvider } from './components/ui';
import { hoje } from './lib/format';
import { dadosExemplo } from './lib/sample';
import { demoTemDados, storeDemo, storeSupabase } from './lib/store';
import type { Store, TabelaDados } from './lib/store';
import { sair, sessaoGuardada } from './lib/supabase';
import { Acertos } from './pages/Acertos';
import { Analises } from './pages/Analises';
import { Compras } from './pages/Compras';
import { Contas } from './pages/Contas';
import { Definicoes } from './pages/Definicoes';
import { Entrar } from './pages/Entrar';
import { Inventario } from './pages/Inventario';
import { Painel } from './pages/Painel';
import { Vendas } from './pages/Vendas';
import { navegar, useRota } from './router';
import { DadosProvider, useDados } from './state';

const CHAVE_MODO = 'gv.modo';
const lerModo = () => {
  try {
    return localStorage.getItem(CHAVE_MODO);
  } catch {
    return null;
  }
};
const gravarModo = (m: string | null) => {
  try {
    if (m) localStorage.setItem(CHAVE_MODO, m);
    else localStorage.removeItem(CHAVE_MODO);
  } catch {
    /* ignorar */
  }
};

export function App() {
  const [store, setStore] = useState<Store | null>(() => {
    if (lerModo() === 'demo') return storeDemo();
    const s = sessaoGuardada();
    return s ? storeSupabase(s.email) : null;
  });
  const [mensagem, setMensagem] = useState<string | null>(null);

  const terminar = useCallback(async () => {
    if (store?.modo === 'supabase') await sair();
    gravarModo(null);
    setStore(null);
    navegar('/');
  }, [store]);

  const expirou = useCallback(() => {
    setMensagem('A sessão terminou. Volta a entrar.');
    void sair();
    setStore(null);
  }, []);

  async function entrarDemo() {
    const s = storeDemo();
    if (!demoTemDados()) {
      const ex = dadosExemplo(hoje());
      for (const t of ['pessoas', 'contas', 'compras', 'produtos', 'vendas', 'acertos', 'definicoes'] as TabelaDados[]) await s.guardar(t, ex[t]);
    }
    gravarModo('demo');
    setStore(s);
  }

  if (!store) {
    return (
      <Entrar
        mensagem={mensagem}
        aoEntrar={(email) => {
          setMensagem(null);
          gravarModo('supabase');
          setStore(storeSupabase(email));
        }}
        aoDemo={entrarDemo}
      />
    );
  }

  return (
    <DadosProvider store={store} aoExpirar={expirou} key={store.modo + store.utilizador}>
      <ConfirmarProvider>
        <AcoesProvider>
          <Estrutura aoSair={terminar} />
        </AcoesProvider>
      </ConfirmarProvider>
    </DadosProvider>
  );
}

const MENU: { rota: string; nome: string; icone: ReactNode; principal?: boolean }[] = [
  { rota: '/', nome: 'Painel', principal: true, icone: <path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" /> },
  { rota: '/inventario', nome: 'Inventário', principal: true, icone: <path d="M4 7h16v13H4zM2 3h20v4H2zm7 7h6v2H9z" /> },
  { rota: '/vendas', nome: 'Vendas', principal: true, icone: <path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm1 17.9V20h-2v-1.1c-1.7-.3-3-1.4-3.1-3.1h2c.1 1 .9 1.6 2.1 1.6 1.4 0 1.9-.7 1.9-1.3 0-.8-.5-1.3-2.4-1.8-2.2-.5-3.4-1.4-3.4-3.1 0-1.4 1.1-2.5 2.9-2.9V7h2v1.3c1.6.4 2.6 1.6 2.7 3h-2c-.1-1-.7-1.6-1.9-1.6s-1.8.6-1.8 1.2c0 .6.6 1 2.4 1.5s3.4 1.2 3.4 3.3c0 1.5-1.1 2.6-2.8 3.2z" /> },
  { rota: '/acertos', nome: 'Acertos', principal: true, icone: <path d="M7 7h11l-3-3 1.4-1.4L22.8 9l-6.4 6.4L15 14l3-3H7zm10 10H6l3 3-1.4 1.4L1.2 15l6.4-6.4L9 10l-3 3h11z" /> },
  { rota: '/compras', nome: 'Compras', icone: <path d="M7 4h14l-2 9H8.2l-.4 2H19v2H5.4l1.2-6L5 3H2V1h4.6zM8 20a2 2 0 1 0 0 .01zm9 0a2 2 0 1 0 0 .01z" /> },
  { rota: '/contas', nome: 'Contas', icone: <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" /> },
  { rota: '/analises', nome: 'Análises', icone: <path d="M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z" /> },
  { rota: '/definicoes', nome: 'Definições', icone: <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.5 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" /> },
];

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

function Estrutura({ aoSair }: { aoSair(): void }) {
  const rota = useRota();
  const { store, carregando, erro, recarregar, ultimaAtualizacao } = useDados();
  const [aAtualizar, setAAtualizar] = useState(false);
  const base = '/' + (rota.split('/')[1] ?? '');

  const pagina = useMemo(() => {
    switch (base) {
      case '/inventario': return <Inventario />;
      case '/compras': return <Compras />;
      case '/vendas': return <Vendas />;
      case '/contas': return <Contas />;
      case '/acertos': return <Acertos />;
      case '/analises': return <Analises />;
      case '/definicoes': return <Definicoes aoSair={aoSair} />;
      case '/mais': return <Mais />;
      default: return <Painel />;
    }
  }, [base, aoSair]);

  async function atualizar() {
    setAAtualizar(true);
    await recarregar();
    setAAtualizar(false);
  }

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <span className="marca-tijolo" aria-hidden="true" />
          <span>Gestão Vinted</span>
        </div>
        <nav>
          {MENU.map((m) => (
            <a key={m.rota} href={`#${m.rota}`} className={base === m.rota ? 'ativo' : ''}>
              <Icone>{m.icone}</Icone>
              {m.nome}
            </a>
          ))}
        </nav>
        <div className="lateral-rodape">
          {store.modo === 'demo' && <span className="chip chip-demo">Modo demonstração</span>}
          <button className="link" onClick={atualizar} disabled={aAtualizar}>
            {aAtualizar ? 'A atualizar…' : '↻ Atualizar dados'}
          </button>
          {ultimaAtualizacao && <small className="mudo">às {ultimaAtualizacao.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</small>}
        </div>
      </aside>

      <header className="topo-movel">
        <div className="marca">
          <span className="marca-tijolo" aria-hidden="true" />
          <span>Gestão Vinted</span>
          {store.modo === 'demo' && <span className="chip chip-demo">demo</span>}
        </div>
        <button className="btn-icone" onClick={atualizar} aria-label="Atualizar dados" disabled={aAtualizar}>
          <span className={aAtualizar ? 'a-rodar' : ''}>↻</span>
        </button>
      </header>

      <main className="principal">
        {erro && (
          <div className="faixa-erro">
            <strong>Não foi possível carregar os dados.</strong> {erro}{' '}
            <button className="link" onClick={atualizar}>Tentar de novo</button>
          </div>
        )}
        {carregando ? <div className="a-carregar">A carregar…</div> : pagina}
      </main>

      <nav className="barra-movel">
        {MENU.filter((m) => m.principal).map((m) => (
          <a key={m.rota} href={`#${m.rota}`} className={base === m.rota ? 'ativo' : ''}>
            <Icone>{m.icone}</Icone>
            <span>{m.nome}</span>
          </a>
        ))}
        <a href="#/mais" className={['/mais', '/compras', '/contas', '/analises', '/definicoes'].includes(base) ? 'ativo' : ''}>
          <Icone><path d="M4 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></Icone>
          <span>Mais</span>
        </a>
      </nav>
    </div>
  );
}

function Mais() {
  return (
    <div className="pagina">
      <h1>Mais</h1>
      <nav className="menu-mais">
        {MENU.filter((m) => !m.principal).map((m) => (
          <a key={m.rota} href={`#${m.rota}`}>
            <Icone>{m.icone}</Icone>
            <span>{m.nome}</span>
            <span className="mudo">›</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
