import { rhyzeSymbolIcon } from '@/lib/brand/symbol-icon';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return rhyzeSymbolIcon(size);
}
