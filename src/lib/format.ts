// Formatação para mostrar no ecrã, à portuguesa: 1 234,50 €, 27/10/2026, "out 26".
// Intl.NumberFormat é a forma nativa do browser de formatar números conforme o país.

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const numero = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });

export const fmtEuro = (n: number | null | undefined) => euro.format(n ?? 0);
export const fmtNum = (n: number) => numero.format(n);

/** '2026-10-27' → '27/10/2026' */
export function fmtData(d: string | null | undefined): string {
  if (!d) return '—';
  const [a, m, dia] = d.slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
}

export function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function fmtMes(chave: string): string {
  const [a, m] = chave.split('-');
  return `${MESES[Number(m) - 1]} ${a.slice(2)}`;
}

/** '2024-12-31' → 'dez 2024' (mês e ano por extenso, para datas de lançamento/retirada dos sets). */
export function fmtMesAno(d: string | null | undefined): string {
  if (!d) return '—';
  const [a, m] = d.split('-');
  return `${MESES[Number(m) - 1]} ${a}`;
}

/** Data local de hoje no formato AAAA-MM-DD. */
export function hoje(): string {
  return dataLocal(new Date());
}

export function dataLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Converte texto escrito pelo utilizador ("12,50" ou "12.5") em número. */
export function lerNumero(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  const n = Number(String(s).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function plural(n: number, um: string, varios: string) {
  return `${fmtNum(n)} ${n === 1 ? um : varios}`;
}
