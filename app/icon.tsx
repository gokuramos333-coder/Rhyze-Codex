import { rhyzeSymbolIcon } from '@/lib/brand/symbol-icon';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return rhyzeSymbolIcon(size);
}
