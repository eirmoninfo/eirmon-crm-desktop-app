import { nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'public', 'logo.png'),
    path.join(__dirname, '..', 'public', 'eirmon_ai_logo.png'),
    path.join(__dirname, '..', 'dist', 'logo.png'),
    path.join(__dirname, '..', 'dist', 'eirmon_ai_logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export function resolveAppIconNative(): Electron.NativeImage | undefined {
  const p = resolveAppIconPath();
  if (!p) return undefined;
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? undefined : img;
}