// Script du behavior pack (API @minecraft/server 2.1.0, comme les autres add-ons de BillyCraft).
// POUVOIRS DES ITEMS : minage 3x3/5x5, veine de minerai, abattage d'arbre, auto-fonte, effets au coup, feu,
// vol de vie, eclair, effet en main / porte / mange, pouvoir au clic droit (avec recharge).
// Les blocs mines en plus donnent les vrais objets (/loot ... mine ... mainhand : fortune et toucher de soie
// respectes). Accroupi = minage normal. Jamais : bedrock, blocs speciaux, conteneurs (coffres...), liquides.
import { Item } from '../../types.js';
import { TOOL_TAGS } from './item.js';

export const SCRIPT_API_VERSION = '2.1.0';

/** Configuration des pouvoirs d'un item pour le script (null = aucun pouvoir). */
export function powersOf(i: Item): Record<string, unknown> | null {
  const c: Record<string, any> = {};
  const tool = i.kind === 'tool' && i.toolType && i.toolType !== 'none' ? i.toolType : null;
  if (tool) {
    if (i.mine3x3) { c.size = i.mineSize === 5 ? 5 : 3; if (i.mineOnlyTool) c.only = true; }
    if (tool === 'pickaxe' && i.veinMine) c.vein = true;
    if (tool === 'axe' && i.treeFell) c.tree = true;
    if (i.autoSmelt) c.smelt = true;
    if (c.size || c.vein || c.tree) c.tag = TOOL_TAGS[tool].blocks;
  }
  if (i.kind !== 'armor' && i.kind !== 'food') {
    const hit: Record<string, unknown> = {};
    if (i.hitEffect) Object.assign(hit, { effect: i.hitEffect, sec: i.hitEffectSeconds ?? 5, lvl: i.hitEffectLevel ?? 1 });
    if (i.hitFire) hit.fire = i.hitFire;
    if (i.lifeSteal) hit.steal = i.lifeSteal;
    if (i.hitLightning) hit.light = i.hitLightning;
    if (Object.keys(hit).length) c.hit = hit;
    if (i.heldEffect) c.held = { effect: i.heldEffect, lvl: i.heldEffectLevel ?? 1 };
    if (i.useAbility && i.useAbility !== 'none') c.use = { type: i.useAbility, cd: i.useCooldown ?? 3 };
  }
  if (i.kind === 'armor' && i.wornEffect) c.worn = { effect: i.wornEffect, lvl: i.wornEffectLevel ?? 1 };
  if (i.kind === 'food' && i.eatEffect) c.eat = { effect: i.eatEffect, sec: i.eatEffectSeconds ?? 10, lvl: i.eatEffectLevel ?? 1 };
  return Object.keys(c).length ? c : null;
}

export function needsScript(items: Item[]): boolean {
  return items.some((i) => powersOf(i) !== null);
}

export function generateMainScript(items: Item[]): string {
  const cfg: Record<string, unknown> = {};
  for (const i of items) { const p = powersOf(i); if (p) cfg[i.identifier] = p; }
  return `// Genere par Minecraft Creator Studio - pouvoirs des items
import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

const CFG = ${JSON.stringify(cfg)};
const INTERDITS = new Set(["minecraft:bedrock", "minecraft:barrier", "minecraft:command_block", "minecraft:chain_command_block",
  "minecraft:repeating_command_block", "minecraft:structure_block", "minecraft:jigsaw", "minecraft:end_portal_frame",
  "minecraft:reinforced_deepslate", "minecraft:light_block", "minecraft:spawner", "minecraft:mob_spawner", "minecraft:trial_spawner", "minecraft:vault"]);
const FONTE = { "minecraft:raw_iron": "minecraft:iron_ingot", "minecraft:raw_gold": "minecraft:gold_ingot",
  "minecraft:raw_copper": "minecraft:copper_ingot", "minecraft:cobblestone": "minecraft:stone", "minecraft:sand": "minecraft:glass",
  "minecraft:red_sand": "minecraft:glass", "minecraft:cobbled_deepslate": "minecraft:deepslate", "minecraft:ancient_debris": "minecraft:netherite_scrap",
  "minecraft:clay_ball": "minecraft:brick", "minecraft:netherrack": "minecraft:netherbrick", "minecraft:raw_iron_block": "minecraft:iron_block",
  "minecraft:raw_gold_block": "minecraft:gold_block", "minecraft:raw_copper_block": "minecraft:copper_block" };
const MAX_VEINE = 64, MAX_ARBRE = 150;

const creatif = (p) => String(p.getGameMode()).toLowerCase() === "creative";
const equip = (p) => { try { return p.getComponent("minecraft:equippable"); } catch { return undefined; } };
const enMain = (p) => { const e = equip(p); try { return e && e.getEquipment(EquipmentSlot.Mainhand); } catch { return undefined; } };
const effet = (e, id, ticks, lvl) => { try { e.addEffect(id, ticks, { amplifier: Math.max(0, (lvl || 1) - 1), showParticles: false }); } catch { } };
const cle = (l) => l.x + "," + l.y + "," + l.z;
const recents = [];   // blocs casses avec auto-fonte (pour transformer les objets qui en tombent)

function casser(player, dim, p, cr, c) {
  if (c.smelt && !cr) recents.push({ d: dim.id, x: p.x, y: p.y, z: p.z, t: system.currentTick });
  if (!cr) player.runCommand(\`loot spawn \${p.x + 0.5} \${p.y + 0.5} \${p.z + 0.5} mine \${p.x} \${p.y} \${p.z} mainhand\`);
  dim.runCommand(\`setblock \${p.x} \${p.y} \${p.z} air\`);
}
function cassable(bl) {
  return bl && !bl.isAir && !bl.isLiquid && !INTERDITS.has(bl.typeId) && !bl.getComponent("minecraft:inventory");
}
function bloc(dim, p) { try { return dim.getBlock(p); } catch { return undefined; } }
// casse tous les blocs RELIES du meme type (filon / arbre)
function propager(player, dim, depart, type, max, cr, c) {
  const vus = new Set([cle(depart)]), file = [depart]; let n = 0;
  while (file.length && n < max) {
    const q = file.shift();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const p = { x: q.x + dx, y: q.y + dy, z: q.z + dz }, k = cle(p);
      if (vus.has(k) || n >= max) continue; vus.add(k);
      const bl = bloc(dim, p);
      if (!bl || bl.typeId.replace("lit_", "") !== type || !cassable(bl)) continue;
      try { casser(player, dim, p, cr, c); n++; file.push(p); } catch { }
    }
  }
  return n;
}
function user(player, n) {
  if (n <= 0 || creatif(player)) return;
  try {
    const eq = equip(player), outil = eq.getEquipment(EquipmentSlot.Mainhand);
    const dur = outil && outil.getComponent("minecraft:durability");
    if (!dur) return;
    const nouv = dur.damage + n;
    if (nouv >= dur.maxDurability) { eq.setEquipment(EquipmentSlot.Mainhand, undefined); player.playSound("random.break"); }
    else { dur.damage = nouv; eq.setEquipment(EquipmentSlot.Mainhand, outil); }
  } catch { }
}

// ---------- minage : 3x3 / 5x5, veine, arbre, auto-fonte ----------
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const player = ev.player, item = ev.itemStackBeforeBreak;
  const c = item && CFG[item.typeId];
  if (!c) return;
  const cr = creatif(player), dim = ev.block.dimension, b = ev.block.location;
  if (c.smelt && !cr) recents.push({ d: dim.id, x: b.x, y: b.y, z: b.z, t: system.currentTick });
  if (player.isSneaking) return;
  const type = ev.brokenBlockPermutation.type.id.replace("lit_", "");
  let n = 0;
  if (c.vein && (/_ore$/.test(type) || type === "minecraft:ancient_debris")) n = propager(player, dim, b, type, MAX_VEINE, cr, c);
  else if (c.tree && /(_log|_stem|_wood|_hyphae)$/.test(type)) n = propager(player, dim, b, type, MAX_ARBRE, cr, c);
  else if (c.size) {
    const r = (c.size - 1) / 2, v = player.getViewDirection();
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    const pos = ay >= ax && ay >= az ? (a, d) => ({ x: b.x + a, y: b.y, z: b.z + d })
      : ax >= az ? (a, d) => ({ x: b.x, y: b.y + a, z: b.z + d })
      : (a, d) => ({ x: b.x + a, y: b.y + d, z: b.z });
    for (let a = -r; a <= r; a++) for (let d = -r; d <= r; d++) {
      if (a === 0 && d === 0) continue;
      const p = pos(a, d), bl = bloc(dim, p);
      if (!cassable(bl) || (c.only && !bl.hasTag(c.tag))) continue;   // par defaut : TOUS les blocs
      try { casser(player, dim, p, cr, c); n++; } catch { }
    }
  }
  user(player, n);
});

// auto-fonte : les objets qui tombent des blocs casses sont remplaces par leur version cuite
world.afterEvents.entitySpawn.subscribe((ev) => {
  if (!recents.length) return;
  const e = ev.entity;
  try { if (e.typeId !== "minecraft:item") return; } catch { return; }
  const now = system.currentTick;
  while (recents.length && now - recents[0].t > 4) recents.shift();
  let it; try { it = e.getComponent("minecraft:item").itemStack; } catch { return; }
  const vers = FONTE[it.typeId]; if (!vers) return;
  const l = e.location, d = e.dimension;
  if (!recents.some((r) => r.d === d.id && Math.abs(r.x + 0.5 - l.x) < 2 && Math.abs(r.y + 0.5 - l.y) < 2 && Math.abs(r.z + 0.5 - l.z) < 2)) return;
  const n = it.amount;
  try { e.remove(); d.spawnItem(new ItemStack(vers, n), l); } catch { }
});

// ---------- au coup : effet, feu, vol de vie, eclair ----------
world.afterEvents.entityHurt.subscribe((ev) => {
  const src = ev.damageSource, a = src && src.damagingEntity, v = ev.hurtEntity;
  if (!a || a.typeId !== "minecraft:player" || src.cause !== "entityAttack" || !v || !v.isValid) return;
  const it = enMain(a), c = it && CFG[it.typeId];
  if (!c || !c.hit) return;
  const h = c.hit;
  if (h.effect) effet(v, h.effect, Math.round(h.sec * 20), h.lvl);
  if (h.fire) { try { v.setOnFire(h.fire, true); } catch { } }
  if (h.steal) { try { const hp = a.getComponent("minecraft:health"); hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + ev.damage * h.steal / 100)); } catch { } }
  if (h.light && Math.random() * 100 < h.light) { try { v.dimension.spawnEntity("minecraft:lightning_bolt", v.location); } catch { } }
});

// ---------- effets en main / armure portee (toutes les secondes) ----------
const SLOTS_ARMURE = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const eq = equip(p); if (!eq) continue;
    try {
      const m = eq.getEquipment(EquipmentSlot.Mainhand), cm = m && CFG[m.typeId];
      if (cm && cm.held) effet(p, cm.held.effect, cm.held.effect === "night_vision" ? 260 : 40, cm.held.lvl);
      for (const s of SLOTS_ARMURE) {
        const a = eq.getEquipment(s), ca = a && CFG[a.typeId];
        if (ca && ca.worn) effet(p, ca.worn.effect, ca.worn.effect === "night_vision" ? 260 : 40, ca.worn.lvl);
      }
    } catch { }
  }
}, 20);

// ---------- nourriture : effet en mangeant ----------
world.afterEvents.itemCompleteUse.subscribe((ev) => {
  const c = ev.itemStack && CFG[ev.itemStack.typeId];
  if (c && c.eat) effet(ev.source, c.eat.effect, Math.round(c.eat.sec * 20), c.eat.lvl);
});

// ---------- pouvoir au clic droit (avec recharge) ----------
const recharge = new Map();
world.afterEvents.itemUse.subscribe((ev) => {
  const p = ev.source, it = ev.itemStack, c = it && CFG[it.typeId];
  if (!c || !c.use) return;
  const now = system.currentTick, k = p.id + it.typeId, fin = recharge.get(k) || 0;
  if (fin > now) { try { p.onScreenDisplay.setActionBar("§cRecharge : " + Math.ceil((fin - now) / 20) + " s"); } catch { } return; }
  let ok = true;
  try {
    const v = p.getViewDirection(), dim = p.dimension;
    switch (c.use.type) {
      case "teleport": {
        const hit = p.getBlockFromViewDirection({ maxDistance: 48 });
        if (!hit) { ok = false; break; }
        const l = hit.block.location;
        const off = { Up: [0, 1, 0], Down: [0, -2, 0], North: [0, 0, -1], South: [0, 0, 1], West: [-1, 0, 0], East: [1, 0, 0] }[hit.face] || [0, 1, 0];
        p.teleport({ x: l.x + 0.5 + off[0], y: l.y + off[1], z: l.z + 0.5 + off[2] });
        p.playSound("mob.endermen.portal");
        break;
      }
      case "fireball": {
        const h = p.getHeadLocation();
        const fb = dim.spawnEntity("minecraft:small_fireball", { x: h.x + v.x * 1.5, y: h.y + v.y * 1.5, z: h.z + v.z * 1.5 });
        const pr = fb.getComponent("minecraft:projectile");
        if (pr) { pr.owner = p; pr.shoot({ x: v.x * 1.6, y: v.y * 1.6, z: v.z * 1.6 }); } else fb.applyImpulse({ x: v.x, y: v.y, z: v.z });
        break;
      }
      case "heal": {
        const hp = p.getComponent("minecraft:health");
        hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + 8)); effet(p, "regeneration", 60, 2);
        p.playSound("random.levelup");
        break;
      }
      case "leap": {
        try { p.applyKnockback({ x: v.x * 2.5, z: v.z * 2.5 }, 0.9); } catch { p.applyKnockback(v.x, v.z, 2.5, 0.9); }
        break;
      }
      case "lightning": {
        const hit = p.getBlockFromViewDirection({ maxDistance: 64 });
        if (!hit) { ok = false; break; }
        dim.spawnEntity("minecraft:lightning_bolt", hit.block.location);
        break;
      }
    }
  } catch { ok = false; }
  if (ok && c.use.cd > 0) recharge.set(k, now + Math.round(c.use.cd * 20));
});
`;
}
