// Stockage des projets dans SQLite (un projet = un add-on). Jamais de perte de donnees :
// chaque sauvegarde ecrit le projet complet (JSON) + garde un historique des versions.
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Project, ProjectSchema } from '../core/types.js';

const DB_PATH = join(process.cwd(), 'data', 'mcstudio.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    json TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId TEXT NOT NULL,
    json TEXT NOT NULL,
    savedAt TEXT NOT NULL
  );
`);

export function listProjects(): { id: string; name: string; updatedAt: string; items: number }[] {
  const rows = db.prepare('SELECT id, name, json, updatedAt FROM projects ORDER BY updatedAt DESC').all() as any[];
  return rows.map((r) => {
    let items = 0;
    try { items = (JSON.parse(r.json).items || []).length; } catch {}
    return { id: r.id, name: r.name, updatedAt: r.updatedAt, items };
  });
}

export function getProject(id: string): Project | null {
  const row = db.prepare('SELECT json FROM projects WHERE id = ?').get(id) as any;
  if (!row) return null;
  return ProjectSchema.parse(JSON.parse(row.json));
}

export function createProject(partial: { name: string; namespace: string; mcVersion?: string; description?: string }): Project {
  const now = new Date().toISOString();
  const project: Project = ProjectSchema.parse({
    id: randomUUID(),
    name: partial.name,
    namespace: partial.namespace,
    mcVersion: partial.mcVersion || '1.21.0',
    formatVersion: '1.21.40',
    description: partial.description || '',
    createdAt: now,
    updatedAt: now,
    items: [],
    recipes: [],
  });
  saveProject(project);
  return project;
}

export function saveProject(project: Project): Project {
  const now = new Date().toISOString();
  project.updatedAt = now;
  const json = JSON.stringify(project);
  db.prepare(
    `INSERT INTO projects (id, name, json, updatedAt) VALUES (@id, @name, @json, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET name=@name, json=@json, updatedAt=@updatedAt`,
  ).run({ id: project.id, name: project.name, json, updatedAt: now });
  // historique (on garde les 50 dernieres versions par projet)
  db.prepare('INSERT INTO history (projectId, json, savedAt) VALUES (?, ?, ?)').run(project.id, json, now);
  db.prepare(
    `DELETE FROM history WHERE projectId = ? AND id NOT IN
       (SELECT id FROM history WHERE projectId = ? ORDER BY id DESC LIMIT 50)`,
  ).run(project.id, project.id);
  return project;
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  db.prepare('DELETE FROM history WHERE projectId = ?').run(id);
}

export function getHistory(projectId: string): { id: number; savedAt: string }[] {
  return db.prepare('SELECT id, savedAt FROM history WHERE projectId = ? ORDER BY id DESC').all(projectId) as any[];
}

export function restoreHistory(projectId: string, historyId: number): Project | null {
  const row = db.prepare('SELECT json FROM history WHERE id = ? AND projectId = ?').get(historyId, projectId) as any;
  if (!row) return null;
  const project = ProjectSchema.parse(JSON.parse(row.json));
  return saveProject(project);
}

export default db;
