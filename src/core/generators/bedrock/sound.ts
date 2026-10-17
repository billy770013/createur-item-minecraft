// Generateur de SONS Bedrock : RP sound_definitions.json (+ fichiers dans RP/sounds/<ns>/).
import { Project, Sound } from '../../types.js';

export function soundId(project: Project, name: string): string {
  return `${project.namespace}.${name}`;
}
export function soundFileExt(file: string): string {
  return file.toLowerCase().endsWith('.wav') ? '.wav' : '.ogg';
}

export function generateSoundDefinitions(project: Project): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  for (const s of project.sounds as Sound[]) {
    defs[soundId(project, s.name)] = {
      category: s.category,
      sounds: [{ name: `sounds/${project.namespace}/${s.name}`, volume: s.volume, pitch: s.pitch }],
    };
  }
  return { format_version: '1.20.20', sound_definitions: defs };
}
