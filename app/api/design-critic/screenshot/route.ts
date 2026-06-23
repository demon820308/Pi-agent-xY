import { NextRequest, NextResponse } from 'next/server';
import { captureScreenshot } from '@/lib/screenshot';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const imageBase64 = await captureScreenshot(url);

    return NextResponse.json({ imageBase64 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Screenshot failed';
    console.error('[design-critic/screenshot]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
