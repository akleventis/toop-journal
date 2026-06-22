import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger.js";

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

// Convert any image (HEIC/PNG/WEBP/JPEG) to a resized, compressed JPEG via macOS sips.
export async function compressImage({ content, ext }: { content: string; ext: string }): Promise<{ dataUrl: string }> {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  const inputBytes = Buffer.byteLength(content, 'base64');
  logger.info(`[compressImage] received ext="${ext}" (safe="${safeExt}"), input ${kb(inputBytes)}`);
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toop-img-'));
  const inPath = path.join(tmpDir, `in.${safeExt}`);
  const outPath = path.join(tmpDir, 'out.jpg');
  const startedAt = Date.now();
  try {
    await Bun.write(inPath, Buffer.from(content, 'base64'));
    logger.info(`[compressImage] wrote temp input ${inPath}, running sips...`);
    const proc = Bun.spawn(
      ['sips', '-s', 'format', 'jpeg', '-Z', '2000', '-s', 'formatOptions', '70', inPath, '--out', outPath],
      { stdout: 'ignore', stderr: 'pipe' },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      logger.error(`[compressImage] sips failed (${exitCode}): ${err.trim()}`);
      throw new Error(`sips failed (${exitCode}): ${err.trim()}`);
    }
    const jpeg = Buffer.from(await Bun.file(outPath).arrayBuffer());
    const ratio = inputBytes ? Math.round((1 - jpeg.length / inputBytes) * 100) : 0;
    logger.info(`[compressImage] done in ${Date.now() - startedAt}ms: ${kb(inputBytes)} -> ${kb(jpeg.length)} (${ratio}% smaller)`);
    return { dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch((e) => logger.error('temp cleanup failed', e));
  }
}
