// Generateur de MOB Bedrock, base sur un mob VANILLA officiel (fichiers Mojang bedrock-samples) :
// on copie son comportement + son apparence, on change l'identifiant et on applique les reglages.
// runtime_identifier = mob de base -> il garde ses comportements codes en dur (explosion du creeper...).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Mob, Project } from '../../types.js';
import { lootPath } from './block.js';
import { soundId } from './sound.js';
import { spawnEggPng } from './png.js';

export const VANILLA_MOBS_DIR = fileURLToPath(new URL('../../vanilla/mobs/', import.meta.url));

export interface MobBaseMeta {
  base: string; nom: string; tw: number; th: number; geo: boolean;
  health: number | null; speed: number | null; damage: number | null; spawn: boolean; hostile: boolean;
}

export function listMobBases(): MobBaseMeta[] {
  const f = join(VANILLA_MOBS_DIR, 'index.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : [];
}

function readBase(base: string, file: string): any | null {
  if (!/^[a-z_]+$/.test(base)) return null;
  const f = join(VANILLA_MOBS_DIR, base, file);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : null;
}
export function baseTexture(base: string): Buffer | null {
  if (!/^[a-z_]+$/.test(base)) return null;
  const f = join(VANILLA_MOBS_DIR, base, 'texture.png');
  return existsSync(f) ? readFileSync(f) : null;
}

// parcourt tous les objets "components" (de base + component_groups) et applique fn
function eachComponents(entity: any, fn: (comps: any) => void) {
  const e = entity['minecraft:entity'];
  if (e.components) fn(e.components);
  for (const g of Object.values(e.component_groups || {})) fn(g);
}

// retire ce qui n'existe pas en format 1.10.0 (scripts des lances 1.26 : kinetic_weapon, melee_spear...)
function stripNewClientFeatures(cd: any) {
  const sc = cd.scripts;
  if (!sc) return;
  if (Array.isArray(sc.pre_animation)) {
    const out: string[] = [];
    let depth = 0;
    for (const line of sc.pre_animation as string[]) {
      if (depth > 0) { if (line.includes('{')) depth++; if (line.trim().startsWith('}')) depth--; continue; }
      if (/spear|kinetic/.test(line) && line.includes('{')) { depth = 1; continue; }
      if (/spear|kinetic/.test(line)) continue;
      out.push(line);
    }
    sc.pre_animation = out;
  }
  if (Array.isArray(sc.initialize)) sc.initialize = sc.initialize.filter((l: string) => !/spear|kinetic/.test(l));
  if (sc.variables) for (const k of Object.keys(sc.variables)) if (/spear|kinetic/.test(k)) delete sc.variables[k];
  if (Array.isArray(sc.animate)) sc.animate = sc.animate.map((a: any) => {
    if (a && typeof a === 'object') { const k = Object.keys(a)[0]; if (typeof a[k] === 'string' && /spear|kinetic/.test(a[k])) return k; }
    return a;
  }).filter((a: any) => !(typeof a === 'string' && /spear/.test(a)));
}

export interface MobGenResult {
  entity: Record<string, unknown>;
  client: Record<string, unknown>;
  spawn: Record<string, unknown> | null;
  sounds: Record<string, unknown> | null;
  lang: string[];
  texturePath: string;          // chemin RP sans extension
  eggKey: string;               // cle de l'icone d'oeuf dans item_texture.json
  geometry: Record<string, unknown> | null;   // modele 3D propre au mob (RP/models/entity)
  renderController: Record<string, unknown>;  // controleur de rendu propre au mob (RP/render_controllers)
  eggPng: Buffer;               // icone d'oeuf 16x16 dessinee aux couleurs du mob
  warnings: string[];
}

export function generateMob(mob: Mob, project: Project): MobGenResult {
  const warnings: string[] = [];
  const entity = readBase(mob.base, 'entity.json');
  const client = readBase(mob.base, 'client.json');
  if (!entity || !client) throw new Error(`Mob de base inconnu : ${mob.base}`);
  const name = mob.identifier.split(':')[1];

  // ---------- comportement (BP) ----------
  const e = entity['minecraft:entity'];
  e.description.identifier = mob.identifier;
  // runtime_identifier : seulement si on veut garder les capacites codees en dur du mob de base.
  // Sinon on le retire -> l'oeuf personnalise apparait dans le creatif (Bedrock le supprime sinon),
  // et le mob reste fonctionnel car son IA est deja dans les composants copies.
  if (mob.keepBaseBehavior) {
    e.description.runtime_identifier = `minecraft:${mob.base}`;
    warnings.push(`Capacites speciales du ${mob.base} activees : l'OEUF PERSONNALISE n'apparaitra PAS dans le creatif (Bedrock le reserve au mob d'origine). Fais apparaitre le mob avec /summon ${mob.identifier}.`);
  } else {
    delete e.description.runtime_identifier;
  }
  e.description.is_spawnable = true;
  e.description.is_summonable = true;
  e.description.is_experimental = false;

  let sawAttack = false;
  eachComponents(entity, (c) => {
    if (c['minecraft:health']) c['minecraft:health'] = { value: mob.health, max: mob.health };
    if (c['minecraft:attack'] && mob.attackDamage != null) { c['minecraft:attack'].damage = mob.attackDamage; sawAttack = true; }
    if (c['minecraft:movement'] && typeof c['minecraft:movement'].value === 'number') {
      c['minecraft:movement'].value = +(c['minecraft:movement'].value * mob.speedFactor).toFixed(4);
    }
    if (c['minecraft:loot'] && mob.lootTable) c['minecraft:loot'] = { table: lootPath(project, mob.lootTable) };
    if (!mob.burnsInDaylight) delete c['minecraft:burns_in_daylight'];
  });
  const comps = (e.components = e.components || {});
  if (!comps['minecraft:health']) comps['minecraft:health'] = { value: mob.health, max: mob.health };
  if (mob.attackDamage != null && !sawAttack) {
    warnings.push(`Le mob de base (${mob.base}) n'attaque pas au corps a corps : les degats d'attaque sont ignores.`);
  }
  if (mob.lootTable) {
    if (!project.lootTables.some((l) => l.name === mob.lootTable)) warnings.push(`Loot table "${mob.lootTable}" introuvable : butin du mob de base garde.`);
    else comps['minecraft:loot'] = { table: lootPath(project, mob.lootTable) };
  }
  if (mob.scale !== 1) comps['minecraft:scale'] = { value: mob.scale };
  if (mob.isBoss) comps['minecraft:boss'] = { name: mob.displayName, hud_range: 55, should_darken_sky: mob.bossDarkenSky };

  // ---------- apparence (RP) ----------
  // Mob AUTONOME, construit comme les add-ons qui s'affichent chez Billy (ex. Dogs) : son propre modele 3D,
  // son propre controleur de rendu et le materiau standard entity_alphatest. Reutiliser les elements internes
  // de Mojang (materiau "zombie", controleur "zombie.v2", format 1.26) -> mob ET oeuf invisibles en jeu.
  const srcFormat = String(client.format_version || '1.10.0');
  // mobs ecrits en 1.8.0 chez Mojang (loup, araignee, squelette...) : on GARDE ce format, ou l'ancienne liste
  // "animation_controllers" est valide. La convertir en 1.10.0 cassait le loup (corps debout, tete decollee).
  const legacy = srcFormat === '1.8.0';
  const src = client['minecraft:client_entity'].description;
  stripNewClientFeatures(src);
  const texturePath = `textures/entity/${project.namespace}/${name}`;
  const geoId = `geometry.${project.namespace}.${name}`;
  const rcId = `controller.render.${project.namespace}_${name}`;
  // une vraie icone d'oeuf (l'oeuf generique a 2 couleurs n'existe plus -> carre plat dans l'inventaire)
  const eggKey = `${project.namespace}_${name}_egg`;
  const cd: any = {
    identifier: mob.identifier,
    materials: { default: 'entity_alphatest' },
    textures: { default: texturePath },
    geometry: { default: geoId },
    render_controllers: [rcId],
    spawn_egg: { texture: eggKey },
  };
  // animations du mob de base (references aux animations du jeu, comme le font les autres add-ons)
  const sc: any = {};
  if (src.scripts) for (const k of ['pre_animation', 'animate', 'scale']) if (src.scripts[k] !== undefined) sc[k] = src.scripts[k];
  cd.animations = { ...(src.animations || {}) };
  // ancien format "animation_controllers": [ {nom: controleur} ] -> refuse en 1.10.0 (vu dans le journal du jeu).
  // On les met dans "animations" et on les lance depuis scripts.animate.
  // Si le mob a deja sa liste moderne (scripts.animate, ex. zombie), l'ancienne liste est un doublon : on l'ignore.
  // Sinon (ex. loup) on convertit, avec un nom DISTINCT quand le controleur porte le meme nom qu'une animation
  // brute ("wolf_sitting") : sinon l'animation brute tourne en permanence (loup qui marche assis).
  const hasModern = Array.isArray(sc.animate) && sc.animate.length > 0;
  if (legacy && Array.isArray(src.animation_controllers)) cd.animation_controllers = src.animation_controllers;
  else if (Array.isArray(src.animation_controllers) && !hasModern) {
    sc.animate = [];
    for (const entry of src.animation_controllers) for (const [k, v] of Object.entries(entry || {})) {
      const key = cd.animations[k] && cd.animations[k] !== v ? `${k}_ctrl` : k;
      cd.animations[key] = v;
      if (!sc.animate.includes(key)) sc.animate.push(key);
    }
  }
  if (!Object.keys(cd.animations).length) delete cd.animations;
  // variables que le jeu ne remplit que pour les mobs vanilla : a 0, la marche des humanoides divise par 0
  // -> position invalide -> modele invisible. On les initialise.
  if (!legacy) sc.initialize = ['variable.gliding_speed_value = 1.0;'];
  if (Object.keys(sc).length) cd.scripts = sc;
  client['format_version'] = legacy ? '1.8.0' : '1.10.0';
  client['minecraft:client_entity'] = { description: cd };

  // modele 3D (copie du mob de base, format 1.8.0) et controleur de rendu, propres a ce mob
  const g = readBase(mob.base, 'geo.json');
  let geometry: Record<string, unknown> | null = null;
  if (g && g.bones) {
    geometry = {
      format_version: '1.8.0',
      [geoId]: { texturewidth: g.tw || 64, textureheight: g.th || 64, visible_bounds_width: 3, visible_bounds_height: 3.5, visible_bounds_offset: [0, 1.5, 0], bones: g.bones },
    };
  } else warnings.push(`Modele 3D du ${mob.base} introuvable : le mob risque d'etre invisible.`);
  const renderController = {
    format_version: '1.8.0',
    render_controllers: { [rcId]: { geometry: 'Geometry.default', materials: [{ '*': 'Material.default' }], textures: ['Texture.default'] } },
  };
  if (!mob.textureFile) warnings.push(`Texture du ${mob.base} d'origine utilisee (dessine la tienne pour le personnaliser).`);

  // ---------- apparition naturelle ----------
  let spawn: Record<string, unknown> | null = null;
  if (mob.spawnNaturally) {
    const sp = readBase(mob.base, 'spawn.json');
    if (!sp) warnings.push(`Le ${mob.base} n'a pas de regle d'apparition naturelle : utilise l'oeuf ou /summon.`);
    else {
      sp['minecraft:spawn_rules'].description.identifier = mob.identifier;
      if (mob.spawnWeight) {
        const walk = (o: any) => {
          if (Array.isArray(o)) o.forEach(walk);
          else if (o && typeof o === 'object') {
            for (const [k, v] of Object.entries(o)) {
              if (k === 'minecraft:weight' && v && typeof v === 'object') (v as any).default = mob.spawnWeight;
              else walk(v);
            }
          }
        };
        walk(sp);
      }
      spawn = sp;
    }
  }

  // ---------- sons (ceux du mob de base, + les tiens) ----------
  const baseSounds = readBase(mob.base, 'sounds.json');
  let sounds: any = baseSounds ? JSON.parse(JSON.stringify(baseSounds)) : null;
  const custom: Record<string, string> = { ambient: mob.soundAmbient, hurt: mob.soundHurt, death: mob.soundDeath };
  for (const [evt, sname] of Object.entries(custom)) {
    if (!sname) continue;
    if (!project.sounds.some((s) => s.name === sname)) { warnings.push(`Son "${sname}" introuvable dans le projet.`); continue; }
    sounds = sounds || { volume: 1, pitch: [0.8, 1.2], events: {} };
    sounds.events = sounds.events || {};
    sounds.events[evt] = soundId(project, sname);
  }

  const lang = [`entity.${mob.identifier}.name=${mob.displayName}`, `item.spawn_egg.entity.${mob.identifier}.name=Oeuf de ${mob.displayName}`];
  return { entity, client, spawn, sounds, lang, texturePath, eggKey, geometry, renderController, eggPng: spawnEggPng(mob.eggBase, mob.eggOverlay), warnings };
}
