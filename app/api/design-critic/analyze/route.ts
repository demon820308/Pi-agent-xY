import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  return NextResponse.json({
    score: 0,
    summary: '',
    issues: [],
    pageType: 'other',
    mood: 'other',
    screenshot: '',
    dials: { variance: 0, motion: 0, density: 0 },
    matchedBrands: [],
  });
}
