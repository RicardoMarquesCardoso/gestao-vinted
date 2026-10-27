"""Dados de mercado dos sets LEGO, para as análises de investimento.

Gera public/mercado-sets.json (e docs/mercado-sets.json) com:
  brickset:  {"75192": [lançamento, retirada, pvp_DE, pvp_UK, disponibilidade], ...}
             para todos os sets desde 2005 (datas AAAA-MM-DD ou null).
  bricklink: {"75192": {"n": [média, n.º vendas], "u": [média, n.º vendas]}, ...}
             preços de venda dos últimos 6 meses na Europa, em EUR (sem IVA),
             só para os sets que temos ou já vendemos.

Cada fonte só corre se os segredos respetivos existirem; se faltarem, mantém os dados anteriores.
Segredos (GitHub → Settings → Secrets and variables → Actions):
  BRICKSET_API_KEY
  BRICKLINK_CONSUMER_KEY, BRICKLINK_CONSUMER_SECRET, BRICKLINK_TOKEN, BRICKLINK_TOKEN_SECRET
  VINTEDUO_TOKEN  (para ler a lista dos nossos n.º de set)
"""
import base64, datetime, hashlib, hmac, json, os, re, secrets, sys, time, urllib.parse, urllib.request

# URL e chave pública (publishable) do Supabase, lidas do código da app
_config = open(os.path.join(os.path.dirname(__file__), '..', 'src', 'config.ts'), encoding='utf-8').read()
SUPABASE_URL = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", _config).group(1)
SUPABASE_KEY = re.search(r"'(sb_publishable_[^']+)'", _config).group(1)
DESTINOS = sys.argv[1:] or ['public/mercado-sets.json', 'docs/mercado-sets.json']
HOJE = datetime.date.today()


def pedir(url, data=None, headers=None, tentativas=3):
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, data=data, headers=headers or {})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            if i == tentativas - 1:
                raise
            print(f'  erro ({e}), a tentar de novo…')
            time.sleep(3 * (i + 1))


def data(s):
    return s[:10] if s else None


# ---------------------------------------------------------------- Brickset

def brickset(chave):
    sets = {}
    for ano in range(2005, HOJE.year + 2):
        pagina = 1
        while True:
            params = json.dumps({'year': str(ano), 'pageSize': 500, 'pageNumber': pagina})
            corpo = urllib.parse.urlencode({'apiKey': chave, 'userHash': '', 'params': params}).encode()
            r = pedir('https://brickset.com/api/v3.asmx/getSets', data=corpo,
                      headers={'Content-Type': 'application/x-www-form-urlencoded'})
            if r.get('status') != 'success':
                raise RuntimeError(f"Brickset: {r.get('message')}")
            lista = r.get('sets') or []
            for s in lista:
                numero = str(s.get('number') or '').strip()
                variante = s.get('numberVariant') or 1
                if not numero or (numero in sets and sets[numero][0] <= variante):
                    continue
                lego = s.get('LEGOCom') or {}
                de, uk = lego.get('DE') or {}, lego.get('UK') or {}
                lancamento = data(s.get('launchDate')) or data(de.get('dateFirstAvailable')) or data(uk.get('dateFirstAvailable'))
                retirada = data(s.get('exitDate')) or data(de.get('dateLastAvailable')) or data(uk.get('dateLastAvailable'))
                sets[numero] = (variante, [lancamento, retirada, de.get('retailPrice'), uk.get('retailPrice'), s.get('availability')])
            print(f'Brickset {ano} p.{pagina}: {len(lista)} sets')
            if len(lista) < 500:
                break
            pagina += 1
    return {k: v[1] for k, v in sorted(sets.items())}


# ---------------------------------------------------------------- BrickLink (OAuth 1.0a)

def assinar_bricklink(metodo, url, query, ck, cs, tk, ts):
    oauth = {
        'oauth_consumer_key': ck, 'oauth_token': tk, 'oauth_signature_method': 'HMAC-SHA1',
        'oauth_timestamp': str(int(time.time())), 'oauth_nonce': secrets.token_hex(12), 'oauth_version': '1.0',
    }
    q = lambda x: urllib.parse.quote(str(x), safe='~')  # noqa: E731
    todos = sorted((q(k), q(v)) for k, v in {**query, **oauth}.items())
    base = '&'.join([metodo, q(url), q('&'.join(f'{k}={v}' for k, v in todos))])
    chave = f'{q(cs)}&{q(ts)}'.encode()
    oauth['oauth_signature'] = base64.b64encode(hmac.new(chave, base.encode(), hashlib.sha1).digest()).decode()
    return 'OAuth ' + ', '.join(f'{q(k)}="{q(v)}"' for k, v in oauth.items())


def nossos_sets(token):
    url = f'{SUPABASE_URL}/rest/v1/rpc/sets_mercado'
    r = pedir(url, data=json.dumps({'token': token}).encode(), headers={
        'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'})
    return sorted({str(x).strip() for x in r if str(x).strip()})


def bricklink(sets, ck, cs, tk, ts):
    res = {}
    for n in sets:
        numero = n if '-' in n else f'{n}-1'
        url = f'https://api.bricklink.com/api/store/v1/items/SET/{urllib.parse.quote(numero)}/price'
        linha = {}
        for estado in ('N', 'U'):
            query = {'guide_type': 'sold', 'new_or_used': estado, 'region': 'europe', 'currency_code': 'EUR'}
            cab = {'Authorization': assinar_bricklink('GET', url, query, ck, cs, tk, ts)}
            try:
                r = pedir(f'{url}?{urllib.parse.urlencode(query)}', headers=cab, tentativas=2)
            except Exception as e:  # noqa: BLE001
                print(f'  BrickLink {numero} {estado}: {e}')
                continue
            if (r.get('meta') or {}).get('code') != 200:
                print(f"  BrickLink {numero} {estado}: {(r.get('meta') or {}).get('description')}")
                continue
            d = r.get('data') or {}
            media = float(d.get('qty_avg_price') or d.get('avg_price') or 0)
            if media > 0:
                linha[estado.lower()] = [round(media, 2), int(d.get('total_quantity') or 0)]
            time.sleep(0.3)
        if linha:
            res[n] = linha
    print(f'BrickLink: {len(res)} de {len(sets)} sets com vendas')
    return res


# ---------------------------------------------------------------- principal

anterior = {}
try:
    with open(DESTINOS[0], encoding='utf-8') as f:
        anterior = json.load(f)
except FileNotFoundError:
    pass

saida = {
    'atualizado': HOJE.isoformat(),
    'brickset': anterior.get('brickset', {}),
    'bricklink': anterior.get('bricklink', {}),
    'brickset_atualizado': anterior.get('brickset_atualizado'),
    'bricklink_atualizado': anterior.get('bricklink_atualizado'),
}

if os.environ.get('BRICKSET_API_KEY'):
    saida['brickset'] = brickset(os.environ['BRICKSET_API_KEY'])
    saida['brickset_atualizado'] = HOJE.isoformat()
else:
    print('Sem BRICKSET_API_KEY: Brickset não atualizado.')

bl = [os.environ.get(k) for k in ('BRICKLINK_CONSUMER_KEY', 'BRICKLINK_CONSUMER_SECRET', 'BRICKLINK_TOKEN', 'BRICKLINK_TOKEN_SECRET')]
if all(bl) and os.environ.get('VINTEDUO_TOKEN'):
    saida['bricklink'] = bricklink(nossos_sets(os.environ['VINTEDUO_TOKEN']), *bl)
    saida['bricklink_atualizado'] = HOJE.isoformat()
else:
    print('Sem segredos da BrickLink: BrickLink não atualizado.')

for destino in DESTINOS:
    os.makedirs(os.path.dirname(destino) or '.', exist_ok=True)
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
print('Gravado em', ', '.join(DESTINOS))
