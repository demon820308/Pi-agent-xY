export interface CriticConfig {
  language: 'zh' | 'en';
  depth: 'quick' | 'standard' | 'thorough';
  focusAreas: string[];
}

export const DEFAULT_CRITIC_CONFIG: CriticConfig = {
  language: 'zh',
  depth: 'standard',
  focusAreas: [],
};

export interface CriticIssue {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
  dimension: string;
  current: string;
  recommended: string;
  reference?: string;
  code?: string;
}

export interface CritiqueResult {
  score: number;
  summary: string;
  issues: CriticIssue[];
  pageType: string;
  mood: string;
  screenshot: string;
  dials: {
    variance: number;
    motion: number;
    density: number;
  };
  matchedBrands: { id: string; name: string; score: number }[];
  htmlSource?: string;
}

export interface AnalyzeRequest {
  imageBase64?: string;
  url?: string;
  htmlSource?: string;
  config: CriticConfig;
}
