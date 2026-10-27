"""Dados de mercado para as análises de investimento e para os planos (vender / guardar).

COMO FUNCIONA
-------------
Este script corre todas as semanas numa GitHub Action (.github/workflows/mercado.yml),
nos servidores do GitHub, e não no telemóvel. Vai buscar dados a três serviços externos e
grava tudo num único ficheiro JSON, que fica publicado com o site. A app lê esse ficheiro
como lê qualquer outro ficheiro estático.

Porque não é a app a chamar estes serviços diretamente?
  1. As chaves de acesso têm de ficar secretas, e o código da app é público (qualquer pessoa
     pode ver o JavaScript de um site). As chaves ficam nos "segredos" do GitHub.
  2. Assim a app não depende de serviços lentos ou em baixo, e não gasta pedidos a cada abertura.

O QUE GERA (public/mercado-sets.json e docs/mercado-sets.json)
--------------------------------------------------------------
  brickset:  {"75192": [lançamento, retirada, pvp_DE, pvp_UK, disponibilidade], ...}
             Todos os sets LEGO desde 2005 (datas AAAA-MM-DD ou null).
  bricklink: {"75192": {"n": [média, n.º vendidos], "u": [média, n.º vendidos]}, ...}
             Preços de venda dos últimos 6 meses na Europa, em EUR (sem IVA), novo (n) e usado (u).
             Só para os sets que temos ou já vendemos.
  pokemon:   {"30th celebration etb": {"id": ..., "nome": ..., "set": ..., "usd": 59.9, "eur": 55.1, "auto": true}, ...}
             Preço de mercado (TCGplayer, EUA) dos produtos Pokémon selados que temos em stock.
             A chave é o nosso nome do produto em minúsculas. "auto" = associação feita pela pesquisa
             por nome (pode estar errada); false = associação escolhida por nós na app.

Cada fonte só corre se os segredos respetivos existirem. Se faltarem, mantêm-se os dados anteriores.

SEGREDOS (GitHub → Settings → Secrets and variables → Actions)
---------------------------------------------------------------
  VINTEDUO_TOKEN                 código que deixa ler, no Supabase, só a lista dos nossos sets/produtos Pokémon
  BRICKSET_API_KEY               chave gratuita da Brickset
  BRICKLINK_CONSUMER_KEY, BRICKLINK_CONSUMER_SECRET, BRICKLINK_TOKEN, BRICKLINK_TOKEN_SECRET
  POKEMONPRICETRACKER_API_KEY    chave gratuita da PokemonPriceTracker (100 créditos por dia)
"""
import base64, datetime, hashlib, hmac, json, os, re, secrets, sys, time, urllib.parse, urllib.request

# O URL e a chave pública ("publishable") do Supabase são lidos do código da app (src/config.ts),
# para não estarem repetidos. Esta chave é pública por natureza: sozinha não dá acesso a nada,
# porque as tabelas estão protegidas por regras (RLS) que exigem sessão iniciada.
_config = open(os.path.join(os.path.dirname(__file__), '..', 'src', 'config.ts'), encoding='utf-8').read()
SUPABASE_URL = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", _config).group(1)
SUPABASE_KEY = re.search(r"'(sb_publishable_[^']+)'", _config).group(1)

DESTINOS = sys.argv[1:] or ['public/mercado-sets.json', 'docs/mercado-sets.json']
HOJE = datetime.date.today()


def pedir(url, data=None, headers=None, tentativas=3):
    """Faz um pedido HTTP e devolve o JSON da resposta. Tenta outra vez se falhar (rede instável)."""
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': 'VinteDuo/1.0', **(headers or {})})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            if i == tentativas - 1:
                raise
            print(f'  erro ({e}), a tentar de novo…')
            time.sleep(3 * (i + 1))


def data(s):
    """'2024-12-31T00:00:00Z' → '2024-12-31' (ou None)."""
    return s[:10] if s else None


def rpc_supabase(funcao, token):
    """Chama uma função do Supabase que só responde com o código certo (VINTEDUO_TOKEN).

    Estas funções (sets_mercado e pokemon_mercado) devolvem apenas números de set e nomes de
    produtos, nunca preços, pessoas ou vendas. Estão definidas em supabase/schema.sql.
    """
    return pedir(f'{SUPABASE_URL}/rest/v1/rpc/{funcao}', data=json.dumps({'token': token}).encode(), headers={
        'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'})


# ============================================================================ Brickset
# A Brickset é uma base de dados de sets LEGO feita por fãs. Interessa-nos sobretudo a data em que
# cada set saiu de produção ("exitDate"), porque é a partir daí que o preço costuma subir.

def brickset(chave):
    sets = {}
    for ano in range(2005, HOJE.year + 2):
        pagina = 1
        while True:  # cada pedido devolve no máximo 500 sets; um ano pode ter mais
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
                # Fica a variante mais baixa (normalmente "-1", o set principal)
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


# ============================================================================ BrickLink
# A BrickLink é o maior mercado de LEGO. O "price guide" diz por quanto cada set foi
# vendido nos últimos 6 meses. A API usa OAuth 1.0a: cada pedido leva uma assinatura
# calculada com as chaves secretas, para a BrickLink saber que somos nós.

def assinar_bricklink(metodo, url, query, ck, cs, tk, ts):
    """Gera o cabeçalho 'Authorization' do OAuth 1.0a (assinatura HMAC-SHA1)."""
    oauth = {
        'oauth_consumer_key': ck, 'oauth_token': tk, 'oauth_signature_method': 'HMAC-SHA1',
        'oauth_timestamp': str(int(time.time())), 'oauth_nonce': secrets.token_hex(12), 'oauth_version': '1.0',
    }
    q = lambda x: urllib.parse.quote(str(x), safe='~')  # noqa: E731  (codificação exigida pelo OAuth)
    todos = sorted((q(k), q(v)) for k, v in {**query, **oauth}.items())
    base = '&'.join([metodo, q(url), q('&'.join(f'{k}={v}' for k, v in todos))])
    chave = f'{q(cs)}&{q(ts)}'.encode()
    oauth['oauth_signature'] = base64.b64encode(hmac.new(chave, base.encode(), hashlib.sha1).digest()).decode()
    return 'OAuth ' + ', '.join(f'{q(k)}="{q(v)}"' for k, v in oauth.items())


def bricklink(sets, ck, cs, tk, ts):
    res = {}
    for n in sets:
        numero = n if '-' in n else f'{n}-1'
        url = f'https://api.bricklink.com/api/store/v1/items/SET/{urllib.parse.quote(numero)}/price'
        linha = {}
        for estado in ('N', 'U'):  # N = novo, U = usado
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
            # qty_avg_price = média pesada pela quantidade (mais fiável quando alguém vende vários)
            media = float(d.get('qty_avg_price') or d.get('avg_price') or 0)
            if media > 0:
                linha[estado.lower()] = [round(media, 2), int(d.get('total_quantity') or 0)]
            time.sleep(0.3)  # não sobrecarregar a API
        if linha:
            res[n] = linha
    print(f'BrickLink: {len(res)} de {len(sets)} sets com vendas')
    return res


# ============================================================================ Pokémon (PokemonPriceTracker)
# Não há API pública do Cardmarket (não aceitam novos pedidos). A PokemonPriceTracker tem um
# plano grátis com preços do TCGplayer (mercado dos EUA, em dólares) para produtos selados.
# Não é o mercado europeu, mas serve de referência e para ver a tendência.

PPT = 'https://www.pokemonpricetracker.com/api/v2/sealed-products'


def taxa_usd_eur():
    """Câmbio do dia (Banco Central Europeu, via frankfurter.app). Sem rede, usa um valor aproximado."""
    try:
        return float(pedir('https://api.frankfurter.app/latest?from=USD&to=EUR', tentativas=2)['rates']['EUR'])
    except Exception:  # noqa: BLE001
        return 0.92


def _lista(r):
    """A resposta pode vir como {"data": [...]}, {"data": {...}} ou diretamente uma lista."""
    d = r.get('data', r) if isinstance(r, dict) else r
    return d if isinstance(d, list) else [d] if isinstance(d, dict) else []


def _preco(item):
    """Procura o preço de mercado em vários nomes possíveis (a API não documenta bem a resposta)."""
    for k in ('marketPrice', 'unopenedPrice', 'price', 'lowPrice'):
        if isinstance(item.get(k), (int, float)) and item[k] > 0:
            return float(item[k])
    p = item.get('prices') or {}
    for k in ('market', 'marketPrice', 'low'):
        if isinstance(p.get(k), (int, float)) and p[k] > 0:
            return float(p[k])
    return None


def _expandir(nome):
    """As nossas abreviaturas → nomes oficiais, para a pesquisa encontrar o produto certo."""
    nome = re.sub(r'(\d+)\s+(th|st|nd|rd)\b', r'\1\2', nome, flags=re.I)  # "30 th" → "30th"
    for curto, longo in ((r'\betb\b', 'Elite Trainer Box'), (r'\bbb\b', 'Booster Box'), (r'\bupc\b', 'Ultra Premium Collection')):
        nome = re.sub(curto, longo, nome, flags=re.I)
    # O idioma não faz parte do nome no TCGplayer (que só tem produtos em inglês)
    return re.sub(r'\b(espanol|español|spanish|portugues|português|en|es|pt)\b', ' ', nome, flags=re.I).strip()


# Palavras que aparecem em muitos produtos e por isso não identificam nenhum
GENERICAS = {'elite', 'trainer', 'box', 'booster', 'collection', 'premium', 'pack', 'blister', 'ex', 'pokemon',
             'the', 'of', 'card', 'cards', 'promo', 'tin', 'bundle', 'figure', 'figurine', 'sticker', 'tech', '1'}


def _palavras(s):
    return {w for w in re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).split() if len(w) > 1 or w.isdigit()}


def _resumo(item, taxa):
    """Os campos que guardamos de um produto encontrado."""
    usd = _preco(item)
    return {
        'id': str(item.get('tcgPlayerId') or item.get('id') or ''),
        'nome': item.get('name'),
        'set': item.get('setName') or ((item.get('set') or {}).get('name') if isinstance(item.get('set'), dict) else item.get('set')),
        'usd': round(usd, 2) if usd else None,
        'eur': round(usd * taxa, 2) if usd else None,
    }


def pokemon(produtos, chave):
    """Preço de cada produto Pokémon.

    - Com associação manual (id_manual): pede esse produto e o preço é fiável.
    - Sem associação: pesquisa pelo nome. Só aceita o resultado se for inequívoco — todas as
      palavras "distintivas" do nosso nome (não genéricas como "box" ou "elite") aparecem nele
      e nenhum outro resultado empata. Caso contrário guarda até 5 "candidatos", e a app
      pergunta qual é o certo (fica em definicoes.pokemon_ids e entra na atualização seguinte).
    """
    taxa = taxa_usd_eur()
    cab = {'Authorization': f'Bearer {chave}'}
    procurar = lambda q: _lista(pedir(f"{PPT}?{urllib.parse.urlencode({'search': q, 'limit': 5})}", headers=cab, tentativas=2))  # noqa: E731
    res, mostrou = {}, False
    for p in produtos:
        try:
            if p.get('id_manual'):
                itens = _lista(pedir(f"{PPT}?{urllib.parse.urlencode({'tcgPlayerId': p['id_manual']})}", headers=cab, tentativas=2))
                item = next((i for i in itens if _preco(i)), None)
                if item:
                    res[p['chave']] = {**_resumo(item, taxa), 'auto': False}
                    print(f"  {p['nome']} → {item.get('name')} (associado)")
                continue
            nome = _expandir(p['nome'])
            distintivas = _palavras(nome) - GENERICAS
            itens = procurar(nome)
            if not itens and distintivas:  # pesquisa mais larga, só com as palavras que identificam
                time.sleep(1.1)
                itens = procurar(' '.join(sorted(distintivas)))
        except Exception as e:  # noqa: BLE001
            print(f"  Pokémon '{p['nome']}': {e}")
            continue
        finally:
            time.sleep(1.1)  # o plano grátis permite 60 pedidos por minuto
        if itens and not mostrou:  # ajuda a perceber o formato da resposta nos registos da Action
            print('  Campos da resposta:', sorted(itens[0].keys()))
            mostrou = True
        itens = [i for i in itens if _preco(i)]
        if not itens:
            print(f"  Pokémon '{p['nome']}': sem resultado")
            continue
        pontos = lambda i: len(_palavras(_expandir(nome)) & _palavras(i.get('name')))  # noqa: E731
        itens.sort(key=lambda i: -pontos(i))
        topo = itens[0]
        inequivoco = (
            distintivas and distintivas <= _palavras(topo.get('name'))
            and (len(itens) == 1 or pontos(itens[1]) < pontos(topo))
        )
        if inequivoco:
            res[p['chave']] = {**_resumo(topo, taxa), 'auto': True}
            print(f"  {p['nome']} → {topo.get('name')}")
        else:
            res[p['chave']] = {'auto': True, 'candidatos': [_resumo(i, taxa) for i in itens[:5]]}
            print(f"  {p['nome']}: {len(itens[:5])} candidatos, falta escolher")
    print(f'Pokémon: {sum(1 for r in res.values() if r.get("usd"))} de {len(produtos)} com preço (1 $ = {taxa:.3f} €)')
    return res


# ============================================================================ principal

anterior = {}
try:
    with open(DESTINOS[0], encoding='utf-8') as f:
        anterior = json.load(f)
except FileNotFoundError:
    pass

saida = {k: anterior.get(k) for k in ('brickset_atualizado', 'bricklink_atualizado', 'pokemon_atualizado')}
saida.update({
    'atualizado': HOJE.isoformat(),
    'brickset': anterior.get('brickset', {}),
    'bricklink': anterior.get('bricklink', {}),
    'pokemon': anterior.get('pokemon', {}),
})
token = os.environ.get('VINTEDUO_TOKEN')

if os.environ.get('BRICKSET_API_KEY'):
    saida['brickset'] = brickset(os.environ['BRICKSET_API_KEY'])
    saida['brickset_atualizado'] = HOJE.isoformat()
else:
    print('Sem BRICKSET_API_KEY: Brickset não atualizado.')

bl = [os.environ.get(k) for k in ('BRICKLINK_CONSUMER_KEY', 'BRICKLINK_CONSUMER_SECRET', 'BRICKLINK_TOKEN', 'BRICKLINK_TOKEN_SECRET')]
if all(bl) and token:
    nossos = sorted({str(x).strip() for x in rpc_supabase('sets_mercado', token) if str(x).strip()})
    saida['bricklink'] = bricklink(nossos, *bl)
    saida['bricklink_atualizado'] = HOJE.isoformat()
else:
    print('Sem segredos da BrickLink: BrickLink não atualizado.')

if os.environ.get('POKEMONPRICETRACKER_API_KEY') and token:
    saida['pokemon'] = pokemon(rpc_supabase('pokemon_mercado', token) or [], os.environ['POKEMONPRICETRACKER_API_KEY'])
    saida['pokemon_atualizado'] = HOJE.isoformat()
else:
    print('Sem POKEMONPRICETRACKER_API_KEY: Pokémon não atualizado.')

for destino in DESTINOS:
    os.makedirs(os.path.dirname(destino) or '.', exist_ok=True)
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
print('Gravado em', ', '.join(DESTINOS))
