"""Gera public/catalogo-sets.json a partir do catálogo público do Rebrickable.

Formato: {"atualizado": "AAAA-MM-DD", "sets": {"76459": ["Nome", ano, "Tema", "Subtema"], ...}}
Para cada número fica a variante -1 (ou a mais baixa disponível).
"""
import csv, datetime, gzip, io, json, sys, urllib.request

BASE = 'https://cdn.rebrickable.com/media/downloads/'


def ler(nome):
    with urllib.request.urlopen(BASE + nome, timeout=120) as r:
        return list(csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(r.read())), encoding='utf-8')))


temas = {t['id']: t for t in ler('themes.csv.gz')}


def raiz(tid):
    t = temas.get(tid)
    while t and t.get('parent_id'):
        t = temas.get(t['parent_id'])
    return t['name'] if t else None


sets = {}
for s in ler('sets.csv.gz'):
    numero, _, variante = s['set_num'].rpartition('-')
    if not numero or not variante.isdigit():
        continue
    v = int(variante)
    if numero in sets and sets[numero][0] <= v:
        continue
    tema = raiz(s['theme_id'])
    proprio = temas.get(s['theme_id'], {}).get('name')
    subtema = proprio if proprio and proprio != tema else None
    sets[numero] = (v, [s['name'], int(s['year']) if s['year'].isdigit() else None, tema, subtema])

saida = {'atualizado': datetime.date.today().isoformat(), 'sets': {k: v[1] for k, v in sorted(sets.items())}}
for destino in sys.argv[1:] or ['public/catalogo-sets.json']:
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
print(len(saida['sets']), 'sets')
