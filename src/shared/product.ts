export interface MiaoshouProduct {
  title: string;
  description: string;
  sku: string;
  price: number | null;
  brand: string;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  attributes: Record<string, string>;
  images: string[];
  sourceUrl: string;
  extractedAt: string;
}
