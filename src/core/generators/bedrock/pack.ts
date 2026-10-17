// Assembleur d'add-on Bedrock : transforme un Projet en arborescence complete
// (behavior pack + resource pack) prete a ecrire sur disque ou a zipper (.mcaddon).
import { Project } from '../../types.js';
import { behaviorManifest, resourceManifest, newPackUuids, PackUuids } from './manifest.js';
import { generateItemJson } from './item.js';
import { generateRecipeJson } from './recipe.js';
import { generateBlockJson } from './block.js';
import { generateLootJson } from './loot.js';
import { generateSoundDefinitions, soundFileExt } from './sound.js';
import { generateMob, baseTexture } from './mob.js';
import { missingTexturePng } from './png.js';
import { needsScript, generateMainScript, SCRIPT_API_VERSION } from './script.js';

export interface PackFile {
  path: string;          // chemin relatif (ex: "BP/items/rubis.json")
  content: Buffer;
}
export interface BuildResult {
  files: PackFile[];
  warnings: string[];
  uuids: PackUuids;
  bpName: string;
  rpName: string;
  stats: { items: number; recipes: number; textures: number; blocks: number; mobs: number; lootTables: number; sounds: number };
}

export interface TextureProvider {
  // renvoie les octets PNG d'un fichier de texture fourni, ou null si absent
  (textureFile: string): Buffer | null;
}
export interface SoundProvider {
  (soundFile: string): Buffer | null;
}

function pngSizeWarn(png: Buffer, label: string): string | null {
  if (png.length < 24 || png[0] !== 0x89) return null;
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const pow2 = (n: number) => (n & (n - 1)) === 0;
  if (w !== h || !pow2(w) || !pow2(h)) return `${label} : texture ${w}×${h} — Bedrock exige du CARRÉ en puissance de 2 (16, 32, 64, 128, 256). Réimporte-la (le studio la corrige) ou redessine-la.`;
  return null;
}
function j(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj, null, 2), 'utf-8');
}

export function buildAddon(project: Project, uuids: PackUuids | null, textures?: TextureProvider, sounds?: SoundProvider): BuildResult {
  const u = uuids ?? newPackUuids();
  const warnings: string[] = [];
  const files: PackFile[] = [];
  const bpName = `${project.namespace}_bp`;
  const rpName = `${project.namespace}_rp`;
  const blocks = project.blocks ?? [], mobs = project.mobs ?? [], loots = project.lootTables ?? [], snds = project.sounds ?? [];
  const tex = (file?: string) => (file && textures ? textures(file) : null);

  // --- manifests ---
  const withScript = needsScript(project.items);
  files.push({ path: `BP/manifest.json`, content: j(behaviorManifest(project, u, withScript ? { apiVersion: SCRIPT_API_VERSION } : undefined)) });
  if (withScript) files.push({ path: `BP/scripts/main.js`, content: Buffer.from(generateMainScript(project.items), 'utf-8') });
  files.push({ path: `RP/manifest.json`, content: j(resourceManifest(project, u)) });

  // --- identifiants en double (un item et un bloc ne peuvent pas partager un identifiant) ---
  const ids = [...project.items.map((i) => i.identifier), ...blocks.map((b) => b.identifier), ...mobs.map((m) => m.identifier)];
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) warnings.push(`[${id}] identifiant utilise plusieurs fois (item/bloc/mob) : conflit.`);

  // --- items (BP) + textures (RP) ---
  const textureData: Record<string, { textures: string }> = {};
  const langLines: string[] = [`pack.name=${project.name}`];
  let textureCount = 0;

  for (const item of project.items) {
    const res = generateItemJson(item, project);
    warnings.push(...res.warnings.map((w) => `[${item.identifier}] ${w}`));
    files.push({ path: `BP/items/${res.textureKey}.json`, content: j(res.json) });
    const key = res.textureKey;
    textureData[key] = { textures: `textures/items/${key}` };
    let png = tex(item.textureFile);
    if (!png) {
      png = missingTexturePng();
      if (item.textureFile) warnings.push(`[${item.identifier}] texture "${item.textureFile}" introuvable : damier par defaut utilise.`);
      else warnings.push(`[${item.identifier}] aucune texture fournie : damier par defaut utilise.`);
    }
    const wi = pngSizeWarn(png, `[${item.identifier}]`); if (wi) warnings.push(wi);
    files.push({ path: `RP/textures/items/${key}.png`, content: png });
    textureCount++;
    langLines.push(`item.${item.identifier}.name=${item.displayName}`);
  }

  // --- blocs (BP) + terrain_texture / blocks.json (RP) ---
  if (blocks.length) {
    const terrain: Record<string, { textures: string }> = {};
    const blocksJson: Record<string, unknown> = { format_version: [1, 1, 0] };
    for (const b of blocks) {
      const res = generateBlockJson(b, project);
      warnings.push(...res.warnings.map((w) => `[${b.identifier}] ${w}`));
      const name = b.identifier.split(':')[1];
      files.push({ path: `BP/blocks/${name}.json`, content: j(res.json) });
      terrain[res.textureKey] = { textures: `textures/blocks/${res.textureKey}` };
      const bpng = tex(b.textureFile) ?? missingTexturePng();
      const wb = pngSizeWarn(bpng, `[${b.identifier}]`); if (wb) warnings.push(wb);
      files.push({ path: `RP/textures/blocks/${res.textureKey}.png`, content: bpng });
      blocksJson[b.identifier] = res.soundEntry;
      textureCount++;
      langLines.push(`tile.${b.identifier}.name=${b.displayName}`);
    }
    files.push({
      path: `RP/textures/terrain_texture.json`,
      content: j({ resource_pack_name: project.namespace, texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4, texture_data: terrain }),
    });
    files.push({ path: `RP/blocks.json`, content: j(blocksJson) });
  }

  // --- loot tables (BP) ---
  for (const t of loots) {
    const res = generateLootJson(t, project);
    warnings.push(...res.warnings.map((w) => `[loot ${t.name}] ${w}`));
    files.push({ path: `BP/loot_tables/${project.namespace}/${t.name}.json`, content: j(res.json) });
  }

  // --- sons (RP) ---
  if (snds.length) {
    files.push({ path: `RP/sounds/sound_definitions.json`, content: j(generateSoundDefinitions(project)) });
    for (const s of snds) {
      const data = sounds ? sounds(s.file) : null;
      if (!data) { warnings.push(`[son ${s.name}] fichier audio introuvable.`); continue; }
      files.push({ path: `RP/sounds/${project.namespace}/${s.name}${soundFileExt(s.file)}`, content: data });
    }
  }

  // --- mobs (BP entities + spawn_rules, RP entity + texture + sons) ---
  const entitySounds: Record<string, unknown> = {};
  for (const m of mobs) {
    let res;
    try { res = generateMob(m, project); } catch (e: any) { warnings.push(`[${m.identifier}] ${e.message}`); continue; }
    warnings.push(...res.warnings.map((w) => `[${m.identifier}] ${w}`));
    const name = m.identifier.split(':')[1];
    files.push({ path: `BP/entities/${name}.json`, content: j(res.entity) });
    files.push({ path: `RP/entity/${name}.entity.json`, content: j(res.client) });
    if (res.geometry) files.push({ path: `RP/models/entity/${name}.geo.json`, content: j(res.geometry) });
    files.push({ path: `RP/render_controllers/${name}.render_controllers.json`, content: j(res.renderController) });
    if (res.spawn) files.push({ path: `BP/spawn_rules/${name}.json`, content: j(res.spawn) });
    files.push({ path: `RP/${res.texturePath}.png`, content: tex(m.textureFile) ?? baseTexture(m.base) ?? missingTexturePng() });
    // icone de l'oeuf d'apparition
    files.push({ path: `RP/textures/items/${res.eggKey}.png`, content: res.eggPng });
    textureData[res.eggKey] = { textures: `textures/items/${res.eggKey}` };
    textureCount++;
    if (res.sounds) entitySounds[m.identifier] = res.sounds;
    langLines.push(...res.lang);
  }
  // atlas des icones (items + oeufs des mobs)
  if (Object.keys(textureData).length) {
    files.push({
      path: `RP/textures/item_texture.json`,
      content: j({ resource_pack_name: project.namespace, texture_name: 'atlas.items', texture_data: textureData }),
    });
  }
  if (Object.keys(entitySounds).length) {
    files.push({ path: `RP/sounds.json`, content: j({ entity_sounds: { entities: entitySounds } }) });
  }

  // langues (RP) : en_US obligatoire comme base, + fr_FR
  files.push({ path: `RP/texts/languages.json`, content: j(['en_US', 'fr_FR']) });
  files.push({ path: `RP/texts/en_US.lang`, content: Buffer.from(langLines.join('\n') + '\n', 'utf-8') });
  files.push({ path: `RP/texts/fr_FR.lang`, content: Buffer.from(langLines.join('\n') + '\n', 'utf-8') });

  // --- recettes (BP) ---
  for (const recipe of project.recipes) {
    const res = generateRecipeJson(recipe, project);
    warnings.push(...res.warnings.map((w) => `[${recipe.identifier}] ${w}`));
    const name = recipe.identifier.split(':')[1];
    files.push({ path: `BP/recipes/${name}.json`, content: j(res.json) });
  }

  return {
    files,
    warnings,
    uuids: u,
    bpName,
    rpName,
    stats: {
      items: project.items.length, recipes: project.recipes.length, textures: textureCount,
      blocks: blocks.length, mobs: mobs.length, lootTables: loots.length, sounds: snds.length,
    },
  };
}
