export interface MiaoshouProduct {
  title: string;
  description: string;
  sku: string;
  price: number | null;
  pricingMode: "net_income" | "sale_price" | null;
  globalNetIncome: number | null;
  siteNetIncome: number | null;
  estimatedSalePrice: number | null;
  currency: string | null;
  brand: string;
  weight: number | null;
  weightUnit: "g" | "kg" | null;
  length: number | null;
  width: number | null;
  height: number | null;
  attributes: Record<string, string>;
  images: string[];
  sourceUrl: string;
  extractedAt: string;
}
