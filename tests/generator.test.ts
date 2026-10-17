import { describe, it, expect } from 'vitest';
import { buildAddon } from '../src/core/generators/bedrock/pack.js';
import { generateItemJson } from '../src/core/generators/bedrock/item.js';
import { exampleProject } from '../src/core/examples/generateExample.js';
import { ItemSchema, ProjectSchema } from '../src/core/types.js';

describe('validation des schemas', () => {
  it('le projet exemple est valide', () => {
    expect(() => ProjectSchema.parse(exampleProject)).not.toThrow();
  });
  it('refuse un identifiant invalide', () => {
    expect(() => ItemSchema.parse({ ...exampleProject.items[0], identifier: 'Rubis Rouge' })).toThrow();
  });
});

describe('generateur item', () => {
  it('genere un item generique correct', () => {
    const { json } = generateItemJson(exampleProject.items[0], exampleProject);
    const item = (json as any)['minecraft:item'];
    expect(item.description.identifier).toBe('bc:rubis');
    expect(item.description.menu_category.category).toBe('items');
    expect(item.components['minecraft:icon']).toBe('rubis');
    expect(item.components['minecraft:max_stack_size']).toBe(64);
  });
  it('une arme a 1 en pile max, des degats, de la durabilite et le glint', () => {
    const { json } = generateItemJson(exampleProject.items[1], exampleProject);
    const c = (json as any)['minecraft:item'].components;
    expect(c['minecraft:max_stack_size']).toBe(1);
    expect(c['minecraft:damage']).toBe(9);
    expect(c['minecraft:durability'].max_durability).toBe(1800);
    expect(c['minecraft:glint']).toBe(true);
    expect(c['minecraft:hand_equipped']).toBe(true);
  });
  it('la nourriture a un composant food et une animation eat', () => {
    const { json } = generateItemJson(exampleProject.items[2], exampleProject);
    const c = (json as any)['minecraft:item'].components;
    expect(c['minecraft:food'].nutrition).toBe(6);
    expect(c['minecraft:food'].can_always_eat).toBe(true);
    expect(c['minecraft:use_animation']).toBe('eat');
  });
  it('previent que le lore n\'est pas supporte en vanilla', () => {
    const { warnings } = generateItemJson(exampleProject.items[0], exampleProject);
    expect(warnings.some((w) => w.toLowerCase().includes('lore'))).toBe(true);
  });
});

describe('assemblage add-on', () => {
  it('produit BP + RP avec manifests, items, textures, recette, langues', () => {
    const res = buildAddon(exampleProject, null);
    const paths = res.files.map((f) => f.path);
    expect(paths).toContain('BP/manifest.json');
    expect(paths).toContain('RP/manifest.json');
    expect(paths).toContain('BP/items/rubis.json');
    expect(paths).toContain('RP/textures/items/rubis.png');
    expect(paths).toContain('RP/textures/item_texture.json');
    expect(paths).toContain('BP/recipes/epee_rubis_craft.json');
    expect(paths).toContain('RP/texts/fr_FR.lang');
    expect(res.stats.items).toBe(3);
    // le BP doit dependre du RP (meme uuid)
    const bp = JSON.parse(res.files.find((f) => f.path === 'BP/manifest.json')!.content.toString());
    const rp = JSON.parse(res.files.find((f) => f.path === 'RP/manifest.json')!.content.toString());
    expect(bp.dependencies[0].uuid).toBe(rp.header.uuid);
  });
  it('tous les JSON generes sont du JSON valide', () => {
    const res = buildAddon(exampleProject, null);
    for (const f of res.files.filter((f) => f.path.endsWith('.json'))) {
      expect(() => JSON.parse(f.content.toString())).not.toThrow();
    }
  });
  it('les PNG de texture ont une signature PNG valide', () => {
    const res = buildAddon(exampleProject, null);
    const png = res.files.find((f) => f.path.endsWith('.png'))!;
    expect(png.content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  });
});

describe('recettes 1.20+', () => {
  it('chaque recette a des donnees de deblocage (unlock)', () => {
    const res = buildAddon(exampleProject, null);
    const r = JSON.parse(res.files.find((f) => f.path.startsWith('BP/recipes/'))!.content.toString());
    expect(r['minecraft:recipe_shaped'].unlock).toEqual({ context: 'AlwaysUnlocked' });
  });
});

describe('blocs, loot tables, mobs', () => {
  const res = buildAddon(exampleProject, null);
  const get = (p: string) => JSON.parse(res.files.find((f) => f.path === p)!.content.toString());
  it('genere le bloc avec geometrie, texture, lumiere et loot', () => {
    const b = get('BP/blocks/bloc_rubis.json')['minecraft:block'];
    expect(b.description.identifier).toBe('bc:bloc_rubis');
    expect(b.components['minecraft:geometry']).toBe('minecraft:geometry.full_block');
    expect(b.components['minecraft:material_instances']['*'].texture).toBe('bc_bloc_rubis');
    expect(b.components['minecraft:light_emission']).toBe(7);
    expect(b.components['minecraft:loot']).toBe('loot_tables/bc/butin_rubis.json');
    expect(get('RP/textures/terrain_texture.json').texture_data.bc_bloc_rubis.textures).toBe('textures/blocks/bc_bloc_rubis');
    expect(get('RP/blocks.json')['bc:bloc_rubis'].sound).toBe('metal');
  });
  it('genere la loot table (rolls, poids, quantites)', () => {
    const l = get('BP/loot_tables/bc/butin_rubis.json');
    expect(l.pools[0].rolls).toEqual({ min: 1, max: 2 });
    expect(l.pools[0].entries[0]).toMatchObject({ type: 'item', name: 'bc:rubis', weight: 3 });
    expect(l.pools[0].entries[0].functions[0].count).toEqual({ min: 1, max: 3 });
  });
  it('genere le mob depuis le zombie officiel avec ses reglages', () => {
    const e = get('BP/entities/roi_zombie.json')['minecraft:entity'];
    expect(e.description.identifier).toBe('bc:roi_zombie');
    expect(e.description.runtime_identifier).toBeUndefined();   // sans runtime_identifier -> l'oeuf custom apparait
    expect(e.components['minecraft:health']).toEqual({ value: 200, max: 200 });
    expect(e.components['minecraft:attack'].damage).toBe(12);
    expect(e.components['minecraft:scale']).toEqual({ value: 1.8 });
    expect(e.components['minecraft:boss'].name).toBe('Roi Zombie');
    expect(e.components['minecraft:loot'].table).toBe('loot_tables/bc/butin_rubis.json');
    const c = get('RP/entity/roi_zombie.entity.json')['minecraft:client_entity'].description;
    expect(c.identifier).toBe('bc:roi_zombie');
    expect(c.textures.default).toBe('textures/entity/bc/roi_zombie');
    expect(c.spawn_egg).toEqual({ texture: 'bc_roi_zombie_egg' });
    expect(c.materials).toEqual({ default: 'entity_alphatest' });   // mob autonome comme les add-ons qui marchent
    expect(c.geometry.default).toBe('geometry.bc.roi_zombie');   // vraie icone d'oeuf
    const sp = get('BP/spawn_rules/roi_zombie.json')['minecraft:spawn_rules'];
    expect(sp.description.identifier).toBe('bc:roi_zombie');
    expect(JSON.stringify(sp)).toContain('"default":5');
    expect(get('RP/sounds.json').entity_sounds.entities['bc:roi_zombie'].events.ambient).toBe('mob.zombie.say');
    expect(res.files.some((f) => f.path === 'RP/textures/entity/bc/roi_zombie.png')).toBe(true);
  });
  it('les noms en jeu sont dans le fichier de langue', () => {
    const lang = res.files.find((f) => f.path === 'RP/texts/fr_FR.lang')!.content.toString();
    expect(lang).toContain('tile.bc:bloc_rubis.name=Bloc de rubis');
    expect(lang).toContain('entity.bc:roi_zombie.name=Roi Zombie');
  });
  it('tous les mobs de base se generent sans erreur', async () => {
    const { listMobBases } = await import('../src/core/generators/bedrock/mob.js');
    const bases = listMobBases();
    expect(bases.length).toBeGreaterThan(10);
    for (const b of bases) {
      const p = { ...exampleProject, mobs: [{ ...exampleProject.mobs[0], base: b.base, identifier: `bc:test_${b.base}` }] };
      const r = buildAddon(p, null);
      expect(r.files.some((f) => f.path === `BP/entities/test_${b.base}.json`)).toBe(true);
    }
  });
});

describe('outil et minage 3x3', () => {
  it('une pioche 3x3 devient un vrai outil et ajoute le script', async () => {
    const { buildAddon } = await import('../src/core/generators/bedrock/pack.js');
    const { exampleProject } = await import('../src/core/examples/generateExample.js');
    const p: any = structuredClone(exampleProject);
    p.items.push({ id: 'p1', identifier: 'bc:pioche', displayName: 'Pioche', kind: 'tool', category: 'equipment', rarity: 'common', lore: [], maxStackSize: 1, durability: 1500, toolType: 'pickaxe', mine3x3: true });
    const r = buildAddon(p, null);
    const it = JSON.parse(r.files.find((f) => f.path === 'BP/items/pioche.json')!.content.toString())['minecraft:item'].components;
    expect(it['minecraft:tags'].tags).toContain('minecraft:is_pickaxe');
    expect(it['minecraft:digger'].destroy_speeds[0].speed).toBe(8);
    const man = JSON.parse(r.files.find((f) => f.path === 'BP/manifest.json')!.content.toString());
    expect(man.modules.some((m: any) => m.type === 'script')).toBe(true);
    expect(man.dependencies.some((d: any) => d.module_name === '@minecraft/server')).toBe(true);
    expect(r.files.find((f) => f.path === 'BP/scripts/main.js')!.content.toString()).toContain('"bc:pioche"');
  });
  it('sans 3x3 : pas de script', async () => {
    const { buildAddon } = await import('../src/core/generators/bedrock/pack.js');
    const { exampleProject } = await import('../src/core/examples/generateExample.js');
    const r = buildAddon(structuredClone(exampleProject) as any, null);
    expect(r.files.some((f) => f.path === 'BP/scripts/main.js')).toBe(false);
  });
});
