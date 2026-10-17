// Petit encodeur PNG (sans dependance) pour fabriquer une texture par defaut
// (damier magenta/noir facon "texture manquante") quand l'utilisateur n'a pas fourni de PNG.
import zlib from 'node:zlib';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** PNG RGBA. pixels(x,y) -> [r,g,b,a]. */
export function encodePng(width: number, height: number, pixels: (x: number, y: number) => [number, number, number, number]): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixels(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** Damier magenta/noir 16x16 = texture manquante bien reconnaissable. */
export function missingTexturePng(): Buffer {
  return encodePng(16, 16, (x, y) => {
    const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
    return on ? [247, 0, 255, 255] : [0, 0, 0, 255];
  });
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c: [number, number, number], f: number): [number, number, number] {
  return c.map((v) => Math.max(0, Math.min(255, Math.round(v * f)))) as [number, number, number];
}

/** Icone d'oeuf d'apparition 16x16 (forme d'oeuf + contour + taches), aux couleurs du mob.
 *  Necessaire : les versions recentes de Bedrock n'ont plus l'oeuf generique a 2 couleurs
 *  (base_color/overlay_color seuls -> carre de couleur plat dans l'inventaire). */
export function spawnEggPng(baseHex: string, overlayHex: string): Buffer {
  const base = hexRgb(baseHex), spot = hexRgb(overlayHex);
  // demi-largeur de l'oeuf par ligne (y=1..14) : pointu en haut, rond en bas
  const half = [0, 1.5, 2.5, 3.2, 3.8, 4.3, 4.7, 5.0, 5.2, 5.3, 5.3, 5.1, 4.7, 4.0, 2.8, 0];
  const inside = (x: number, y: number) => y >= 1 && y <= 14 && Math.abs(x + 0.5 - 8) <= half[y];
  const spots = new Set(['6,4', '9,5', '10,6', '5,8', '6,8', '9,9', '10,9', '7,11', '11,11', '5,12', '8,13']);
  return encodePng(16, 16, (x, y) => {
    if (!inside(x, y)) return [0, 0, 0, 0];
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) return [...shade(base, 0.45), 255];
    if (spots.has(`${x},${y}`)) return [...spot, 255];
    if (x <= 6 && y <= 6 && (x + y) % 3 === 0) return [...shade(base, 1.35), 255];   // reflet
    if (x >= 9 && y >= 10) return [...shade(base, 0.8), 255];                       // ombre
    return [...base, 255];
  });
}
