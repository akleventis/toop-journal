import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger.js";

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const SIZE_CAP = 500 * 1024; // small JPEGs are left untouched

// Always produces a JPEG so embedded images have a consistent type. Resizes/compresses via macOS
// sips, but for JPEG inputs never embeds something larger than the original.
export async function compressImage({ content, ext }: { content: string; ext: string }): Promise<{ dataUrl: string }> {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  const isJpeg = safeExt === 'jpg' || safeExt === 'jpeg';
  const inputBytes = Buffer.byteLength(content, 'base64');
  const asIs = { dataUrl: `data:image/jpeg;base64,${content}` };
  logger.info(`[compressImage] received ext="${ext}" (safe="${safeExt}"), input ${kb(inputBytes)}`);

  // Already a small JPEG — nothing to gain, embed as-is.
  if (isJpeg && inputBytes < SIZE_CAP) {
    logger.info(`[compressImage] JPEG under ${kb(SIZE_CAP)}, keeping original`);
    return asIs;
  }

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

    // Re-encoding a JPEG made it bigger — keep the original JPEG.
    if (isJpeg && jpeg.length >= inputBytes) {
      logger.info(`[compressImage] sips output larger (${kb(jpeg.length)}), keeping original`);
      return asIs;
    }
    logger.info(`[compressImage] done in ${Date.now() - startedAt}ms: ${kb(inputBytes)} -> ${kb(jpeg.length)}`);
    return { dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch((e) => logger.error('temp cleanup failed', e));
  }
}
