// Export (.mcaddon) et INSTALLATION sur le serveur BillyCraft.
// Securite : chemins valides uniquement, sauvegarde AVANT, 1 seul redemarrage (regle de Billy),
// jamais de redemarrage automatique sans confirmation.
import * as archiverNs from 'archiver';
const archiver: any = (archiverNs as any).default ?? archiverNs;
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Project } from '../core/types.js';
import { buildAddon, PackFile, TextureProvider } from '../core/generators/bedrock/pack.js';
import { newPackUuids, PackUuids, packVersion } from '../core/generators/bedrock/manifest.js';

export const SERVER_ROOT = process.env.MCSTUDIO_SERVER_ROOT || '/opt/minecraft/mcbedrock';
// Le monde vise : MCSTUDIO_WORLD_NAME s'il est regle, sinon celui qui TOURNE
// (level-name de server.properties), relu a chaque appel : on bascule entre mondes.
export function worldName(): string {
  if (process.env.MCSTUDIO_WORLD_NAME) return process.env.MCSTUDIO_WORLD_NAME;
  try {
    const m = readFileSync(join(SERVER_ROOT, 'server.properties'), 'utf8').match(/^level-name=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {}
  return 'BillyCraft';
}
const TEX_DIR = join(process.cwd(), 'data', 'textures');
const SND_DIR = join(process.cwd(), 'data', 'sounds');
const UUID_DIR = join(process.cwd(), 'data', 'uuids'); // uuids figes par projet (stabilite entre versions)

function textureProvider(projectId: string): TextureProvider {
  return (file: string) => {
    const p = join(TEX_DIR, projectId, file);
    if (!existsSync(p)) return null;
    try { return readFileSync(p); } catch { return null; }
  };
}

// UUIDs stables : on ne regenere pas a chaque build (sinon le monde croit a un nouveau pack).
function stableUuids(projectId: string): PackUuids {
  mkdirSync(UUID_DIR, { recursive: true });
  const f = join(UUID_DIR, projectId + '.json');
  if (existsSync(f)) {
    const u = JSON.parse(readFileSync(f, 'utf-8'));
    if (!u.scriptModule) { u.scriptModule = newPackUuids().scriptModule; writeFileSync(f, JSON.stringify(u, null, 2)); }
    return u;
  }
  const u = newPackUuids();
  writeFileSync(f, JSON.stringify(u, null, 2));
  return u;
}

function soundProvider(projectId: string) {
  return (file: string) => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return null;
    const p = join(SND_DIR, projectId, file);
    return existsSync(p) ? readFileSync(p) : null;
  };
}

export function build(project: Project) {
  return buildAddon(project, stableUuids(project.id), textureProvider(project.id), soundProvider(project.id));
}

function writeFiles(files: PackFile[], baseBP: string, baseRP: string) {
  for (const f of files) {
    const rel = f.path.replace(/^BP\//, '').replace(/^RP\//, '');
    const base = f.path.startsWith('BP/') ? baseBP : baseRP;
    const full = join(base, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
  }
}

/** Export .mcaddon (zip BP+RP) pour telechargement / partage. */
export async function exportMcaddon(project: Project, outFile: string): Promise<{ size: number; warnings: string[] }> {
  const res = build(project);
  mkdirSync(dirname(outFile), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    for (const f of res.files) {
      // dans un .mcaddon : deux dossiers racine (un BP, un RP)
      const inZip = f.path.replace(/^BP\//, `${res.bpName}/`).replace(/^RP\//, `${res.rpName}/`);
      archive.append(f.content, { name: inZip });
    }
    archive.finalize();
  });
  const { statSync } = await import('node:fs');
  return { size: statSync(outFile).size, warnings: res.warnings };
}

// --- activation dans le monde ---
interface WorldPackEntry { pack_id: string; version: [number, number, number]; }

function readWorldList(file: string): WorldPackEntry[] {
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return []; }
}
function upsert(list: WorldPackEntry[], id: string, version: [number, number, number]): WorldPackEntry[] {
  const out = list.filter((e) => e.pack_id !== id);
  out.push({ pack_id: id, version });
  return out;
}

export interface InstallPlan {
  worldName: string;
  bpDir: string; rpDir: string;
  bpExists: boolean; rpExists: boolean;
  alreadyActiveBP: boolean; alreadyActiveRP: boolean;
  fileCount: number;
  warnings: string[];
}

/** Prepare l'installation : dit ce qui va etre ecrit/active, SANS rien modifier. */
export function planInstall(project: Project): InstallPlan {
  const res = build(project);
  const bpDir = join(SERVER_ROOT, 'behavior_packs', res.bpName);
  const rpDir = join(SERVER_ROOT, 'resource_packs', res.rpName);
  const u = stableUuids(project.id);
  const wbp = readWorldList(join(SERVER_ROOT, 'worlds', worldName(), 'world_behavior_packs.json'));
  const wrp = readWorldList(join(SERVER_ROOT, 'worlds', worldName(), 'world_resource_packs.json'));
  return {
    worldName: worldName(), bpDir, rpDir,
    bpExists: existsSync(bpDir), rpExists: existsSync(rpDir),
    alreadyActiveBP: wbp.some((e) => e.pack_id === u.bpHeader),
    alreadyActiveRP: wrp.some((e) => e.pack_id === u.rpHeader),
    fileCount: res.files.length,
    warnings: res.warnings,
  };
}

export interface InstallResult { backup: string; bpDir: string; rpDir: string; needsRestart: boolean; warnings: string[]; }

/** Installe l'add-on sur le serveur : sauvegarde AVANT, ecrit les packs, active dans le monde.
 *  Ne redemarre PAS : renvoie needsRestart=true (Billy declenche le redemarrage unique). */
export function installToServer(project: Project): InstallResult {
  // nouvelle version a CHAQUE installation -> Minecraft retelecharge le pack au lieu de garder son cache
  const prev = stableUuids(project.id);
  const u: PackUuids = { ...prev, build: (prev.build ?? 0) + 1 };
  writeFileSync(join(UUID_DIR, project.id + '.json'), JSON.stringify(u, null, 2));
  const res = build(project);
  const bpDir = join(SERVER_ROOT, 'behavior_packs', res.bpName);
  const rpDir = join(SERVER_ROOT, 'resource_packs', res.rpName);
  const worldDir = join(SERVER_ROOT, 'worlds', worldName());
  const wbpFile = join(worldDir, 'world_behavior_packs.json');
  const wrpFile = join(worldDir, 'world_resource_packs.json');

  // 1) SAUVEGARDE avant (packs existants de meme nom + listes du monde)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = join(process.cwd(), 'data', 'backups', `${project.namespace}-${stamp}`);
  mkdirSync(backup, { recursive: true });
  if (existsSync(bpDir)) cpSync(bpDir, join(backup, res.bpName), { recursive: true });
  if (existsSync(rpDir)) cpSync(rpDir, join(backup, res.rpName), { recursive: true });
  if (existsSync(wbpFile)) cpSync(wbpFile, join(backup, 'world_behavior_packs.json'));
  if (existsSync(wrpFile)) cpSync(wrpFile, join(backup, 'world_resource_packs.json'));

  // 2) ECRITURE des packs (on remplace proprement le contenu precedent)
  if (existsSync(bpDir)) rmSync(bpDir, { recursive: true, force: true });
  if (existsSync(rpDir)) rmSync(rpDir, { recursive: true, force: true });
  writeFiles(res.files, bpDir, rpDir);

  // 3) ACTIVATION dans le monde
  mkdirSync(worldDir, { recursive: true });
  writeFileSync(wbpFile, JSON.stringify(upsert(readWorldList(wbpFile), u.bpHeader, packVersion(u)), null, 2));
  writeFileSync(wrpFile, JSON.stringify(upsert(readWorldList(wrpFile), u.rpHeader, packVersion(u)), null, 2));

  return { backup, bpDir, rpDir, needsRestart: true, warnings: res.warnings };
}

export { TEX_DIR, SND_DIR };
