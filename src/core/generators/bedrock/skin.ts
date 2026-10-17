// Generateur de PACK DE SKINS Bedrock (importable en .mcpack, porte depuis le profil du joueur).
// Un skin pack = manifest (module skin_pack) + skins.json + texts + les PNG 64x64.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Project, Skin } from '../../types.js';

export const SKIN_GEO_DIR = fileURLToPath(new URL('../../vanilla/skins/', import.meta.url));
export function skinGeometry(model: string): any {
  const f = join(SKIN_GEO_DIR, model === 'slim' ? 'humanoidSlim.json' : 'humanoid.json');
  return JSON.parse(readFileSync(f, 'utf-8'));
}
export function defaultSkinPng(model: string): Buffer {
  return readFileSync(join(SKIN_GEO_DIR, model === 'slim' ? 'alex.png' : 'steve.png'));
}

export interface SkinFile { path: string; content: Buffer; }

// textures : fournisseur des PNG dessines par l'utilisateur (sinon Steve/Alex)
export function buildSkinPack(project: Project, texture?: (file: string) => Buffer | null) {
  const skins = project.skins ?? [];
  const warnings: string[] = [];
  const files: SkinFile[] = [];
  const packId = project.namespace + 'skins';
  const headerUuid = stableSkinUuid(project, 'h');
  const moduleUuid = stableSkinUuid(project, 'm');

  const manifest = {
    format_version: 2,
    header: { name: `${project.name} — Skins`, uuid: headerUuid, version: [1, 0, 0] },
    modules: [{ type: 'skin_pack', uuid: moduleUuid, version: [1, 0, 0] }],
  };
  files.push({ path: 'manifest.json', content: J(manifest) });

  const skinList: any[] = [];
  const lang: string[] = [`skinpack.${packId}=${project.name}`];
  skins.forEach((skin, i) => {
    const key = `skin_${i + 1}`;
    let png = skin.textureFile && texture ? texture(skin.textureFile) : null;
    if (!png) { png = defaultSkinPng(skin.model); if (skin.textureFile) warnings.push(`[${skin.name}] texture introuvable : Steve/Alex par defaut.`); }
    const dims = pngDims(png);
    if (dims && (dims[0] !== 64 || (dims[1] !== 64 && dims[1] !== 32))) warnings.push(`[${skin.name}] le skin fait ${dims[0]}x${dims[1]} : Bedrock attend 64x64.`);
    files.push({ path: `${key}.png`, content: png });
    skinList.push({
      localization_name: key,
      geometry: skin.model === 'slim' ? 'minecraft.geometry.humanoid.customSlim' : 'minecraft.geometry.humanoid.custom',
      texture: `${key}.png`,
      type: 'free',
    });
    lang.push(`skin.${packId}.${key}=${skin.name}`);
  });
  if (skins.length === 0) warnings.push('Aucun skin dans le pack.');

  files.push({ path: 'skins.json', content: J({ skins: skinList, serialize_name: packId, localization_name: packId }) });
  files.push({ path: 'texts/en_US.lang', content: Buffer.from(lang.join('\n') + '\n', 'utf-8') });
  files.push({ path: 'texts/fr_FR.lang', content: Buffer.from(lang.join('\n') + '\n', 'utf-8') });
  files.push({ path: 'texts/languages.json', content: J(['en_US', 'fr_FR']) });
  return { files, warnings, packName: `${project.namespace}_skins` };
}

function J(o: unknown): Buffer { return Buffer.from(JSON.stringify(o, null, 2), 'utf-8'); }
function pngDims(b: Buffer): [number, number] | null {
  if (b.length < 24 || b[0] !== 0x89) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
// uuid stable par projet (pour ne pas creer un nouveau pack a chaque export)
const cache: Record<string, string> = {};
function stableSkinUuid(project: Project, suffix: string): string {
  const dir = join(process.cwd(), 'data', 'uuids');
  const f = join(dir, project.id + '_skins.json');
  if (!cache[project.id]) {
    try { cache[project.id] = readFileSync(f, 'utf-8'); } catch {
      const u = { h: randomUUID(), m: randomUUID() };
      try { mkdirSync(dir, { recursive: true }); writeFileSync(f, JSON.stringify(u)); } catch {}
      cache[project.id] = JSON.stringify(u);
    }
  }
  return JSON.parse(cache[project.id])[suffix];
}
