// Generateur d'ITEM Bedrock : transforme un Item (studio) en JSON de behavior pack.
// Retourne aussi la liste des AVERTISSEMENTS (champs non supportes en vanilla Bedrock),
// pour ne JAMAIS faire croire qu'une propriete marche alors qu'elle est ignoree par le jeu.
import { Item, Project } from '../../types.js';

export const TOOL_TAGS: Record<string, { item: string; blocks: string; enchant: string }> = {
  pickaxe: { item: 'minecraft:is_pickaxe', blocks: 'minecraft:is_pickaxe_item_destructible', enchant: 'pickaxe' },
  axe: { item: 'minecraft:is_axe', blocks: 'minecraft:is_axe_item_destructible', enchant: 'axe' },
  shovel: { item: 'minecraft:is_shovel', blocks: 'minecraft:is_shovel_item_destructible', enchant: 'shovel' },
  hoe: { item: 'minecraft:is_hoe', blocks: 'minecraft:is_hoe_item_destructible', enchant: 'hoe' },
};

export interface ItemGenResult {
  json: Record<string, unknown>;
  warnings: string[];
  textureKey: string;
}

export function generateItemJson(item: Item, project: Project): ItemGenResult {
  const warnings: string[] = [];
  const textureKey = item.textureKey || item.identifier.split(':')[1];

  const components: Record<string, unknown> = {
    'minecraft:icon': textureKey,
    'minecraft:display_name': { value: item.displayName },
  };

  // pile max : les objets a durabilite ne s'empilent pas
  const durableKinds = item.kind === 'tool' || item.kind === 'weapon' || item.kind === 'armor';
  components['minecraft:max_stack_size'] = durableKinds ? 1 : item.maxStackSize;

  if (item.kind === 'food') {
    components['minecraft:food'] = {
      nutrition: item.nutrition ?? 4,
      saturation_modifier: item.saturation ?? 0.6,
      can_always_eat: item.canAlwaysEat ?? false,
    };
    components['minecraft:use_modifiers'] = { use_duration: 1.6, movement_modifier: 0.35 };
    components['minecraft:use_animation'] = 'eat';
  }

  if (item.kind === 'tool' || item.kind === 'weapon') {
    components['minecraft:hand_equipped'] = true;
    if (item.attackDamage != null) components['minecraft:damage'] = item.attackDamage;
    if (item.durability != null) components['minecraft:durability'] = { max_durability: item.durability };
    const tt = item.kind === 'tool' ? item.toolType : undefined;
    if (tt && tt !== 'none') {
      const T = TOOL_TAGS[tt];
      // tags de l'outil + niveau diamant : sans ca le jeu ne le reconnait pas (pierre/minerais ne lachent rien)
      components['minecraft:tags'] = { tags: [T.item, 'minecraft:diamond_tier'] };
      components['minecraft:digger'] = {
        use_efficiency: true,
        destroy_speeds: [{ block: { tags: `query.any_tag('${T.blocks}')` }, speed: item.miningSpeed ?? 8 }],
      };
      components['minecraft:enchantable'] = { slot: T.enchant, value: 10 };
    }
    if (item.mine3x3 && (!tt || tt === 'none')) warnings.push("Minage 3x3 coche mais pas de type d'outil : choisis Pioche/Hache/Pelle/Houe.");
  }

  if (item.kind === 'armor') {
    if (!item.armorSlot) warnings.push("Armure sans slot : aucun emplacement d'equipement defini.");
    components['minecraft:wearable'] = { slot: item.armorSlot ?? 'slot.armor.chest', protection: item.protection ?? 2 };
    if (item.durability != null) components['minecraft:durability'] = { max_durability: item.durability };
    components['minecraft:armor'] = { protection: item.protection ?? 2 };
    warnings.push(
      "Armure Bedrock : la texture PORTEE (sur le joueur) demande un modele d'armure supplementaire, non encore genere. L'icone d'inventaire fonctionne.",
    );
  }

  if (item.foilEnchantGlint) components['minecraft:glint'] = true;

  // champs demandes mais non supportes tels quels par Bedrock vanilla -> on previent
  if (item.lore.length > 0) {
    warnings.push(
      'Le lore (texte sous le nom) n\'a pas de composant vanilla Bedrock pour les items : il n\'est pas ecrit dans le jeu (seul le nom affiche fonctionne).',
    );
  }
  if (item.isFireResistant) {
    warnings.push("'Resistant au feu' n'existe pas comme composant d'item Bedrock vanilla : ignore.");
  }

  const json = {
    format_version: project.formatVersion,
    'minecraft:item': {
      description: {
        identifier: item.identifier,
        menu_category: { category: item.category },
      },
      components,
    },
  };

  return { json, warnings, textureKey };
}
