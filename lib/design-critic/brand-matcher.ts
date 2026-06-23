export interface BrandMatch {
  id: string;
  name: string;
  score: number;
}

export function matchBrands(_html: string): BrandMatch[] {
  return [];
}
