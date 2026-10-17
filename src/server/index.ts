// Serveur Minecraft Creator Studio : API + interface web (ouverte dans le navigateur).
import express from 'express';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ItemSchema, RecipeSchema, BlockSchema, MobSchema, LootTableSchema, SoundSchema, SkinSchema, Project } from '../core/types.js';
import { generateBlockJson } from '../core/generators/bedrock/block.js';
import { generateLootJson } from '../core/generators/bedrock/loot.js';
import { generateMob, listMobBases, VANILLA_MOBS_DIR } from '../core/generators/bedrock/mob.js';
import { buildSkinPack, SKIN_GEO_DIR, skinGeometry } from '../core/generators/bedrock/skin.js';
import * as archiverNs2 from 'archiver';
import { generateItemJson } from '../core/generators/bedrock/item.js';
import * as store from './db.js';
import { exportMcaddon, planInstall, installToServer, build, TEX_DIR, SND_DIR } from './deploy.js';
import * as cinecam from './cinecam.js';
import { statSync, unlinkSync } from 'node:fs';

const __dir = fileURLToPath(new URL('.', import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));

const PORT = Number(process.env.MCSTUDIO_PORT || 5930);
const SERVER_SERVICE = process.env.MCSTUDIO_SERVICE || 'mcbedrock';

function wrap(fn: (req: express.Request, res: express.Response) => any) {
  return (req: express.Request, res: express.Response) => {
    try { const r = fn(req, res); if (r !== undefined && !res.headersSent) res.json(r); }
    catch (e: any) { res.status(400).json({ error: String(e?.message || e) }); }
  };
}
function need<T>(v: T | null | undefined, msg = 'introuvable'): T {
  if (v == null) throw new Error(msg);
  return v;
}

// --- projets ---
app.get('/api/projects', wrap(() => ({ projects: store.listProjects() })));
app.post('/api/projects', wrap((req) => {
  const { name, namespace, mcVersion, description } = req.body || {};
  if (!name || !namespace) throw new Error('Nom et namespace obligatoires');
  return store.createProject({ name, namespace, mcVersion, description });
}));
app.get('/api/projects/:id', wrap((req) => need(store.getProject(req.params.id))));
app.put('/api/projects/:id', wrap((req) => {
  const existing = need(store.getProject(req.params.id));
  const incoming = req.body as Project;
  // on garde l'id/namespace/dates d'origine, on valide le reste
  const merged: Project = { ...existing, ...incoming, id: existing.id, createdAt: existing.createdAt };
  // valide chaque item/recette
  merged.items = (merged.items || []).map((i) => ItemSchema.parse(i));
  merged.recipes = (merged.recipes || []).map((r) => RecipeSchema.parse(r));
  merged.blocks = (merged.blocks || []).map((b) => BlockSchema.parse(b));
  merged.mobs = (merged.mobs || []).map((m) => MobSchema.parse(m));
  merged.lootTables = (merged.lootTables || []).map((l) => LootTableSchema.parse(l));
  merged.sounds = (merged.sounds || []).map((x) => SoundSchema.parse(x));
  merged.skins = (merged.skins || []).map((x) => SkinSchema.parse(x));
  return store.saveProject(merged);
}));
app.delete('/api/projects/:id', wrap((req) => { store.deleteProject(req.params.id); return { ok: true }; }));
app.get('/api/projects/:id/history', wrap((req) => ({ history: store.getHistory(req.params.id) })));
app.post('/api/projects/:id/restore/:hid', wrap((req) =>
  need(store.restoreHistory(req.params.id, Number(req.params.hid)), 'version introuvable')));

// --- apercu d'un item (JSON genere en direct, sans sauvegarder) ---
app.post('/api/preview/item', wrap((req) => {
  const item = ItemSchema.parse(req.body.item);
  const project = need(store.getProject(req.body.projectId));
  const res = generateItemJson(item, project);
  return { json: res.json, warnings: res.warnings };
}));

// --- textures (upload binaire brut : ?file=rubis.png) ---
// journal d'erreurs du jeu (ContentLog du PC de Billy), envoye pour diagnostic -> data/client-logs/
app.post('/api/client-log', express.raw({ type: () => true, limit: '10mb' }), wrap((req) => {
  const buf = req.body as Buffer;
  if (!buf || !buf.length) throw new Error('Fichier vide');
  const name = String(req.query.name || 'log.txt').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80);
  const dir = join(process.cwd(), 'data', 'client-logs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '_' + name), buf);
  return { ok: true, size: buf.length };
}));

app.post('/api/projects/:id/texture', express.raw({ type: () => true, limit: '6mb' }), wrap((req) => {
  const file = String(req.query.file || '');
  if (!/^[a-zA-Z0-9_.-]+\.png$/.test(file)) throw new Error('Nom de fichier PNG invalide');
  const dir = join(TEX_DIR, req.params.id);
  mkdirSync(dir, { recursive: true });
  const buf = req.body as Buffer;
  if (!buf || !buf.length) throw new Error('Fichier vide');
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Ce n\'est pas un vrai PNG');
  writeFileSync(join(dir, file), buf);
  return { ok: true, file };
}));
app.get('/api/projects/:id/texture-file', (req, res) => {
  const file = String(req.query.file || '');
  if (!/^[a-zA-Z0-9_.-]+\.png$/.test(file)) return res.status(400).end();
  const p = join(TEX_DIR, req.params.id, file);
  if (!existsSync(p)) return res.status(404).end();
  res.type('png').sendFile(p);
});
app.get('/api/projects/:id/textures', wrap((req) => {
  const dir = join(TEX_DIR, req.params.id);
  return { textures: existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : [] };
}));


// --- apercus bloc / mob / loot (JSON genere en direct) ---
app.post('/api/preview/block', wrap((req) => {
  const project = need(store.getProject(req.body.projectId));
  const r = generateBlockJson(BlockSchema.parse(req.body.block), project);
  return { json: r.json, warnings: r.warnings };
}));
app.post('/api/preview/mob', wrap((req) => {
  const project = need(store.getProject(req.body.projectId));
  const r = generateMob(MobSchema.parse(req.body.mob), project);
  const comps = (r.entity as any)['minecraft:entity'].components;
  return { warnings: r.warnings, resume: { health: comps['minecraft:health'], scale: comps['minecraft:scale'], boss: comps['minecraft:boss'], loot: comps['minecraft:loot'] }, spawn: !!r.spawn };
}));
app.post('/api/preview/loot', wrap((req) => {
  const project = need(store.getProject(req.body.projectId));
  const r = generateLootJson(LootTableSchema.parse(req.body.table), project);
  return { json: r.json, warnings: r.warnings };
}));

// --- mobs de base (officiels) ---
app.get('/api/mobbases', wrap(() => ({ bases: listMobBases() })));
app.get('/api/mobbases/:base/:file', (req, res) => {
  const { base, file } = req.params;
  if (!/^[a-z_]+$/.test(base) || !['texture.png', 'geo.json'].includes(file)) return res.status(400).end();
  const p = join(VANILLA_MOBS_DIR, base, file);
  if (!existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// --- sons (upload binaire : .ogg ou .wav) ---
app.post('/api/projects/:id/sound', express.raw({ type: () => true, limit: '12mb' }), wrap((req) => {
  const file = String(req.query.file || '');
  if (!/^[a-z0-9_]+\.(ogg|wav)$/.test(file)) throw new Error('Nom invalide (minuscules, .ogg ou .wav)');
  const buf = req.body as Buffer;
  if (!buf || !buf.length) throw new Error('Fichier vide');
  const ogg = buf.subarray(0, 4).toString('latin1') === 'OggS';
  const wav = buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE';
  if (!ogg && !wav) throw new Error("Ce n'est pas un vrai fichier .ogg ou .wav");
  const dir = join(SND_DIR, req.params.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), buf);
  return { ok: true, file };
}));
app.get('/api/projects/:id/sound-file', (req, res) => {
  const file = String(req.query.file || '');
  if (!/^[a-z0-9_]+\.(ogg|wav)$/.test(file)) return res.status(400).end();
  const p = join(SND_DIR, req.params.id, file);
  if (!existsSync(p)) return res.status(404).end();
  res.type(file.endsWith('.wav') ? 'audio/wav' : 'audio/ogg').sendFile(p);
});

// --- galerie de textures : liste detaillee + suppression ---
app.get('/api/projects/:id/textures-info', wrap((req) => {
  const dir = join(TEX_DIR, req.params.id);
  if (!existsSync(dir)) return { textures: [] };
  return {
    textures: readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => {
      const b = readFileSync(join(dir, f));
      return { file: f, w: b.readUInt32BE(16), h: b.readUInt32BE(20), size: statSync(join(dir, f)).size };
    }),
  };
}));
app.delete('/api/projects/:id/texture', wrap((req) => {
  const file = String(req.query.file || '');
  if (!/^[a-zA-Z0-9_.-]+\.png$/.test(file)) throw new Error('Nom invalide');
  const p = join(TEX_DIR, req.params.id, file);
  if (existsSync(p)) unlinkSync(p);
  return { ok: true };
}));

// --- build / validation ---
app.get('/api/projects/:id/build', wrap((req) => {
  const project = need(store.getProject(req.params.id));
  const res = build(project);
  return { warnings: res.warnings, stats: res.stats, files: res.files.map((f) => f.path) };
}));

// --- export .mcaddon ---
app.get('/api/projects/:id/export', (req, res) => {
  (async () => {
    try {
      const project = store.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'introuvable' });
      const out = join(process.cwd(), 'dist', 'exports', `${project.namespace}.mcaddon`);
      await exportMcaddon(project, out);
      res.download(out, `${project.namespace}.mcaddon`);
    } catch (e: any) { res.status(400).json({ error: String(e?.message || e) }); }
  })();
});

// --- installation sur le serveur ---
app.get('/api/projects/:id/install/plan', wrap((req) => planInstall(need(store.getProject(req.params.id)))));
app.post('/api/projects/:id/install', wrap((req) => installToServer(need(store.getProject(req.params.id)))));


// --- skins : geometrie du joueur + textures de depart (pour l'editeur) ---
app.get('/api/skin/:model/geo', wrap((req) => {
  return skinGeometry(req.params.model === 'slim' ? 'slim' : 'wide');
}));
app.get('/api/skin/:model/default.png', (req, res) => {
  const p = join(SKIN_GEO_DIR, req.params.model === 'slim' ? 'alex.png' : 'steve.png');
  res.type('png').sendFile(p);
});
// export du pack de skins (.mcpack)
app.get('/api/projects/:id/skinpack', (req, res) => {
  (async () => {
    try {
      const project = store.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'introuvable' });
      const tex = (file: string) => { const p = join(TEX_DIR, project.id, file); return existsSync(p) ? readFileSync(p) : null; };
      const pack = buildSkinPack(project, tex);
      const arch: any = (archiverNs2 as any).default ?? archiverNs2;
      res.attachment(`${project.namespace}_skins.mcpack`);
      const a = arch('zip', { zlib: { level: 9 } });
      a.on('error', (e: any) => res.status(500).end(String(e)));
      a.pipe(res);
      for (const f of pack.files) a.append(f.content, { name: f.path });
      a.finalize();
    } catch (e: any) { res.status(400).json({ error: String(e?.message || e) }); }
  })();
});

// --- serveur minecraft : statut + redemarrage (declenche par Billy seulement) ---
app.get('/api/server/status', (_req, res) => {
  execFile('systemctl', ['is-active', SERVER_SERVICE], (_e, stdout) => {
    res.json({ active: String(stdout).trim() === 'active' });
  });
});
app.post('/api/server/restart', (_req, res) => {
  execFile('systemctl', ['restart', SERVER_SERVICE], (e) => {
    if (e) return res.status(500).json({ error: String(e.message) });
    res.json({ ok: true });
  });
});

// --- CinéCam : pilotage de la caméra depuis le logiciel PC ---
app.get('/api/cinecam/players', (_req, res) => { try { res.json({ players: cinecam.joueursEnLigne() }); } catch (e: any) { res.status(500).json({ error: String(e.message) }); } });
app.get('/api/cinecam/where', (req, res) => {
  const nom = String(req.query.player || ''); if (!nom) return res.status(400).json({ error: 'player manquant' });
  const p = cinecam.positionJoueur(nom); if (!p) return res.status(404).json({ error: 'joueur hors ligne ou pas de réponse' });
  res.json(p);
});
app.post('/api/cinecam/tool', (req, res) => { const nom = String(req.body?.player || ''); if (!nom) return res.status(400).json({ error: 'player manquant' }); res.json({ ok: cinecam.donnerOutil(nom) }); });
app.post('/api/cinecam/play', (req, res) => {
  const { player, points, cfg } = req.body || {};
  if (!player || !Array.isArray(points)) return res.status(400).json({ error: 'player/points manquants' });
  const r = cinecam.lire(String(player), points, { dur: +cfg?.dur || 4, easeIdx: +cfg?.easeIdx || 0, hud: !!cfg?.hud, loop: !!cfg?.loop });
  if (!r.ok) return res.status(400).json({ error: r.erreur }); res.json({ ok: true });
});
app.post('/api/cinecam/stop', (req, res) => { const nom = String(req.body?.player || ''); if (!nom) return res.status(400).json({ error: 'player manquant' }); cinecam.stop(nom); res.json({ ok: true }); });

// --- interface ---
app.get('/vendor/three.min.js', (_req, res) => {
  res.sendFile(fileURLToPath(new URL('../../node_modules/three/build/three.min.js', import.meta.url)));
});
app.use(express.static(join(__dir, 'ui')));
app.get('/', (_req, res) => res.sendFile(join(__dir, 'ui', 'index.html')));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Minecraft Creator Studio sur http://127.0.0.1:${PORT}`);
});
