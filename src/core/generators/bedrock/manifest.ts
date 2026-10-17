// Generation des manifest.json (behavior pack + resource pack) pour Bedrock.
import { randomUUID } from 'node:crypto';
import type { Project } from '../../types.js';

type Manifest = Record<string, unknown>;

function versionTuple(v: string): [number, number, number] {
  const p = v.split('.').map((n) => parseInt(n, 10));
  return [p[0] || 1, p[1] || 21, p[2] || 0];
}

export interface PackUuids {
  bpHeader: string;
  bpModule: string;
  rpHeader: string;
  rpModule: string;
  // numero d'installation : la version du pack devient [1,0,build]. Il DOIT changer a chaque installation,
  // sinon Minecraft garde l'ancien pack en cache (oeuf invisible, textures manquantes...).
  build?: number;
  scriptModule?: string;   // uuid du module de script (minage 3x3...)
}
export function packVersion(u: PackUuids): [number, number, number] {
  return [1, 0, u.build ?? 0];
}

export function newPackUuids(): PackUuids {
  return { bpHeader: randomUUID(), bpModule: randomUUID(), rpHeader: randomUUID(), rpModule: randomUUID(), scriptModule: randomUUID() };
}

export function behaviorManifest(p: Project, u: PackUuids, script?: { apiVersion: string }): Manifest {
  const min = versionTuple(p.mcVersion);
  const modules: unknown[] = [{ type: 'data', uuid: u.bpModule, version: packVersion(u) }];
  const dependencies: unknown[] = [{ uuid: u.rpHeader, version: packVersion(u) }];
  if (script) {
    modules.push({ type: 'script', language: 'javascript', uuid: u.scriptModule || randomUUID(), version: packVersion(u), entry: 'scripts/main.js' });
    dependencies.push({ module_name: '@minecraft/server', version: script.apiVersion });
  }
  return {
    format_version: 2,
    header: {
      name: `${p.name} (Comportement)`,
      description: p.description || `Add-on genere par Minecraft Creator Studio`,
      uuid: u.bpHeader,
      version: packVersion(u),
      min_engine_version: min,
    },
    modules,
    // le BP depend du RP (pour que les deux soient actives ensemble) + API de script si besoin
    dependencies,
  };
}

export function resourceManifest(p: Project, u: PackUuids): Manifest {
  const min = versionTuple(p.mcVersion);
  return {
    format_version: 2,
    header: {
      name: `${p.name} (Ressources)`,
      description: p.description || `Add-on genere par Minecraft Creator Studio`,
      uuid: u.rpHeader,
      version: packVersion(u),
      min_engine_version: min,
    },
    modules: [{ type: 'resources', uuid: u.rpModule, version: packVersion(u) }],
  };
}
