#!/usr/bin/env python3
"""Build data/game.json for Gil Ledger from the public FFXIV datamining CSVs.

Runs nightly in GitHub Actions (see .github/workflows/update-data.yml) so new patches
show up on their own. Only uses the Python standard library.

Source: https://github.com/xivapi/ffxiv-datamining (csv/en)
"""
import csv, collections, io, json, os, sys, urllib.request

BASE = 'https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en/'
CACHE = os.environ.get('CSV_CACHE', os.path.join(os.path.dirname(__file__), '.csv-cache'))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'data', 'game.json')
os.makedirs(CACHE, exist_ok=True)


def fetch(name):
    path = os.path.join(CACHE, name + '.csv')
    if not os.path.exists(path):
        with urllib.request.urlopen(BASE + name + '.csv', timeout=120) as r:
            open(path, 'wb').write(r.read())
    return path


def rows(name):
    with open(fetch(name), newline='', encoding='utf-8') as fh:
        r = csv.reader(fh)
        head = next(r)
        for row in r:
            if row and row[0].replace('.', '', 1).lstrip('-').isdigit():
                yield dict(zip(head, row))


def I(v):
    try:
        return int(float(v)) if v not in ('', None) else 0
    except ValueError:
        return 0


items = {I(d['#']): d for d in rows('Item')}
mkt = lambda i: i in items and I(items[i]['ItemSearchCategory']) > 0 and items[i]['IsUntradable'] != 'True'
terr = {I(d['#']): d for d in rows('TerritoryType')}
place = {I(d['#']): d['Name'] for d in rows('PlaceName')}
cjc = {I(d['#']): d for d in rows('ClassJobCategory')}
used = set()
JOBS = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL']
DOHL = JOBS + ['MIN', 'BTN', 'FSH']
COMBAT = ['GLA', 'PGL', 'MRD', 'LNC', 'ARC', 'CNJ', 'THM', 'PLD', 'MNK', 'WAR', 'DRG', 'BRD', 'WHM', 'BLM', 'ACN', 'SMN', 'SCH',
          'ROG', 'NIN', 'MCH', 'DRK', 'AST', 'SAM', 'RDM', 'GNB', 'DNC', 'RPR', 'SGE', 'VPR', 'PCT']


def bucket(level):
    return 0 if level <= 50 else 1 if level <= 60 else 2 if level <= 70 else 3 if level <= 80 else 4 if level <= 90 else 5


# ---------------- recipes ----------------
def gear_group(it):
    """0 = not equipment, 1 = crafter/gatherer gear, 2 = combat gear."""
    if I(it['EquipSlotCategory']) <= 0:
        return 0
    c = cjc.get(I(it['ClassJobCategory']))
    if not c:
        return 2
    craft = any(c.get(k) == 'True' for k in DOHL)
    combat = any(c.get(k) == 'True' for k in COMBAT)
    if craft and combat:
        return 1 if (' of Crafting' in it['Name'] or ' of Gathering' in it['Name']) else 2
    return 1 if craft else 2


rlt = {I(d['#']): d for d in rows('RecipeLevelTable')}
uic = {I(d['#']): d['Name'] for d in rows('ItemUICategory')}
recipes, cats = [], set()
for d in rows('Recipe'):
    ct, res = I(d['CraftType']), I(d['ItemResult'])
    if ct < 0 or ct > 7 or res <= 0 or d['IsExpert'] == 'True' or res not in items:
        continue
    lt = rlt.get(I(d['RecipeLevelTable']))
    if not lt:
        continue
    lvl, stars = I(lt['ClassJobLevel']), I(lt['Stars'])
    if lvl < 1 or lvl > 100:
        continue
    ing = []
    for k in range(8):
        iid, amt = I(d[f'Ingredient[{k}]']), I(d[f'AmountIngredient[{k}]'])
        if iid > 0 and amt > 0:
            ing.append([iid, amt]); used.add(iid)
    if not ing:
        continue
    it = items[res]
    used.add(res); cat = I(it['ItemUICategory']); cats.add(cat)
    # [rid, job, level, stars, result, amount, canHq, book, specialist, uiCategory, ingredients, gearGroup, sellable,
    #  reqCraftsmanship, reqControl, suggestedCraftsmanship, questLocked, patch, rlvl, durability, progress, quality]
    recipes.append([I(d['#']), ct, lvl, stars, res, I(d['AmountResult']), 1 if it['CanBeHq'] == 'True' else 0,
                    I(d['SecretRecipeBook']), 1 if d['IsSpecializationRequired'] == 'True' else 0, cat, ing, gear_group(it),
                    1 if mkt(res) else 0, I(d['RequiredCraftsmanship']), I(d['RequiredControl']), I(lt['SuggestedCraftsmanship']),
                    1 if I(d['Quest']) > 0 else 0, I(d['PatchNumber']),
                    # crafting-simulator inputs: recipe level table row, durability, progress, quality
                    I(d['RecipeLevelTable']), I(lt['Durability']) * I(d['DurabilityFactor']) // 100,
                    I(lt['Difficulty']) * I(d['DifficultyFactor']) // 100, I(lt['Quality']) * I(d['QualityFactor']) // 100])
rlt_out = {str(k): [I(v['ProgressDivider']), I(v['QualityDivider']), I(v['ProgressModifier']), I(v['QualityModifier']), I(v['ConditionsFlag'])] for k, v in rlt.items() if any(True for _ in [0])}
books = {I(d['#']): d['Name'] for d in rows('SecretRecipeBook') if d['Name']}
books = {b: n for b, n in books.items() if any(r[7] == b for r in recipes)}

# ---------------- gathering ----------------
glc = {I(d['#']): I(d['GatheringItemLevel']) for d in rows('GatheringItemLevelConvertTable')}
gi = {I(d['#']): d for d in rows('GatheringItem')}
gpb = {I(d['#']): d for d in rows('GatheringPointBase')}
pop = {I(d['#']): d for d in rows('GatheringRarePopTimeTable')}
trans = {I(d['#']): d for d in rows('GatheringPointTransient')}
points = list(rows('GatheringPoint'))
point_ids = {I(p['#']) for p in points}
level_terr = {}
for d in rows('Level'):
    o = I(d['Object'])
    if o in point_ids and o not in level_terr:
        level_terr[o] = I(d['Territory'])
BAD_ZONES = {'The Diadem', 'Unnamed Island'}
hm = lambda v: (v // 100) * 60 + v % 100


def blank():
    return {'j': 0, 'l': 999, 'x': 0, 'z': [], 't': set(), 'n': 0, 'ok': False, 'folk': False, 'quest': False}


G = collections.defaultdict(blank)


def add_gather(it, job, lvl, tid, timed, folk, quest):
    t = terr.get(tid)
    zone = place.get(I(t['PlaceName']), '').replace('*', '') if t and tid > 1 else ''
    if zone in BAD_ZONES:
        return
    g = G[it]
    usable = not folk and not quest
    if usable:
        if not g['ok']:
            g.update({'j': 0, 'l': 999, 'x': 0, 'z': [], 't': set(), 'n': 0})
        g['ok'] = True
    elif g['ok']:
        return
    else:
        g['folk'] |= folk; g['quest'] |= quest
    g['j'] |= job; g['l'] = min(g['l'], lvl)
    if t and tid > 1:
        g['x'] |= 1 << I(t['ExVersion'])
        if zone and zone not in g['z']:
            g['z'].append(zone)
    if timed:
        g['t'].update(timed)
    else:
        g['n'] = 1


for p in points:
    base = gpb.get(I(p['GatheringPointBase']))
    if not base:
        continue
    job = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4}.get(I(base['GatheringType']), 0)
    if not job:
        continue
    tid = I(p['TerritoryType'])
    if tid <= 1:
        tid = level_terr.get(I(p['#']), tid)
    folk = I(p['GatheringSubCategory']) > 0
    timed = set()
    tr = trans.get(I(p['#']))
    if tr:
        pp = pop.get(I(tr['GatheringRarePopTimeTable']))
        if pp and I(tr['GatheringRarePopTimeTable']) > 0:
            for k in range(3):
                s, du = I(pp[f'StartTime[{k}]']), I(pp[f'Duration[{k}]'])
                if s != 65535 and du > 0:
                    timed.add((hm(s), hm(du)))
        es, ee = I(tr['EphemeralStartTime']), I(tr['EphemeralEndTime'])
        if es != 65535 and ee != 65535 and es != ee:
            timed.add((hm(es), (hm(ee) - hm(es)) % 1440))
    for k in range(8):
        g = gi.get(I(base[f'Item[{k}]']))
        if g:
            add_gather(I(g['Item']), job, glc.get(I(g['GatheringItemLevel']), I(base['GatheringLevel'])), tid, timed, folk,
                       I(g['RequiredQuest']) > 0)
spots = {I(d['#']): d for d in rows('FishingSpot')}
for d in rows('FishParameter'):
    sp = spots.get(I(d['FishingSpot']))
    if sp and I(d['Item']) > 0:
        add_gather(I(d['Item']), 4, glc.get(I(d['GatheringItemLevel']), 1), I(sp['TerritoryType']), None, False, False)
notebooks = {I(d['#']): d for d in rows('SpearfishingNotebook')}
for d in rows('SpearfishingItem'):
    n = notebooks.get(I(d['SpearfishingNotebook']))
    if n and I(d['Item']) > 0:
        add_gather(I(d['Item']), 4, glc.get(I(d['GatheringItemLevel']), 1), I(n['TerritoryType']), None, False, False)


def pack_gather(g):
    flags = 0 if g['ok'] else ((1 if g['folk'] else 0) | (2 if g['quest'] else 0))
    return [g['j'], g['l'], g['x'] | (1 << bucket(g['l'])), g['z'][:4], sorted(g['t']), g['n'], flags]


# ---------------- collectables (current appraiser only) ----------------
active = set()
for d in rows('CollectablesShop'):
    if I(d['RewardType']) == 1 and not d['Name'].startswith('●') and I(d['#']) > 0:
        for k in range(11):
            if I(d.get(f'ShopItems[{k}]', 0)):
                active.add(I(d[f'ShopItems[{k}]']))
refine = {I(d['#']): d for d in rows('CollectablesShopRefine')}
reward = {I(d['#']): d for d in rows('CollectablesShopRewardScrip')}
cs = {}
for d in rows('CollectablesShopItem'):
    grp, it = I(d['#'].split('.')[0]), I(d['Item'])
    if grp not in active or it <= 0 or it in cs:
        continue
    f, s = refine.get(I(d['CollectablesShopRefine'])), reward.get(I(d['CollectablesShopRewardScrip']))
    if not f or not s or I(s['Currency']) not in (2, 4, 6, 7) or I(s['HighReward']) <= 0:
        continue
    cs[it] = [it, I(d['LevelMin']), I(d['LevelMax']), I(f['LowCollectability']), I(f['MidCollectability']), I(f['HighCollectability']),
              I(s['Currency']), I(s['LowReward']), I(s['MidReward']), I(s['HighReward'])]
gather_cs = {c[0] for c in cs.values() if c[6] in (4, 7)}

gather_sell = {str(it): pack_gather(g) for it, g in G.items() if mkt(it) and g['l'] <= 100}
gather_col = {str(it): pack_gather(g) for it, g in G.items() if it in gather_cs and g['l'] <= 100}
gather_all = {str(it): [g['j'], g['l'], g['x'] | (1 << bucket(g['l'])), 0 if g['ok'] else 1] for it, g in G.items() if g['l'] <= 100}
used |= {int(k) for k in gather_sell} | {int(k) for k in gather_col} | set(cs)

# ---------------- vendors (NPC + location, seasonal shops excluded) ----------------
gil = {I(d['#']): d for d in rows('GilShop')}
topic = {I(d['#']): [I(d[f'Shop[{k}]']) for k in range(10)] for d in rows('TopicSelect')}
pre = {I(d['#']): I(d['Target']) for d in rows('PreHandler')}
custom = {I(d['#']): [I(d[k]) for k in d if k.endswith('ScriptArg')] for d in rows('CustomTalk')}


def shops_from(v, depth=0):
    out = set()
    if depth > 3 or v <= 0:
        return out
    if v in gil:
        out.add(v)
    elif v in topic:
        for s in topic[v]:
            out |= shops_from(s, depth + 1)
    elif v in pre:
        out |= shops_from(pre[v], depth + 1)
    elif v in custom:
        for a in custom[v]:
            if a in gil or a in topic or a in pre:
                out |= shops_from(a, depth + 1)
    return out


npc_shops = collections.defaultdict(set)
for d in rows('ENpcBase'):
    n = I(d['#'])
    for k in range(32):
        v = I(d.get(f'ENpcData[{k}]', 0))
        if v:
            npc_shops[n] |= shops_from(v)
npc_names = {I(d['#']): d['Singular'] for d in rows('ENpcResident')}
npc_loc = {}
for d in rows('Level'):
    o, t = I(d['Object']), I(d['Territory'])
    if o in npc_shops and t in terr and o not in npc_loc:
        npc_loc[o] = t
shop_npcs = collections.defaultdict(list)
for n, ss in npc_shops.items():
    for s in ss:
        shop_npcs[s].append(n)
vend = {}
for d in rows('GilShopItem'):
    sid, it = I(d['#'].split('.')[0]), I(d['Item'])
    if it <= 0 or not mkt(it) or sid not in gil:
        continue
    g = gil[sid]
    price = I(items[it]['PriceMid'])
    if price <= 0:
        continue
    v = vend.setdefault(it, {'p': price, 'perm': False, 'x': 0, 'u': True, 'npc': []})
    if I(g['FestivalId']) > 0:
        continue  # seasonal event shop
    v['perm'] = True
    if not (I(d['QuestRequired[0]']) > 0 or I(d['AchievementRequired']) > 0 or I(g['Quest']) > 0):
        v['u'] = False
    for n in shop_npcs.get(sid, []):
        t = npc_loc.get(n)
        if t is None:
            continue
        v['x'] |= 1 << I(terr[t]['ExVersion'])
        who, where = npc_names.get(n, ''), place.get(I(terr[t]['PlaceName']), '')
        if who and len(v['npc']) < 3 and [who, where] not in v['npc']:
            v['npc'].append([who, where])
vendors = {str(it): [v['p'], v['x'] if v['npc'] else 0, 1 if v['u'] else 0, v['npc']] for it, v in vend.items() if v['perm']}
used |= {int(k) for k in vendors}

# ---------------- currency exchanges ----------------
ex = set()
for d in rows('SpecialShop'):
    name = d['Name']
    for k in range(60):
        it = I(d.get(f'Item[{k}].Item[0]', 0))
        if not it:
            continue
        cost, code, qty = I(d[f'Item[{k}].CurrencyCost[0]']), d[f'Item[{k}].ItemCost[0]'], I(d[f'Item[{k}].ReceiveCount[0]']) or 1
        if cost <= 0:
            continue
        cur = None
        if name.startswith('Allagan Tomestones of Poetics') and code == '1':
            cur = 'poetics'
        elif 'Scrip' in name and code in ('2', '4', '6', '7'):
            cur = {'2': 'purpleC', '4': 'purpleG', '6': 'orangeC', '7': 'orangeG'}[code]
        elif code == '28063':
            cur = 'sky'
        if not cur:
            continue
        if mkt(it) and cost < 999 and not (cur == 'poetics' and cost < 20):
            ex.add((cur, it, cost, qty, 0))
        if cur == 'poetics' and items[it]['Name'] in ('Unidentifiable Shell', 'Unidentifiable Ore'):
            top = {'Unidentifiable Shell': 'Grade 3 Shroud Topsoil', 'Unidentifiable Ore': 'Grade 3 Thanalan Topsoil'}[items[it]['Name']]
            tid = next((i for i, r in items.items() if r['Name'] == top), 0)
            if tid:
                ex.add(('poetics', tid, cost, 1, 0))
for d in rows('GCScripShopItem'):
    it, c = I(d['Item']), I(d['CostGCSeals'])
    if it and c > 0 and mkt(it):
        ex.add(('gc', it, c, 1, I(d['RequiredGrandCompanyRank'])))
exchanges = [list(e) for e in sorted(ex)]
used |= {e[1] for e in exchanges}

# ---------------- crafting leves ----------------
leve = {I(d['#']): d for d in rows('Leve')}
leves = []
for d in rows('CraftLeve'):
    L = leve.get(I(d['Leve']))
    c = cjc.get(I(L['ClassJobCategory'])) if L else None
    if not c:
        continue
    js = [i for i, j in enumerate(JOBS) if c.get(j) == 'True']
    it = I(d['Item[0]'])
    if len(js) != 1 or it <= 0 or I(L['GilReward']) <= 0:
        continue
    leves.append([I(d['Leve']), L['Name'], js[0], I(L['ClassJobLevel']), I(L['GilReward']), it, I(d['ItemCount[0]']) or 1, I(d['Repeats']),
                  place.get(I(L['PlaceNameIssued']), ''), I(L['AllowanceCost']) or 1])
    used.add(it)

# ---------------- retainer ventures ----------------
rtn = {I(d['#']): d for d in rows('RetainerTaskNormal')}
ventures = []
for d in rows('RetainerTask'):
    if d['IsRandom'] == 'True':
        continue
    n = rtn.get(I(d['Task']))
    it = I(n['Item']) if n else 0
    if not mkt(it):
        continue
    c = cjc.get(I(d['ClassJobCategory'])); kind = 'Combat'
    if c:
        if c.get('MIN') == 'True' and c.get('BTN') != 'True': kind = 'MIN'
        elif c.get('BTN') == 'True' and c.get('MIN') != 'True': kind = 'BTN'
        elif c.get('FSH') == 'True' and c.get('MIN') != 'True': kind = 'FSH'
    ventures.append([it, kind, I(d['RetainerLevel']), I(n['Quantity[0]']), I(n['Quantity[4]']), I(d['MaxTimemin'])])
    used.add(it)

# ---------------- Grand Company supply/provisioning pool ----------------
# Columns are in the game's own order; map them to the app's job order (0-7 crafters, 8 MIN, 9 BTN, 10 FSH).
GC_COL = {0: 0, 1: 7, 2: 6, 3: 2, 4: 4, 5: 3, 6: 5, 7: 1, 8: 8, 9: 9, 10: 10}
pool = collections.defaultdict(lambda: {'lv': [], 'cnt': 1})
for d in rows('GCSupplyDuty'):
    lv = I(d['#'])
    if lv < 1:
        continue
    for col in range(11):
        for k in range(3):
            it = I(d.get(f'SupplyData[{col}].Item[{k}]', 0))
            if it:
                e = pool[(it, GC_COL[col])]; e['lv'].append(lv); e['cnt'] = I(d[f'SupplyData[{col}].ItemCount[{k}]']) or 1
gc_pool = [[it, job, min(e['lv']), max(e['lv']), e['cnt']] for (it, job), e in pool.items() if mkt(it)]
used |= {g[0] for g in gc_pool}

# ---------------- desynthesizable gear, worlds, names, icons ----------------
desynth = [i for i in items if mkt(i) and I(items[i]['Desynth']) > 0 and I(items[i]['EquipSlotCategory']) > 0]
worlds = {I(d['#']): d['Name'] for d in rows('World') if d['IsPublic'] == 'True' and d['Name']}
names = {str(i): items[i]['Name'] for i in used if i in items and items[i]['Name']}
marketable = sorted(i for i in used if mkt(i))
icons = {str(i): I(items[i]['Icon']) for i in used if i in items and I(items[i]['Icon']) > 0}

data = {
    'built': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
    'r': recipes, 'n': names, 'm': marketable, 'c': {c: uic.get(c, '') for c in cats},
    'g': gather_sell, 'gcol': gather_col, 'gf': gather_all, 'v': vendors, 'b': books, 'w': worlds, 'i': icons,
    'rlt': rlt_out, 'x': exchanges, 'cs': list(cs.values()), 'lv': leves, 'rt': ventures, 'ds': desynth, 'gcs': gc_pool,
}
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
# Leave the file untouched when nothing but the timestamp would change, so the nightly job only commits real updates.
if os.path.exists(OUT):
    try:
        prev = json.load(open(OUT, encoding='utf-8'))
        prev.pop('built', None); cur = dict(data); cur.pop('built', None)
        if json.loads(json.dumps(cur)) == prev:
            print('game data unchanged'); sys.exit(0)
    except (ValueError, OSError):
        pass
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
print(f"wrote {OUT}: {len(recipes)} recipes, {len(gather_sell)} gatherables, {len(vendors)} vendor items, "
      f"{len(cs)} collectables, {len(leves)} leves, {len(ventures)} ventures, {len(gc_pool)} GC items, {os.path.getsize(OUT)//1024} KB")
