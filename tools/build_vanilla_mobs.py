# Prepare les MOBS DE BASE (fichiers officiels Mojang bedrock-samples) pour l'editeur de mobs :
#   entity.json (comportement), client.json (apparence), spawn.json (apparition), texture.png, geo.json (modele 3D aplati)
# Sortie : src/core/vanilla/mobs/<base>/ + index.json
import json, os, re, struct, sys, zlib, glob
S = sys.argv[1]  # dossier bedrock-samples
OUT = '/opt/billysoft/mcstudio/src/core/vanilla/mobs'
LANG = '/opt/minecraft/mcbedrock/resource_packs/vanilla/texts/fr_FR.lang'
BASES = ['zombie', 'husk', 'skeleton', 'stray', 'spider', 'cave_spider', 'creeper', 'enderman', 'witch',
         'pig', 'cow', 'chicken', 'wolf', 'iron_golem', 'polar_bear', 'fox', 'blaze', 'pillager']

def jsonc(path):
    s = open(path, encoding='utf-8').read(); out = []; i = 0; n = len(s); ins = False
    while i < n:
        c = s[i]
        if ins:
            out.append(c)
            if c == '\\': out.append(s[i + 1]); i += 2; continue
            if c == '"': ins = False
            i += 1; continue
        if c == '"': ins = True; out.append(c); i += 1; continue
        if s.startswith('//', i): j = s.find('\n', i); i = n if j < 0 else j; continue
        if s.startswith('/*', i): j = s.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        out.append(c); i += 1
    return json.loads(re.sub(r',(\s*[}\]])', r'\1', ''.join(out)))

fr = {}
for line in open(LANG, encoding='utf-8', errors='ignore'):
    line = line.split('\t#')[0].strip()
    if '=' in line: k, v = line.split('=', 1); fr[k.strip()] = v.strip()

# --- index des client entities par identifiant (on garde le format le plus recent) ---
def ver(v):
    try: return tuple(int(x) for x in str(v).split('.'))
    except Exception: return (0,)
clients = {}
for f in glob.glob(f'{S}/resource_pack/entity/*.json'):
    try: d = jsonc(f)
    except Exception: continue
    ce = d.get('minecraft:client_entity'); 
    if not ce: continue
    ident = ce['description'].get('identifier'); fv = ver(d.get('format_version', '0'))
    if ident and (ident not in clients or fv > clients[ident][0]): clients[ident] = (fv, d)

# --- geometries (formats 1.8/1.10 et 1.12+) avec heritage ---
geos = {}
def add_geo_file(f):
    try: d = jsonc(f)
    except Exception: return
    for k, v in d.items():
        if k.startswith('geometry.') and isinstance(v, dict):
            ident, _, parent = k.partition(':')
            geos[ident] = {'parent': parent or None, 'tw': v.get('texturewidth'), 'th': v.get('textureheight'), 'bones': v.get('bones', [])}
    for g in d.get('minecraft:geometry', []) or []:
        desc = g.get('description', {}); ident = desc.get('identifier')
        if ident: geos[ident] = {'parent': None, 'tw': desc.get('texture_width'), 'th': desc.get('texture_height'), 'bones': g.get('bones', [])}
for f in glob.glob(f'{S}/resource_pack/models/**/*.json', recursive=True): add_geo_file(f)

def resolve_geo(ident, depth=0):
    g = geos.get(ident)
    if not g or depth > 8: return None
    if g['parent']:
        p = resolve_geo(g['parent'], depth + 1)
        if p:
            bones = {b['name']: b for b in p['bones']}
            order = [b['name'] for b in p['bones']]
            for b in g['bones']:
                if b['name'] not in bones: order.append(b['name'])
                bones[b['name']] = b
            return {'tw': g['tw'] or p['tw'], 'th': g['th'] or p['th'], 'bones': [bones[n] for n in order]}
    return {'tw': g['tw'], 'th': g['th'], 'bones': g['bones']}

# --- texture -> png ---
def png_bytes(w, h, rgba):
    raw = b''.join(b'\x00' + rgba[y*w*4:(y+1)*w*4] for y in range(h))
    def ch(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
def tga_to_png(path):
    d = open(path, 'rb').read(); idl, cmt, it = d[0], d[1], d[2]; w, h = struct.unpack('<HH', d[12:16]); bpp, desc = d[16], d[17]
    if cmt or it not in (2, 10) or bpp not in (24, 32): return None
    px = bpp // 8; i = 18 + idl; out = bytearray(); n = w * h
    if it == 2: out = bytearray(d[i:i + n * px])
    else:
        while len(out) < n * px:
            c = d[i]; i += 1; cnt = (c & 0x7f) + 1
            if c & 0x80: out += d[i:i + px] * cnt; i += px
            else: out += d[i:i + px * cnt]; i += px * cnt
    rgba = bytearray()
    for k in range(n):
        p = out[k*px:(k+1)*px]; rgba += bytes([p[2], p[1], p[0], p[3] if px == 4 else 255])
    if not (desc & 0x20): rows = [rgba[y*w*4:(y+1)*w*4] for y in range(h)]; rgba = b''.join(reversed(rows))
    return png_bytes(w, h, bytes(rgba)), w, h
def load_tex(p):
    for ext in ('.png', '.tga'):
        f = f'{S}/resource_pack/{p}{ext}'
        if os.path.exists(f):
            if ext == '.png':
                b = open(f, 'rb').read(); w, h = struct.unpack('>II', b[16:24]); return b, w, h
            return tga_to_png(f)
    return None

snd = jsonc(f'{S}/resource_pack/sounds.json').get('entity_sounds', {}).get('entities', {})
index = []
for base in BASES:
    try:
        ent = jsonc(f'{S}/behavior_pack/entities/{base}.json')
        cl = clients.get('minecraft:' + base)
        if not cl: raise Exception('client entity introuvable')
        cl = cl[1]; desc = cl['minecraft:client_entity']['description']
        tex_path = (desc.get('textures') or {}).get('default'); geo_id = (desc.get('geometry') or {}).get('default')
        tex = load_tex(tex_path) if tex_path else None
        geo = resolve_geo(geo_id) if geo_id else None
        if not tex: raise Exception(f'texture introuvable {tex_path}')
        d = os.path.join(OUT, base); os.makedirs(d, exist_ok=True)
        json.dump(ent, open(f'{d}/entity.json', 'w'), indent=1)
        json.dump(cl, open(f'{d}/client.json', 'w'), indent=1)
        sp = f'{S}/behavior_pack/spawn_rules/{base}.json'
        if os.path.exists(sp): json.dump(jsonc(sp), open(f'{d}/spawn.json', 'w'), indent=1)
        open(f'{d}/texture.png', 'wb').write(tex[0])
        if geo: json.dump(geo, open(f'{d}/geo.json', 'w'))
        if base in snd: json.dump(snd[base], open(f'{d}/sounds.json', 'w'), indent=1)
        comps = ent['minecraft:entity'].get('components', {})
        hp = (comps.get('minecraft:health') or {}).get('value'); mv = (comps.get('minecraft:movement') or {}).get('value')
        atk = (comps.get('minecraft:attack') or {}).get('damage')
        meta = {'base': base, 'nom': fr.get(f'entity.{base}.name', base), 'tw': tex[1], 'th': tex[2], 'geo': bool(geo),
                'health': hp, 'speed': mv, 'damage': atk if isinstance(atk, (int, float)) else None,
                'spawn': os.path.exists(sp), 'hostile': atk is not None}
        json.dump(meta, open(f'{d}/meta.json', 'w'))
        index.append(meta); print(f'OK {base:12} {meta["nom"]:22} tex {tex[1]}x{tex[2]} geo={bool(geo)} vie={hp} vit={mv} deg={atk}')
    except Exception as e:
        print(f'ECHEC {base}: {e}')
json.dump(index, open(f'{OUT}/index.json', 'w'), ensure_ascii=False, indent=1)
print(len(index), 'mobs de base')
