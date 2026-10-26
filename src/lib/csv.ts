// Exportação para CSV, pronta a abrir no Excel em português
// (separador ";", vírgula decimal e BOM para os acentos aparecerem bem).

export interface Coluna<T> {
  titulo: string;
  valor(l: T): string | number | null | undefined;
}

function celula(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function paraCsv<T>(linhas: T[], colunas: Coluna<T>[]): string {
  const topo = colunas.map((c) => celula(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(';'));
  return '﻿' + [topo, ...corpo].join('\r\n');
}

export function descarregar(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
