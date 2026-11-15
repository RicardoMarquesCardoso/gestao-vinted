// Verificação de segurança antes de apagar uma pasta (usada pelo build e pelos testes).
//
// O build apaga a pasta de destino antes de a recriar. Esta função só aceita:
//   * a pasta docs/ do projeto (a que o GitHub Pages publica);
//   * uma pasta DENTRO da pasta temporária do sistema (ex.: /tmp/vinteduo-teste-xxxx),
//     nunca a própria pasta temporária.
// Qualquer outro caminho dá erro ANTES de se apagar o que quer que seja.
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';

/** Devolve o caminho absoluto se for seguro apagá-lo; senão lança um erro. */
export function destinoSeguro(pedido, raizProjeto, temporaria = tmpdir()) {
  if (!pedido || !raizProjeto) throw new Error('Destino ou raiz do projeto em falta.');
  const alvo = resolve(pedido);
  const docs = resolve(raizProjeto, 'docs');
  let tmp = resolve(temporaria);
  try {
    tmp = realpathSync(tmp); // no macOS /tmp aponta para /private/tmp
  } catch {
    /* mantém o caminho como está */
  }
  const dentroTmp = alvo.startsWith(tmp + sep) && alvo.length > tmp.length + 1;
  if (alvo === docs || dentroTmp) return alvo;
  throw new Error(`Destino recusado (o build apaga a pasta de destino): ${alvo}. Só docs/ do projeto ou uma pasta dentro de ${tmp}.`);
}
