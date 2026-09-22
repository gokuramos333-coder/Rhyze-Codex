import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export async function rhyzeSymbolIcon(size: { width: number; height: number }) {
  const symbol = await readFile(join(process.cwd(), 'public/brand/rhyze-symbol-v2.png'));
  return new ImageResponse(
    // Embedded locally so icon generation never depends on production or a CDN.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" src={`data:image/png;base64,${symbol.toString('base64')}`} width={size.width} height={size.height} />,
    size,
  );
}
