// Testes da verificação de segurança do build (scripts/destino.mjs): o build apaga a pasta de
// destino, por isso só pode aceitar docs/ do projeto ou uma pasta dentro da pasta temporária.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { destinoSeguro } from '../scripts/destino.mjs';

const raiz = '/projeto/gestao-vinted';
const tmp = realpathSync(tmpdir());

test('aceita docs/ do projeto', () => {
  assert.equal(destinoSeguro(join(raiz, 'docs'), raiz), resolve(raiz, 'docs'));
  assert.equal(destinoSeguro(join(raiz, 'src', '..', 'docs'), raiz), resolve(raiz, 'docs'));
});

test('aceita uma pasta dentro da pasta temporária', () => {
  const p = join(tmp, 'vinteduo-teste-abc');
  assert.equal(destinoSeguro(p, raiz), p);
});

test('recusa a própria pasta temporária, a raiz do projeto e outros caminhos', () => {
  for (const mau of [tmp, tmp + '/', raiz, '/', '/home', join(raiz, 'src'), join(raiz, 'docs', 'assets'), join(tmp, '..', 'etc'), `${tmp}-outra/x`]) {
    assert.throws(() => destinoSeguro(mau, raiz), /Destino recusado/, mau);
  }
});

test('recusa pedidos vazios', () => {
  assert.throws(() => destinoSeguro('', raiz));
  assert.throws(() => destinoSeguro(join(tmp, 'x'), ''));
});
