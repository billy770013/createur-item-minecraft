// Generateur de BLOC custom Bedrock (vrai bloc enregistre) : BP blocks/*.json + entrees RP.
import { Block, Project } from '../../types.js';

export interface BlockGenResult {
  json: Record<string, unknown>;
  warnings: string[];
  textureKey: string;
  soundEntry: { sound: string };
}

export function lootPath(project: Project, name: string): string {
  return `loot_tables/${project.namespace}/${name}.json`;
}

export function generateBlockJson(block: Block, project: Project): BlockGenResult {
  const warnings: string[] = [];
  const name = block.identifier.split(':')[1];
  const textureKey = `${project.namespace}_${name}`;
  const components: Record<string, unknown> = {
    'minecraft:geometry': 'minecraft:geometry.full_block',
    'minecraft:material_instances': { '*': { texture: textureKey, render_method: block.renderMethod } },
    'minecraft:destructible_by_mining': { seconds_to_destroy: block.hardness },
    'minecraft:destructible_by_explosion': { explosion_resistance: block.explosionResistance },
    'minecraft:friction': block.friction,
    'minecraft:map_color': block.mapColor,
  };
  if (block.lightEmission > 0) components['minecraft:light_emission'] = block.lightEmission;
  if (block.renderMethod !== 'opaque') components['minecraft:light_dampening'] = 0;
  if (block.flammable) components['minecraft:flammable'] = { catch_chance_modifier: 5, destroy_chance_modifier: 20 };
  if (block.lootTable) {
    if (!project.lootTables.some((l) => l.name === block.lootTable)) {
      warnings.push(`Loot table "${block.lootTable}" introuvable dans le projet : le bloc se drop lui-meme.`);
    } else components['minecraft:loot'] = lootPath(project, block.lootTable);
  }
  if (block.gravity) {
    warnings.push("La gravite (bloc qui tombe comme le sable) n'existe pas pour les blocs custom en Bedrock vanilla : ignoree.");
  }
  if (!block.textureFile) warnings.push('Aucune texture : damier par defaut utilise.');

  return {
    json: {
      format_version: '1.21.60',
      'minecraft:block': {
        description: { identifier: block.identifier, menu_category: { category: block.category } },
        components,
      },
    },
    warnings,
    textureKey,
    soundEntry: { sound: block.sound },
  };
}
