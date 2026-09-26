import type { MiaoshouProduct } from "../shared/product";

type FieldName =
  | "description"
  | "sku"
  | "price"
  | "globalNetIncome"
  | "siteNetIncome"
  | "estimatedSalePrice"
  | "brand"
  | "weight"
  | "length"
  | "width"
  | "height";

interface FieldDescriptor {
  label: string;
  explicitLabel: string;
  value: string;
  field: HTMLElement;
}

export interface ProductFieldDiagnostic {
  tagName: string;
  label: string;
  inputType: string;
  name: string;
  id: string;
  class: string;
  placeholder: string;
  ariaLabel: string;
  value: string;
  dataAttributes: Record<string, string>;
  parentText: string;
  section: string;
  currentTab: string;
}

const fieldPatterns: Record<FieldName, RegExp> = {
  description: /商品描述|产品描述|商品详情|产品详情|描述|详情|description/i,
  sku: /sku|商家编码|商品编码|产品编码|货号/i,
  price: /预计售价|商品售价|销售价|售价|sale\s*price|selling\s*price/i,
  globalNetIncome: /全球净收益/i,
  siteNetIncome: /站点净收益/i,
  estimatedSalePrice: /预计售价/i,
  brand: /品牌|brand/i,
  weight: /重量|净重|毛重|weight/i,
  length: /长度|长(?:度)?(?:\s|[:：]|$)|length/i,
  width: /宽度|宽(?:度)?(?:\s|[:：]|$)|width/i,
  height: /高度|高(?:度)?(?:\s|[:：]|$)|height/i
};

const titleLabelPattern = /(?:商品|产品)标题/;
const unsafeValuePattern = /^(?:on|off|true|false)$/i;
const sensitivePattern = /password|token|authorization|cookie|credential|secret|session|(^|[_-])auth([_-]|$)|密码|凭据|登录凭证/i;
const imageUrlPattern = /^https?:\/\//i;
const controlSelector =
  "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']";

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

function isSwitchControl(element: HTMLElement): boolean {
  return Boolean(
    element.getAttribute("role") === "switch"
      || element.closest("[role='switch'], .el-switch, .ant-switch, [class*='switch']")
  );
}

function explicitLabel(element: HTMLElement): string {
  const labels = Array.from(element.ownerDocument.querySelectorAll("label"))
    .filter((label) => label.htmlFor && label.htmlFor === element.id)
    .map((label) => label.innerText || label.textContent || "");
  const enclosingLabel = element.closest("label");
  if (enclosingLabel) labels.push(enclosingLabel.innerText || enclosingLabel.textContent || "");

  const formItem = element.closest(
    ".el-form-item, .ant-form-item, [class*='form-item'], [class*='field-item']"
  );
  if (formItem) {
    const label = formItem.querySelector(
      ".el-form-item__label, .ant-form-item-label, [class*='form-label'], [class*='field-label']"
    );
    if (label) labels.push(label.textContent || "");
  }
  return normalizeText(labels.join(" "));
}

function contextualLabel(element: HTMLElement): string {
  const parent = element.closest(
    "tr, li, [role='group'], .el-form-item, .ant-form-item, [class*='form-item'], [class*='field-item']"
  );
  return normalizeText([
    explicitLabel(element),
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.id,
    element.getAttribute("data-field"),
    parent?.textContent
  ].filter(Boolean).join(" "));
}

function collectFields(document: ParentNode): FieldDescriptor[] {
  const controls = document.querySelectorAll<HTMLElement>(controlSelector);
  return Array.from(controls)
    .filter((field) => !isSwitchControl(field))
    .map((field) => ({
      label: contextualLabel(field),
      explicitLabel: explicitLabel(field),
      value: controlValue(field),
      field
    }));
}

function findField(fields: FieldDescriptor[], name: FieldName): string {
  const match = fields.find((field) => field.value && fieldPatterns[name].test(field.label));
  return match?.value ?? "";
}

function findTitle(fields: FieldDescriptor[]): string {
  const candidates = fields.filter((field) =>
    field.explicitLabel
      && titleLabelPattern.test(field.explicitLabel)
      && field.value
      && !unsafeValuePattern.test(field.value)
      && (field.field instanceof HTMLInputElement
        ? field.field.type === "text" || field.field.type === "search"
        : field.field instanceof HTMLTextAreaElement || field.field.isContentEditable)
  );
  candidates.sort((left, right) => {
    const leftMexico = /墨西哥|méxico|mexico|\bmx\b/i.test(`${left.explicitLabel} ${left.label}`);
    const rightMexico = /墨西哥|méxico|mexico|\bmx\b/i.test(`${right.explicitLabel} ${right.label}`);
    return Number(rightMexico) - Number(leftMexico);
  });
  return candidates[0]?.value ?? "";
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, "");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function closestLabeledText(root: ParentNode, pattern: RegExp): string {
  const labelElements = root.querySelectorAll<HTMLElement>(
    "label, th, dt, .el-form-item__label, .ant-form-item-label, [class*='label'], [class*='title'], [class*='name']"
  );

  for (const label of labelElements) {
    const labelText = normalizeText(label.textContent).replace(/[:：*]+$/, "").trim();
    if (!pattern.test(labelText)) continue;

    let parent = label.parentElement;
    for (let depth = 0; parent && depth < 5; depth += 1, parent = parent.parentElement) {
      const text = normalizeText(parent.innerText || parent.textContent);
      if (text.length > 300 || !pattern.test(text)) continue;
      if (text.replace(labelText, "").trim()) return text;
    }
  }
  return "";
}

function valueForPattern(fields: FieldDescriptor[], root: ParentNode, name: FieldName): string {
  const controlValue = findField(fields, name);
  const labeledText = closestLabeledText(root, fieldPatterns[name]);
  return controlValue && labeledText
    ? `${controlValue} ${labeledText}`
    : controlValue || labeledText;
}

function currencyFrom(...values: string[]): string | null {
  const text = values.join(" ");
  const code = text.match(/\b(USD|MXN|EUR|GBP|CAD|AUD|JPY|CNY)\b/i);
  if (code) return code[1].toUpperCase();
  const symbol = text.match(/[$€£¥]/)?.[0];
  if (!symbol) return null;
  return ({ "€": "EUR", "£": "GBP" })[symbol] ?? null;
}

function richDescription(document: Document): string {
  const editor = document.querySelector<HTMLElement>(
    ".ql-editor, .ProseMirror, [contenteditable='true'], [class*='editor'][class*='content']"
  );
  return normalizeText(editor?.innerText || editor?.textContent);
}

function parseWeight(value: string): { weight: number | null; weightUnit: "g" | "kg" | null } {
  const number = parseNumber(value);
  const unitMatch = value.match(/\b(kg|g)\b/i);
  return {
    weight: number,
    weightUnit: unitMatch ? unitMatch[1].toLowerCase() as "g" | "kg" : null
  };
}

function packageWeightFromContainer(root: ParentNode): {
  weight: number | null;
  weightUnit: "g" | "kg" | null;
} {
  const labelCandidates = Array.from(root.querySelectorAll<HTMLElement>("*"))
    .filter((element) => {
      const text = normalizeText(element.innerText || element.textContent);
      return text.length <= 40 && /包裹重量/.test(text);
    })
    .sort((left, right) =>
      normalizeText(left.innerText || left.textContent).length
      - normalizeText(right.innerText || right.textContent).length
    );

  for (const label of labelCandidates) {
    let container = label.parentElement;
    for (let depth = 0; container && depth < 10; depth += 1, container = container.parentElement) {
      const numericInput = container.querySelector<HTMLInputElement>("input.jx-input__inner");
      if (!numericInput) continue;

      const parsedWeight = parseNumber(numericInput.value);
      if (parsedWeight === null) continue;

      const unitInput = container.querySelector<HTMLInputElement>("input.jx-select__input");
      const unitRegion = unitInput?.parentElement;
      const unitText = normalizeText([
        unitInput?.value,
        unitRegion?.innerText || unitRegion?.textContent
      ].filter(Boolean).join(" "));
      const unit = unitText.match(/\b(kg|g)\b/i)?.[1].toLowerCase() as "g" | "kg" | undefined;
      return { weight: parsedWeight, weightUnit: unit ?? null };
    }
  }

  return { weight: null, weightUnit: null };
}

function collectAttributes(fields: FieldDescriptor[]): Record<string, string> {
  const attributes: Record<string, string> = {};
  const corePatterns = [...Object.values(fieldPatterns), titleLabelPattern];

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

function productEditorRoot(document: Document): HTMLElement | null {
  const modalCandidates = Array.from(document.querySelectorAll<HTMLElement>(
    ".el-dialog, [role='dialog'], .ant-modal, .el-drawer, [class*='modal'], [class*='drawer']"
  )).reverse();
  const modal = modalCandidates.find((candidate) => {
    const text = normalizeText(candidate.innerText || candidate.textContent);
    return /(?:商品|产品)标题|sku|品牌|重量|商品信息|产品信息/i.test(text)
      && candidate.querySelector(controlSelector);
  });
  if (modal) return modal;

  const productField = Array.from(document.querySelectorAll<HTMLElement>(controlSelector))
    .find((field) => /(?:商品|产品)标题|sku|品牌|重量|商品描述|产品描述/i.test(explicitLabel(field)));
  if (!productField) return null;
  return productField.closest<HTMLElement>("form, .el-form, .ant-form, [class*='form']")
    ?? productField.closest<HTMLElement>("[role='group'], section")
    ?? null;
}

function isSensitiveField(field: HTMLElement, label: string): boolean {
  const metadata = [
    label,
    field.getAttribute("type"),
    field.getAttribute("name"),
    field.id,
    field.getAttribute("placeholder"),
    field.getAttribute("aria-label")
  ].join(" ");
  return /password/i.test(field.getAttribute("type") ?? "") || sensitivePattern.test(metadata);
}

function sectionName(field: HTMLElement, root: HTMLElement): string {
  const section = field.closest<HTMLElement>(
    ".el-form-item, .ant-form-item, section, fieldset, [role='group'], [class*='section'], [class*='form-item']"
  );
  if (!section || section === root) return "";
  const heading = section.querySelector("legend, h1, h2, h3, h4, .el-form-item__label, [class*='title']");
  return normalizeText(heading?.textContent).slice(0, 120);
}

function currentTab(root: HTMLElement): string {
  const tab = root.querySelector<HTMLElement>(
    "[role='tab'][aria-selected='true'], .el-tabs__item.is-active, .ant-tabs-tab-active, [class*='tab'][class*='active']"
  );
  return normalizeText(tab?.textContent).slice(0, 120);
}

export function collectProductFieldDiagnostics(document: Document): ProductFieldDiagnostic[] {
  const root = productEditorRoot(document);
  if (!root) return [];

  const tab = currentTab(root);
  const controls = root.querySelectorAll<HTMLElement>(controlSelector);
  return Array.from(controls)
    .filter((field) => !isSwitchControl(field) && !isSensitiveField(field, explicitLabel(field)))
    .map((field) => {
      const label = explicitLabel(field);
      const dataAttributes: Record<string, string> = {};
      for (const attribute of Array.from(field.attributes)) {
        if (attribute.name.startsWith("data-") && !sensitivePattern.test(attribute.name)) {
          dataAttributes[attribute.name] = attribute.value;
        }
      }
      return {
        tagName: field.tagName.toLowerCase(),
        label,
        inputType: field instanceof HTMLInputElement ? field.type : "",
        name: sensitivePattern.test(field.getAttribute("name") ?? "") ? "" : field.getAttribute("name") ?? "",
        id: sensitivePattern.test(field.id) ? "" : field.id,
        class: field.className.toString().slice(0, 300),
        placeholder: field.getAttribute("placeholder") ?? "",
        ariaLabel: field.getAttribute("aria-label") ?? "",
        value: isSensitiveField(field, label) ? "" : controlValue(field),
        dataAttributes,
        parentText: isSensitiveField(field, label)
          ? ""
          : normalizeText(field.parentElement?.parentElement?.innerText).slice(0, 300),
        section: sectionName(field, root),
        currentTab: tab
      };
    })
    .filter((diagnostic) =>
      diagnostic.label || diagnostic.name || diagnostic.id || diagnostic.placeholder || diagnostic.ariaLabel
    );
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
  const editorRoot = productEditorRoot(document) ?? document;
  const fields = collectFields(editorRoot);
  const globalNetIncomeValue = valueForPattern(fields, editorRoot, "globalNetIncome");
  const siteNetIncomeValue = valueForPattern(fields, editorRoot, "siteNetIncome");
  const estimatedSalePriceValue = valueForPattern(fields, editorRoot, "estimatedSalePrice");
  const salePriceValue = valueForPattern(fields, editorRoot, "price") || estimatedSalePriceValue;
  const netIncomeMode = Boolean(globalNetIncomeValue || siteNetIncomeValue);
  const globalNetIncome = parseNumber(globalNetIncomeValue);
  const siteNetIncome = parseNumber(siteNetIncomeValue);
  const estimatedSalePrice = parseNumber(estimatedSalePriceValue);
  const pricingMode = netIncomeMode
    ? "net_income"
    : estimatedSalePrice !== null || salePriceValue
      ? "sale_price"
      : null;
  const weight = packageWeightFromContainer(editorRoot);

  return {
    title: findTitle(fields),
    description: findField(fields, "description") || richDescription(document),
    sku: findField(fields, "sku"),
    price: netIncomeMode ? null : parseNumber(salePriceValue),
    pricingMode,
    globalNetIncome,
    siteNetIncome,
    estimatedSalePrice,
    currency: currencyFrom(globalNetIncomeValue, siteNetIncomeValue, estimatedSalePriceValue, salePriceValue),
    brand: findField(fields, "brand"),
    weight: weight.weight,
    weightUnit: weight.weightUnit,
    length: parseNumber(findField(fields, "length")),
    width: parseNumber(findField(fields, "width")),
    height: parseNumber(findField(fields, "height")),
    attributes: collectAttributes(fields),
    images: collectImages(document),
    sourceUrl: location.href,
    extractedAt: new Date().toISOString()
  };
}
