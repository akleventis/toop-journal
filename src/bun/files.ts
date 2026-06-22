import os from "node:os";
import path from "node:path";

export async function saveToDownloads({ filename, content, encoding }: { filename: string; content: string; encoding: 'utf8' | 'base64' }): Promise<{ path: string }> {
  const safeName = path.basename(filename);
  if (!safeName || safeName.startsWith('.') || safeName.includes('\0')) throw new Error('invalid filename');
  const downloadsDir = path.resolve(os.homedir(), 'Downloads');
  const filePath = path.resolve(downloadsDir, safeName);
  if (path.dirname(filePath) !== downloadsDir) throw new Error('path escapes Downloads');
  const data = encoding === 'base64' ? Buffer.from(content, 'base64') : content;
  await Bun.write(filePath, data);
  return { path: filePath };
}

export function revealInFinder({ path: filePath }: { path: string }): void {
  Bun.spawn(['open', '-R', filePath]);
}
