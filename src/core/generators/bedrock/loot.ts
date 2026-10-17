// Generateur de LOOT TABLE Bedrock (BP loot_tables/<ns>/<nom>.json).
import { LootTable, Project } from '../../types.js';

export function generateLootJson(table: LootTable, _project: Project): { json: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  if (table.pools.length === 0) warnings.push('Loot table vide : aucun groupe (pool).');
  const pools = table.pools.map((p, i) => {
    if (p.entries.length === 0) warnings.push(`Groupe ${i + 1} : aucun objet.`);
    const conditions: Record<string, unknown>[] = [];
    if (p.killedByPlayer) conditions.push({ condition: 'killed_by_player' });
    if (p.chance < 1) conditions.push({ condition: 'random_chance', chance: p.chance });
    const rollsMax = Math.max(p.rollsMin, p.rollsMax);
    const pool: Record<string, unknown> = {
      rolls: p.rollsMin === rollsMax ? p.rollsMin : { min: p.rollsMin, max: rollsMax },
      entries: p.entries.map((e) => {
        const max = Math.max(e.countMin, e.countMax);
        const entry: Record<string, unknown> = { type: 'item', name: e.item, weight: e.weight };
        if (e.countMin !== 1 || max !== 1) entry.functions = [{ function: 'set_count', count: { min: e.countMin, max } }];
        return entry;
      }),
    };
    if (conditions.length) pool.conditions = conditions;
    return pool;
  });
  return { json: { pools }, warnings };
}
