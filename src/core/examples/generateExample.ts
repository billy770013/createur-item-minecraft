// Genere un add-on d'exemple sur disque : dist/exports/exemple_rubis/{BP,RP}
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Project } from '../types.js';
import { buildAddon } from '../generators/bedrock/pack.js';

const now = new Date().toISOString();

export const exampleProject: Project = {
  id: 'example',
  name: 'Exemple Rubis',
  namespace: 'bc',
  mcVersion: '1.21.0',
  formatVersion: '1.21.40',
  description: 'Add-on de demonstration genere par Minecraft Creator Studio',
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: 'i1', identifier: 'bc:rubis', displayName: '§cRubis', kind: 'generic',
      category: 'items', rarity: 'rare', lore: ['Une gemme rouge eclatante'], maxStackSize: 64,
    },
    {
      id: 'i2', identifier: 'bc:epee_rubis', displayName: '§cEpee de Rubis', kind: 'weapon',
      category: 'equipment', rarity: 'epic', lore: [], maxStackSize: 1,
      attackDamage: 9, durability: 1800, foilEnchantGlint: true,
    },
    {
      id: 'i3', identifier: 'bc:bonbon', displayName: '§dBonbon', kind: 'food',
      category: 'items', rarity: 'common', lore: [], maxStackSize: 16,
      nutrition: 6, saturation: 0.8, canAlwaysEat: true,
    },
  ],
  recipes: [
    {
      id: 'r1', identifier: 'bc:epee_rubis_craft', type: 'shaped',
      grid: [['', 'bc:rubis', ''], ['', 'bc:rubis', ''], ['', 'minecraft:stick', '']],
      ingredients: [], resultItem: 'bc:epee_rubis', resultCount: 1,
    },
  ],
  blocks: [
    {
      id: 'b1', identifier: 'bc:bloc_rubis', displayName: 'Bloc de rubis', category: 'construction',
      hardness: 3, explosionResistance: 6, lightEmission: 7, friction: 0.4, renderMethod: 'opaque',
      flammable: false, mapColor: '#d83a3a', sound: 'metal', lootTable: 'butin_rubis', gravity: false,
    },
  ],
  mobs: [
    {
      id: 'm1', identifier: 'bc:roi_zombie', displayName: 'Roi Zombie', base: 'zombie',
      health: 200, attackDamage: 12, speedFactor: 1.2, scale: 1.8, lootTable: 'butin_rubis',
      burnsInDaylight: false, keepBaseBehavior: false, isBoss: true, bossDarkenSky: true, spawnNaturally: true, spawnWeight: 5,
      eggBase: '#2e5c2e', eggOverlay: '#d83a3a', soundAmbient: '', soundHurt: '', soundDeath: '',
    },
  ],
  lootTables: [
    {
      id: 'l1', name: 'butin_rubis',
      pools: [
        { rollsMin: 1, rollsMax: 2, killedByPlayer: false, chance: 1,
          entries: [ { item: 'bc:rubis', weight: 3, countMin: 1, countMax: 3 }, { item: 'minecraft:diamond', weight: 1, countMin: 1, countMax: 1 } ] },
      ],
    },
  ],
  sounds: [],
  skins: [],
};

export function writeExample(outDir: string) {
  const res = buildAddon(exampleProject, null);
  for (const f of res.files) {
    const full = join(outDir, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
  }
  return res;
}

// execution directe
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = join(process.cwd(), 'dist', 'exports', 'exemple_rubis');
  const res = writeExample(out);
  console.log(`Add-on ecrit dans ${out}`);
  console.log(`Items: ${res.stats.items} | Recettes: ${res.stats.recipes} | Textures: ${res.stats.textures}`);
  console.log(`Fichiers: ${res.files.length}`);
  if (res.warnings.length) {
    console.log('\nAvertissements:');
    for (const w of res.warnings) console.log('  - ' + w);
  }
}
