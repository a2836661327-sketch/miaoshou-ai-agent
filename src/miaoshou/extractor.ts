import type { MiaoshouProduct } from "../shared/product";

type FieldName =
  | "title"
  | "description"
  | "sku"
  | "price"
  | "brand"
  | "weight"
  | "length"
  | "width"
  | "height";

interface FieldDescriptor {
  label: string;
  value: string;
  field: HTMLElement;
}

const fieldPatterns: Record<FieldName, RegExp> = {
  title: /商品标题|产品标题|商品名称|产品名称|标题|product\s*title/i,
  description: /商品描述|产品描述|商品详情|产品详情|描述|详情|description/i,
  sku: /sku|商家编码|商品编码|产品编码|货号/i,
  price: /价格|售价|销售价|商品价格|price/i,
  brand: /品牌|brand/i,
  weight: /重量|净重|毛重|weight/i,
  length: /长度|长(?:度)?(?:\s|[:：]|$)|length/i,
  width: /宽度|宽(?:度)?(?:\s|[:：]|$)|width/i,
  height: /高度|高(?:度)?(?:\s|[:：]|$)|height/i
};

const imageUrlPattern = /^https?:\/\//i;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function controlValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return normalizeText(element.value);
  }
  if (element instanceof HTMLSelectElement) {
    return normalizeText(element.selectedOptions[0]?.textContent ?? element.value);
  }
  return normalizeText(element.innerText || element.textContent);
}

function contextualLabel(element: HTMLElement): string {
  const labels = Array.from(element.ownerDocument.querySelectorAll("label"))
    .filter((label) => label.htmlFor && label.htmlFor === element.id)
    .map((label) => label.innerText || label.textContent || "");
  const enclosingLabel = element.closest("label");
  if (enclosingLabel) labels.push(enclosingLabel.innerText || enclosingLabel.textContent || "");

  const candidates = [
    ...labels,
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.id,
    element.getAttribute("data-field"),
    element.closest(
      "tr, li, [role='group'], .el-form-item, .ant-form-item, [class*='form-item'], [class*='field-item']"
    )?.textContent
  ];
  return normalizeText(candidates.filter(Boolean).join(" "));
}

function collectFields(document: Document): FieldDescriptor[] {
  const controls = document.querySelectorAll<HTMLElement>(
    "input:not([type='hidden']):not([type='button']):not([type='submit']), textarea, select, [contenteditable='true']"
  );
  return Array.from(controls, (field) => ({
    label: contextualLabel(field),
    value: controlValue(field),
    field
  }));
}

function findField(fields: FieldDescriptor[], name: FieldName): string {
  const match = fields.find((field) => field.value && fieldPatterns[name].test(field.label));
  return match?.value ?? "";
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, "");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function richDescription(document: Document): string {
  const editor = document.querySelector<HTMLElement>(
    ".ql-editor, .ProseMirror, [contenteditable='true'], [class*='editor'][class*='content']"
  );
  return normalizeText(editor?.innerText || editor?.textContent);
}

function collectAttributes(fields: FieldDescriptor[]): Record<string, string> {
  const attributes: Record<string, string> = {};
  const corePatterns = Object.values(fieldPatterns);

  for (const field of fields) {
    const label = field.label.replace(field.value, "").replace(/[:：\s]+$/, "").trim();
    if (!label || !field.value || corePatterns.some((pattern) => pattern.test(label))) continue;
    if (label.length > 80 || field.value.length > 500) continue;
    attributes[label] = field.value;
  }
  return attributes;
}

function collectImages(document: Document): string[] {
  const urls = new Set<string>();
  for (const image of document.querySelectorAll<HTMLImageElement>("img")) {
    const url = image.currentSrc || image.src || image.getAttribute("data-src") || "";
    if (!imageUrlPattern.test(url)) continue;
    if (image.naturalWidth > 0 && image.naturalWidth < 60 && image.naturalHeight < 60) continue;
    if (/logo|avatar|icon|flag/i.test(`${image.alt} ${image.className} ${url}`)) continue;
    urls.add(url);
  }
  return Array.from(urls);
}

export function isProductEditorPage(document: Document, location: Location): boolean {
  const pageText = normalizeText(document.body?.innerText).slice(0, 12_000);
  const hasProductFields = /商品标题|产品标题|商品名称|产品名称/.test(pageText)
    && /商品描述|sku|商品编码|价格|品牌|商品分类/i.test(pageText);
  const productRoute = /product|goods|item|listing|publish|edit/i.test(location.pathname);
  const hasForm = Boolean(document.querySelector("input, textarea, [contenteditable='true']"));
  return hasProductFields || (productRoute && hasForm);
}

export function extractMiaoshouProduct(document: Document, location: Location): MiaoshouProduct {
  const fields = collectFields(document);
  const description = findField(fields, "description") || richDescription(document);

  return {
    title: findField(fields, "title"),
    description,
    sku: findField(fields, "sku"),
    price: parseNumber(findField(fields, "price")),
    brand: findField(fields, "brand"),
    weight: parseNumber(findField(fields, "weight")),
    length: parseNumber(findField(fields, "length")),
    width: parseNumber(findField(fields, "width")),
    height: parseNumber(findField(fields, "height")),
    attributes: collectAttributes(fields),
    images: collectImages(document),
    sourceUrl: location.href,
    extractedAt: new Date().toISOString()
  };
}
