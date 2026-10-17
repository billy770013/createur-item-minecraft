// Minecraft Creator Studio — modeles de donnees valides (Bedrock Add-ons)
// Tout le contenu cible Minecraft BEDROCK : behavior pack + resource pack.
import { z } from 'zod';

// --- identifiants Bedrock : namespace:nom, minuscules, sans espace ---
export const BedrockIdentifier = z
  .string()
  .regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/, 'Identifiant invalide (ex: bc:rubis)');

// menu_category.category : onglet de l'inventaire creatif
export const CreativeCategory = z.enum(['construction', 'nature', 'equipment', 'items']);

// rarete (purement cosmetique cote studio : couleur du lore)
export const Rarity = z.enum(['common', 'uncommon', 'rare', 'epic']);

// --- composants supportes par type d'item (ce que Bedrock sait VRAIMENT faire) ---
export const ItemKind = z.enum([
  'generic', // objet simple empilable
  'food',    // consommable (mange)
  'tool',    // outil durable (pioche/hache/pelle) -> degats + durabilite
  'weapon',  // epee -> degats + durabilite
  'armor',   // porte sur un slot (wearable)
]);

export const ArmorSlot = z.enum(['slot.armor.head', 'slot.armor.chest', 'slot.armor.legs', 'slot.armor.feet']);

export const ItemSchema = z.object({
  id: z.string(),                       // id interne studio (uuid)
  identifier: BedrockIdentifier,        // ex: bc:rubis
  displayName: z.string().min(1),       // "Rubis"
  kind: ItemKind.default('generic'),
  category: CreativeCategory.default('items'),
  rarity: Rarity.default('common'),
  lore: z.array(z.string()).default([]),
  maxStackSize: z.number().int().min(1).max(64).default(64),

  // texture : nom court (cle item_texture) + nom de fichier png dans le RP
  textureKey: z.string().regex(/^[a-z0-9_]+$/).optional(),
  textureFile: z.string().optional(),   // ex: rubis.png (fichier fourni par l'utilisateur)

  // food
  nutrition: z.number().int().min(0).max(20).optional(),
  saturation: z.number().min(0).max(20).optional(),
  canAlwaysEat: z.boolean().optional(),

  // tool / weapon
  attackDamage: z.number().int().min(0).max(1000).optional(),
  durability: z.number().int().min(1).max(10000).optional(),
  // outil : vraie pioche/hache/pelle/houe (vitesse + recolte niveau diamant + enchantable)
  toolType: z.enum(['none', 'pickaxe', 'axe', 'shovel', 'hoe']).optional(),
  miningSpeed: z.number().min(1).max(100).optional(),   // vanilla : bois 2, pierre 4, fer 6, diamant 8, netherite 9
  mine3x3: z.boolean().optional(),                     // casse aussi les blocs autour (script)
  mineSize: z.number().int().min(3).max(5).optional(), // 3 = 3x3, 5 = 5x5
  mineOnlyTool: z.boolean().optional(),                // true = seulement les blocs de l'outil ; sinon TOUS les blocs (Billy)
  veinMine: z.boolean().optional(),                    // pioche : tout le filon de minerai
  treeFell: z.boolean().optional(),                    // hache : tout l'arbre
  autoSmelt: z.boolean().optional(),                   // minerais -> lingots, sable -> verre...
  // pouvoirs au coup (armes/outils/objets)
  hitEffect: z.string().regex(/^[a-z_]*$/).optional(), hitEffectSeconds: z.number().min(1).max(600).optional(), hitEffectLevel: z.number().int().min(1).max(10).optional(),
  hitFire: z.number().min(0).max(60).optional(),       // secondes de feu sur la cible
  lifeSteal: z.number().min(0).max(100).optional(),    // % des degats rendus en vie
  hitLightning: z.number().min(0).max(100).optional(), // % de chance d'eclair
  // effet tant que l'objet est tenu en main
  heldEffect: z.string().regex(/^[a-z_]*$/).optional(), heldEffectLevel: z.number().int().min(1).max(10).optional(),
  // armure : effet tant qu'elle est portee
  wornEffect: z.string().regex(/^[a-z_]*$/).optional(), wornEffectLevel: z.number().int().min(1).max(10).optional(),
  // nourriture : effet en mangeant
  eatEffect: z.string().regex(/^[a-z_]*$/).optional(), eatEffectSeconds: z.number().min(1).max(600).optional(), eatEffectLevel: z.number().int().min(1).max(10).optional(),
  // pouvoir au clic droit
  useAbility: z.enum(['none', 'teleport', 'fireball', 'heal', 'leap', 'lightning']).optional(),
  useCooldown: z.number().min(0).max(600).optional(),  // secondes

  // armor
  armorSlot: ArmorSlot.optional(),
  protection: z.number().int().min(0).max(30).optional(),

  // divers
  foilEnchantGlint: z.boolean().optional(), // effet enchante (glint)
  isFireResistant: z.boolean().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

// --- recette de craft (shaped/shapeless) ---
export const RecipeSchema = z.object({
  id: z.string(),
  identifier: BedrockIdentifier,
  type: z.enum(['shaped', 'shapeless']).default('shaped'),
  // shaped : 3 lignes de 3, chaque case = identifiant item/bloc ou '' (vide)
  grid: z.array(z.array(z.string())).optional(),
  // shapeless : liste d'ingredients
  ingredients: z.array(z.string()).optional(),
  resultItem: z.string(),               // identifiant du resultat
  resultCount: z.number().int().min(1).max(64).default(1),
});
export type Recipe = z.infer<typeof RecipeSchema>;


// --- BLOC custom (vrai bloc enregistre par le behavior pack) ---
export const BlockSound = z.enum(['stone', 'wood', 'grass', 'gravel', 'sand', 'glass', 'metal', 'cloth', 'snow', 'normal']);
export const RenderMethod = z.enum(['opaque', 'alpha_test', 'blend']);
export const BlockSchema = z.object({
  id: z.string(),
  identifier: BedrockIdentifier,
  displayName: z.string().min(1),
  category: CreativeCategory.default('construction'),
  textureFile: z.string().optional(),
  hardness: z.number().min(0).max(100).default(1.5),            // secondes pour le casser a la main
  explosionResistance: z.number().min(0).max(3600).default(6),
  lightEmission: z.number().int().min(0).max(15).default(0),
  friction: z.number().min(0).max(0.9).default(0.4),
  renderMethod: RenderMethod.default('opaque'),
  flammable: z.boolean().default(false),
  mapColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#888888'),
  sound: BlockSound.default('stone'),
  lootTable: z.string().default(''),                              // nom d'une loot table du projet, '' = se drop lui-meme
  gravity: z.boolean().default(false),                            // non supporte en vanilla -> avertissement
});
export type Block = z.infer<typeof BlockSchema>;

// --- LOOT TABLE ---
export const LootEntrySchema = z.object({
  item: z.string(),                         // identifiant (minecraft:... ou ns:...)
  weight: z.number().int().min(1).max(1000).default(1),
  countMin: z.number().int().min(1).max(64).default(1),
  countMax: z.number().int().min(1).max(64).default(1),
});
export const LootPoolSchema = z.object({
  rollsMin: z.number().int().min(0).max(64).default(1),
  rollsMax: z.number().int().min(0).max(64).default(1),
  entries: z.array(LootEntrySchema).default([]),
  killedByPlayer: z.boolean().default(false),
  chance: z.number().min(0).max(1).default(1),
});
export const LootTableSchema = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-z0-9_]+$/, 'Nom en minuscules sans espace'),
  pools: z.array(LootPoolSchema).default([]),
});
export type LootTable = z.infer<typeof LootTableSchema>;

// --- SON ---
export const SoundCategory = z.enum(['neutral', 'hostile', 'player', 'block', 'ambient', 'music', 'record', 'weather', 'ui']);
export const SoundSchema = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-z0-9_]+$/, 'Nom en minuscules sans espace'),
  file: z.string(),                         // fichier stocke (.ogg ou .wav)
  category: SoundCategory.default('neutral'),
  volume: z.number().min(0).max(4).default(1),
  pitch: z.number().min(0.1).max(4).default(1),
});
export type Sound = z.infer<typeof SoundSchema>;

// --- MOB (base sur un mob vanilla officiel : garde son IA et ses animations) ---
export const MobSchema = z.object({
  id: z.string(),
  identifier: BedrockIdentifier,
  displayName: z.string().min(1),
  base: z.string(),                         // ex: zombie, pig (voir src/core/vanilla/mobs/index.json)
  health: z.number().int().min(1).max(10000).default(20),
  attackDamage: z.number().int().min(0).max(1000).optional(),
  speedFactor: z.number().min(0.1).max(5).default(1),   // x vitesse de base
  scale: z.number().min(0.1).max(10).default(1),
  textureFile: z.string().optional(),       // sinon texture du mob de base
  lootTable: z.string().default(''),        // '' = butin du mob de base
  burnsInDaylight: z.boolean().default(true),  // false = ne brule plus au soleil (zombies, squelettes...)
  // runtime_identifier = capacites CODEES EN DUR du mob de base (explosion du creeper, boules de feu du blaze...).
  // MAIS Bedrock supprime l'oeuf personnalise quand runtime_identifier pointe sur un mob vanilla.
  // Par defaut FALSE : pas de runtime_identifier -> l'oeuf du mob custom apparait dans le creatif,
  // et le mob reste fonctionnel (son IA de base est deja copiee dans les composants). TRUE = capacites
  // speciales mais plus d'oeuf custom (utiliser /summon).
  keepBaseBehavior: z.boolean().default(false),
  isBoss: z.boolean().default(false),
  bossDarkenSky: z.boolean().default(false),
  spawnNaturally: z.boolean().default(false),
  spawnWeight: z.number().int().min(1).max(1000).optional(),
  eggBase: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3a7d44'),
  eggOverlay: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#a8f2c2'),
  soundAmbient: z.string().default(''),     // nom d'un son du projet
  soundHurt: z.string().default(''),
  soundDeath: z.string().default(''),
});
export type Mob = z.infer<typeof MobSchema>;


// --- SKIN de joueur (pack de skins importable dans Minecraft, porte depuis le profil) ---
export const SkinModel = z.enum(['wide', 'slim']);   // wide = Steve (bras 4px), slim = Alex (bras 3px)
export const SkinSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  model: SkinModel.default('wide'),
  textureFile: z.string().optional(),   // PNG 64x64 ; sinon Steve/Alex de depart
});
export type Skin = z.infer<typeof SkinSchema>;

// --- projet (un add-on complet) ---
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  namespace: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Namespace invalide (minuscules)'),
  mcVersion: z.string().default('1.21.0'),        // version Bedrock cible
  formatVersion: z.string().default('1.21.40'),   // format_version des fichiers item
  description: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(ItemSchema).default([]),
  recipes: z.array(RecipeSchema).default([]),
  blocks: z.array(BlockSchema).default([]),
  mobs: z.array(MobSchema).default([]),
  lootTables: z.array(LootTableSchema).default([]),
  sounds: z.array(SoundSchema).default([]),
  skins: z.array(SkinSchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export const RARITY_COLOR: Record<string, string> = {
  common: '§f',   // blanc
  uncommon: '§e', // jaune
  rare: '§b',     // cyan
  epic: '§d',     // magenta
};
