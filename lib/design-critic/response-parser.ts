import type { CritiqueResult } from './types';

export function parseAnalysisResponse(raw: string): CritiqueResult {
  let jsonStr = raw.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    jsonStr = jsonStr.slice(start, end + 1);
  }

  const parsed = JSON.parse(jsonStr);

  return {
    score: parsed.score ?? 5,
    summary: parsed.summary ?? '',
    issues: parsed.issues ?? [],
    pageType: parsed.pageType ?? 'other',
    mood: parsed.mood ?? 'other',
    screenshot: parsed.screenshot ?? '',
    dials: parsed.dials ?? { variance: 50, motion: 50, density: 50 },
    matchedBrands: parsed.matchedBrands ?? [],
    htmlSource: parsed.htmlSource,
  };
}
