# Construit la liste de TOUS les items Bedrock (version du serveur) pour le selecteur d'ingredients.
#  - liste : minecraft-data bedrock (items.json)
#  - noms FR : fr_FR.lang du serveur (cle directe, sinon via le nom anglais d'en_US.lang)
#  - icones : pack de ressources officiel Mojang (bedrock-samples : item_texture.json, blocks.json, terrain_texture.json)
# Sortie : src/server/ui/mcitems.json + src/server/ui/mcicons/*.png
import json, os, re, shutil, sys, struct, zlib
ITEMS = sys.argv[1]
SAMPLES = sys.argv[2]                         # dossier resource_pack de bedrock-samples
TEXTS = '/opt/minecraft/mcbedrock/resource_packs/vanilla/texts'
OUT = '/opt/billysoft/mcstudio/src/server/ui'
ICONS = os.path.join(OUT, 'mcicons')

def load_lang(p):
    d = {}
    for line in open(p, encoding='utf-8', errors='ignore'):
        line = line.split('\t#')[0].strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1); d[k.strip()] = v.strip()
    return d
fr, en = load_lang(f'{TEXTS}/fr_FR.lang'), load_lang(f'{TEXTS}/en_US.lang')
en_to_key = {}
for k, v in en.items():
    if k.startswith(('item.', 'tile.')) and v.lower() not in en_to_key: en_to_key[v.lower()] = k

def camel(n):
    p = n.split('_'); return p[0] + ''.join(x.capitalize() for x in p[1:])
def nom_fr(n, display):
    for k in (f'item.{n}.name', f'tile.{n}.name', f'item.{camel(n)}.name', f'tile.{camel(n)}.name',
              f'item.minecraft:{n}.name', f'tile.minecraft:{n}.name'):
        if k in fr: return fr[k]
    k = en_to_key.get(display.lower())
    if k and k in fr: return fr[k]
    if n.endswith('_spawn_egg'):
        k = f'item.spawn_egg.entity.{n[:-10]}.name'
        if k in fr: return fr[k]
    return None

# --- textures officielles ---
def jload(p):
    txt = open(p, encoding='utf-8').read()
    txt = re.sub(r'^\s*//.*$', '', txt, flags=re.M)      # commentaires // eventuels
    return json.loads(txt)
itex = jload(f'{SAMPLES}/textures/item_texture.json')['texture_data']
ttex = jload(f'{SAMPLES}/textures/terrain_texture.json')['texture_data']
blocks = jload(f'{SAMPLES}/blocks.json')
FILES = {}
for sub in ('items', 'blocks'):
    base = f'{SAMPLES}/textures/{sub}'
    for root, _, fs in os.walk(base):
        for fn in fs:
            if fn.endswith(('.png', '.tga')) and not fn.endswith('_mers.tga'):
                FILES.setdefault((sub, os.path.splitext(fn)[0]), os.path.join(root, fn))
def direct(n):
    for c in (n, n.replace('_item',''), n+'_item'):
        for sub in ('items','blocks'):
            if (sub,c) in FILES: return FILES[(sub,c)]
    for suf in ('','_top','_side','_front'):
        if ('blocks', n+suf) in FILES: return FILES[('blocks', n+suf)]
    # noms inverses frequents : cooked_beef->beef_cooked, golden_apple->apple_golden
    w = n.split('_')
    if len(w) >= 2:
        rev = '_'.join(w[1:] + w[:1])
        for sub in ('items','blocks'):
            if (sub, rev) in FILES: return FILES[(sub, rev)]
        rev2 = '_'.join([w[-1]] + w[:-1])
        for sub in ('items','blocks'):
            if (sub, rev2) in FILES: return FILES[(sub, rev2)]
    return None

def first_path(t):
    if isinstance(t, str): return t
    if isinstance(t, list): return first_path(t[0]) if t else None
    if isinstance(t, dict):
        if 'path' in t: return t['path']
        if 'variations' in t: return first_path(t['variations'])
        if 'textures' in t: return first_path(t['textures'])
    return None
def terrain_path(key):
    e = ttex.get(key); return first_path(e['textures']) if e else None
def block_tex_key(b):
    t = b.get('carried_textures') or b.get('textures')
    if isinstance(t, str): return t
    if isinstance(t, dict): return t.get('side') or t.get('north') or t.get('up') or next(iter(t.values()), None)
    return None
def resolve(p):
    if not p: return None
    for ext in ('.png', '.tga'):
        f = os.path.join(SAMPLES, p + ext)
        if os.path.exists(f): return f
    return None

def icon_path(n):
    cands = [n, n.replace('_item', ''), n + '_item']
    if n.endswith('_spawn_egg'): cands = ['spawn_egg_' + n[:-10], n] + cands
    for c in cands:
        if c in itex:
            r = resolve(first_path(itex[c]['textures']))
            if r: return r
    for c in cands:
        b = blocks.get(c) or blocks.get('minecraft:' + c)
        if isinstance(b, dict):
            k = block_tex_key(b)
            r = resolve(terrain_path(k)) if k else None
            if r: return r
    for c in cands + [n.replace('_block', ''), n + 's']:
        r = resolve(terrain_path(c))
        if r: return r
    return direct(n)

# --- TGA -> PNG (sans dependance) ---
def png_bytes(w, h, rgba):
    raw = b''.join(b'\x00' + rgba[y*w*4:(y+1)*w*4] for y in range(h))
    def ch(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
def tga_to_png(path):
    d = open(path, 'rb').read()
    idl, cmt, it = d[0], d[1], d[2]; w, h = struct.unpack('<HH', d[12:16]); bpp, desc = d[16], d[17]
    if cmt or it not in (2, 10) or bpp not in (24, 32): return None
    px = bpp // 8; i = 18 + idl; out = bytearray(); n = w * h
    if it == 2:
        out = bytearray(d[i:i + n * px])
    else:
        while len(out) < n * px:
            c = d[i]; i += 1; cnt = (c & 0x7f) + 1
            if c & 0x80: out += d[i:i + px] * cnt; i += px
            else: out += d[i:i + px * cnt]; i += px * cnt
    rgba = bytearray()
    for k in range(n):
        p = out[k*px:(k+1)*px]; rgba += bytes([p[2], p[1], p[0], p[3] if px == 4 else 255])
    if not (desc & 0x20):  # origine en bas : on retourne l'image
        rows = [rgba[y*w*4:(y+1)*w*4] for y in range(h)]; rgba = b''.join(reversed(rows))
    return png_bytes(w, h, bytes(rgba))

TECH = re.compile(r'^(element_|hard_|chemistry|compound|reserved|info_update|unknown|air$|portal$|end_gateway|moving_block|'
                  r'piston_arm|lit_|unlit_|powered_|unpowered_|camera$|glow_stick|border_block|allow$|deny$|structure_|'
                  r'jigsaw|light_block|client_request|item\.|.*_wall_banner$|.*_double_slab$|.*wall_sign$|bubble_column)')

src = json.load(open(ITEMS))
shutil.rmtree(ICONS, ignore_errors=True); os.makedirs(ICONS)
out, seen, nicon, nfr = [], set(), 0, 0
for it in src:
    n = it['name']
    if n in seen or TECH.match(n): continue
    seen.add(n)
    nom = nom_fr(n, it['displayName']); nfr += bool(nom)
    icon = None; p = icon_path(n)
    if p:
        dst = os.path.join(ICONS, n + '.png')
        if p.endswith('.png'): shutil.copyfile(p, dst); icon = n + '.png'
        else:
            b = tga_to_png(p)
            if b: open(dst, 'wb').write(b); icon = n + '.png'
    nicon += bool(icon)
    out.append({'id': 'minecraft:' + n, 'nom': nom or it['displayName'], 'en': it['displayName'],
                'pile': it.get('stackSize', 64), 'icone': icon})
out.sort(key=lambda x: x['nom'].lower())
json.dump(out, open(os.path.join(OUT, 'mcitems.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(f'{len(out)} items | noms FR {nfr} | icones {nicon}')
