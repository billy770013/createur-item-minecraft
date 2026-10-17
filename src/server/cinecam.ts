// Pont HTTP <-> serveur Minecraft pour CinéCam Studio (le logiciel PC qui pilote la caméra).
// Ecrit des "scriptevent cinecam:..." dans la console du serveur et lit les reponses dans le journal.
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FIFO = process.env.MCSTUDIO_CONSOLE_FIFO || '/opt/minecraft/mcbedrock/console.in';
const UNIT = process.env.MCSTUDIO_SERVICE || 'mcbedrock';

function envoyer(id: string, message: string) {
  appendFileSync(FIFO, `scriptevent cinecam:${id} ${message}\n`);
}

// lit le journal depuis "since" et renvoie la 1re ligne qui matche, en reessayant jusqu'a timeoutMs
function attendreLigne(sinceIso: string, motif: RegExp, timeoutMs = 2500): string | null {
  const fin = Date.now() + timeoutMs;
  while (Date.now() < fin) {
    try {
      const out = execFileSync('journalctl', ['-u', UNIT, '--since', sinceIso, '-o', 'cat', '--no-pager'], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
      for (const l of out.split('\n')) { const m = l.match(motif); if (m) return l; }
    } catch { /* ignore */ }
    // petite pause active
    const t = Date.now() + 120; while (Date.now() < t) { /* spin court */ }
  }
  return null;
}
const maintenant = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export interface Point { x: number; y: number; z: number; rx: number; ry: number; }
export interface Cfg { dur: number; easeIdx: number; hud: boolean; loop: boolean; }

export function joueursEnLigne(): string[] {
  const t = maintenant();
  envoyer('players', '.');
  const l = attendreLigne(t, /CINECAM_PLAYERS\|/);
  if (!l) return [];
  const apres = l.split('CINECAM_PLAYERS|')[1] ?? '';
  return apres.split(',').map((s) => s.trim()).filter(Boolean);
}

export function positionJoueur(nom: string): Point | null {
  const t = maintenant();
  envoyer('where', nom);
  const l = attendreLigne(t, new RegExp('CINECAM_WHERE\\|' + nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\|'));
  if (!l) return null;
  const p = l.split('CINECAM_WHERE|')[1].split('|');
  return { x: +p[1], y: +p[2], z: +p[3], rx: +p[4], ry: +p[5] };
}

export function donnerOutil(nom: string): boolean {
  const t = maintenant();
  envoyer('tool', nom);
  return !!attendreLigne(t, new RegExp('CINECAM_OK\\|tool\\|'));
}

export function lire(nom: string, pts: Point[], cfg: Cfg): { ok: boolean; erreur?: string } {
  if (!pts.length) return { ok: false, erreur: 'aucun point' };
  envoyer('begin', nom);
  const t = Date.now() + 80; while (Date.now() < t) { /* court */ }
  for (const p of pts) envoyer('add', `${nom}|${p.x}|${p.y}|${p.z}|${p.rx}|${p.ry}`);
  envoyer('cfg', `${nom}|${cfg.dur}|${cfg.easeIdx}|${cfg.hud ? 1 : 0}|${cfg.loop ? 1 : 0}`);
  const ts = maintenant();
  envoyer('go', nom);
  const ok = attendreLigne(ts, new RegExp('CINECAM_(OK\\|go|ERR)\\|'));
  if (ok && ok.includes('CINECAM_OK|go')) return { ok: true };
  if (ok && ok.includes('ERR')) return { ok: false, erreur: ok.split('CINECAM_ERR|')[1] };
  return { ok: false, erreur: 'pas de réponse (le joueur est-il en ligne ?)' };
}

export function stop(nom: string) { envoyer('stop', nom); }
