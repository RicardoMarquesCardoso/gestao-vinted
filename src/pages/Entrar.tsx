import { useState } from 'react';
import { entrar } from '../lib/supabase';

export function Entrar(props: { aoEntrar(email: string): void; aoDemo(): void; mensagem?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(props.mensagem ?? null);
  const [aEntrar, setAEntrar] = useState(false);

  async function submeter(e: { preventDefault(): void }) {
    e.preventDefault();
    setAEntrar(true);
    setErro(null);
    try {
      const s = await entrar(email.trim(), password);
      props.aoEntrar(s.email);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setAEntrar(false);
    }
  }

  return (
    <div className="entrar">
      <form className="entrar-caixa" onSubmit={submeter}>
        <div className="marca marca-grande">
          <span className="marca-tijolo" aria-hidden="true" />
          <span>Gestão Vinted</span>
        </div>
        <p className="mudo">Compras, vendas e lucro, sincronizados entre os dois.</p>
        <label className="campo">
          <span className="campo-rotulo">Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Palavra-passe</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="btn btn-primario btn-largo" disabled={aEntrar}>
          {aEntrar ? 'A entrar…' : 'Entrar'}
        </button>
        <div className="separador"><span>ou</span></div>
        <button type="button" className="btn btn-largo" onClick={props.aoDemo}>
          Experimentar com dados de exemplo
        </button>
        <p className="nota">O modo de demonstração guarda os dados só neste browser.</p>
      </form>
    </div>
  );
}
