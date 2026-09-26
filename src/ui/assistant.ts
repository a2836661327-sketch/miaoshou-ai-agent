import type { MiaoshouProduct } from "../shared/product";
import type { ProductFieldDiagnostic } from "../miaoshou/extractor";
import { storage } from "wxt/utils/storage";

type ProductReader = () => MiaoshouProduct;
type FieldDiagnosticReader = () => ProductFieldDiagnostic[];

interface LauncherPosition {
  x: number;
  y: number;
}

const launcherPositionStorage = storage.defineItem<LauncherPosition | null>(
  "local:launcher-position",
  { defaultValue: null }
);

const styles = `
  :host { all: initial; color: #202124; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  button { font: inherit; cursor: pointer; }
  .launcher { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; border: 0; border-radius: 999px; padding: 13px 18px; background: #2563eb; color: #fff; font-weight: 700; box-shadow: 0 8px 24px #17255455; cursor: grab; touch-action: none; user-select: none; }
  .launcher.dragging { cursor: grabbing; }
  .panel { position: fixed; z-index: 2147483646; top: 16px; right: 16px; bottom: 16px; display: flex; flex-direction: column; width: min(420px, calc(100vw - 32px)); overflow: hidden; border: 1px solid #dbe2ea; border-radius: 14px; background: #fff; box-shadow: 0 16px 50px #17255440; transform: translateX(calc(100% + 24px)); transition: transform 180ms ease; }
  .panel.open { transform: translateX(0); }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #e5e7eb; }
  .title { margin: 0; color: #111827; font-size: 17px; font-weight: 700; }
  .close { border: 0; background: transparent; color: #64748b; font-size: 22px; }
  .content { flex: 1; overflow: auto; padding: 16px 18px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 18px; border-top: 1px solid #e5e7eb; }
  .primary, .secondary { border: 0; border-radius: 8px; padding: 10px 12px; }
  .primary { flex: 1; background: #2563eb; color: #fff; font-weight: 700; }
  .primary:disabled { opacity: .6; cursor: wait; }
  .secondary { background: #eef2f7; color: #334155; }
  .diagnostic { flex-basis: 100%; background: #f8fafc; color: #475569; font-size: 12px; }
  .status, .empty { color: #64748b; }
  .error { color: #b91c1c; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field { min-width: 0; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; }
  .field.wide { grid-column: 1 / -1; }
  .label { display: block; margin-bottom: 3px; color: #64748b; font-size: 12px; }
  .value { overflow-wrap: anywhere; color: #111827; white-space: pre-wrap; }
  .section-title { margin: 18px 0 8px; font-size: 14px; }
  .list { margin: 0; padding-left: 18px; overflow-wrap: anywhere; }
  .raw { margin-top: 14px; padding: 12px; overflow: auto; border-radius: 8px; background: #f1f5f9; font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountAssistant(
  document: Document,
  readProduct: ProductReader,
  readDiagnostics: FieldDiagnosticReader
): void {
  if (document.querySelector("[data-miaoshou-ai-root]")) return;

  const host = document.createElement("div");
  host.dataset.miaoshouAiRoot = "true";
  document.body.append(host);

  const root = host.attachShadow({ mode: "open" });
  const stylesheet = element("style");
  stylesheet.textContent = styles;
  root.append(stylesheet);

  const launcher = element("button", "launcher", "妙手 AI");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "打开妙手 AI 助手");

  const panel = element("section", "panel");
  panel.setAttribute("aria-label", "妙手 AI 助手面板");
  panel.setAttribute("aria-hidden", "true");

  const header = element("header", "header");
  header.append(element("h2", "title", "妙手 AI 助手"));
  const close = element("button", "close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "关闭面板");
  header.append(close);

  const content = element("main", "content");
  const status = element("p", "empty", "点击“读取当前商品”尝试读取本页商品信息。");
  content.append(status);

  const actions = element("footer", "actions");
  const readButton = element("button", "primary", "读取当前商品");
  readButton.type = "button";
  const rawButton = element("button", "secondary", "查看原始 JSON");
  rawButton.type = "button";
  rawButton.hidden = true;
  const diagnosticButton = element("button", "secondary diagnostic", "导出字段诊断");
  diagnosticButton.type = "button";
  actions.append(readButton, rawButton, diagnosticButton);
  panel.append(header, content, actions);
  root.append(launcher, panel);

  let currentProduct: MiaoshouProduct | undefined;
  let rawVisible = false;
  let suppressNextClick = false;
  let clickTimer: number | undefined;
  let pointerStart: { pointerId: number; x: number; y: number; left: number; top: number } | undefined;
  let dragging = false;
  let hasUserPositioned = false;
  let previousUserSelect = "";

  const closePanel = () => {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  };
  const togglePanel = () => {
    const open = !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
  };

  const clampPosition = (x: number, y: number): LauncherPosition => {
    const bounds = launcher.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - bounds.width)),
      y: Math.max(0, Math.min(y, window.innerHeight - bounds.height))
    };
  };

  const setPosition = (position: LauncherPosition) => {
    const clamped = clampPosition(position.x, position.y);
    launcher.style.left = `${clamped.x}px`;
    launcher.style.top = `${clamped.y}px`;
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    return clamped;
  };

  const savePosition = async (position: LauncherPosition | null) => {
    try {
      await launcherPositionStorage.setValue(position);
    } catch (error) {
      console.error("[Miaoshou AI] Failed to save launcher position.", error);
    }
  };

  void launcherPositionStorage.getValue().then((position) => {
    if (position && !hasUserPositioned) setPosition(position);
  }).catch((error: unknown) => {
    console.error("[Miaoshou AI] Failed to restore launcher position.", error);
  });

  launcher.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    hasUserPositioned = true;
    const bounds = launcher.getBoundingClientRect();
    pointerStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top
    };
    dragging = false;
    launcher.setPointerCapture(event.pointerId);
  });

  launcher.addEventListener("pointermove", (event) => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    if (!dragging && Math.hypot(deltaX, deltaY) > 5) {
      dragging = true;
      hasUserPositioned = true;
      launcher.classList.add("dragging");
      previousUserSelect = document.documentElement.style.userSelect;
      document.documentElement.style.userSelect = "none";
    }
    if (dragging) {
      event.preventDefault();
      setPosition({ x: pointerStart.left + deltaX, y: pointerStart.top + deltaY });
    }
  });

  const finishPointer = (event: PointerEvent) => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
    if (dragging) {
      suppressNextClick = true;
      launcher.classList.remove("dragging");
      document.documentElement.style.userSelect = previousUserSelect;
      const bounds = launcher.getBoundingClientRect();
      void savePosition({ x: bounds.left, y: bounds.top });
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
    pointerStart = undefined;
    dragging = false;
  };

  launcher.addEventListener("pointerup", finishPointer);
  launcher.addEventListener("pointercancel", finishPointer);
  launcher.addEventListener("click", (event) => {
    if (suppressNextClick || event.detail > 1) return;
    clickTimer = window.setTimeout(() => {
      clickTimer = undefined;
      togglePanel();
    }, 300);
  });
  launcher.addEventListener("dblclick", (event) => {
    event.preventDefault();
    if (clickTimer !== undefined) {
      window.clearTimeout(clickTimer);
      clickTimer = undefined;
    }
    launcher.style.left = "";
    launcher.style.top = "";
    launcher.style.right = "24px";
    launcher.style.bottom = "24px";
    hasUserPositioned = true;
    void savePosition(null);
  });

  window.addEventListener("resize", () => {
    if (!launcher.style.left || !launcher.style.top) return;
    const bounds = launcher.getBoundingClientRect();
    const clamped = clampPosition(bounds.left, bounds.top);
    if (clamped.x !== bounds.left || clamped.y !== bounds.top) {
      const position = setPosition(clamped);
      void savePosition(position);
    }
  });

  close.addEventListener("click", closePanel);

  diagnosticButton.addEventListener("click", () => {
    try {
      const diagnostic = readDiagnostics();
      const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), fields: diagnostic }, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const download = element("a");
      download.href = url;
      download.download = "miaoshou-field-diagnostic.json";
      root.append(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      console.info(`[Miaoshou AI] Exported ${diagnostic.length} product field diagnostics.`);
    } catch (error) {
      console.error("[Miaoshou AI] Failed to export field diagnostics.", error);
    }
  });

  rawButton.addEventListener("click", () => {
    if (!currentProduct) return;
    rawVisible = !rawVisible;
    rawButton.textContent = rawVisible ? "隐藏原始 JSON" : "查看原始 JSON";
    renderProduct(content, currentProduct, rawVisible);
  });

  readButton.addEventListener("click", () => {
    readButton.disabled = true;
    readButton.textContent = "读取中…";
    try {
      currentProduct = readProduct();
      rawVisible = false;
      rawButton.hidden = false;
      rawButton.textContent = "查看原始 JSON";
      renderProduct(content, currentProduct, rawVisible);
      console.info("[Miaoshou AI] Current product data extracted.");
    } catch (error) {
      console.error("[Miaoshou AI] Failed to read current product.", error);
      content.replaceChildren(element("p", "error", "读取页面信息时发生错误，请稍后重试。"));
    } finally {
      readButton.disabled = false;
      readButton.textContent = "读取当前商品";
    }
  });
}

function renderProduct(
  content: HTMLElement,
  product: MiaoshouProduct,
  rawVisible: boolean
): void {
  content.replaceChildren();
  const fields = element("div", "fields");
  const displayFields: Array<[string, string, boolean]> = [
    ["商品标题", product.title, true],
    ["SKU", product.sku, false],
    ["价格", product.price === null ? "" : `${product.price}${product.currency ? ` ${product.currency}` : ""}`, false],
    ["定价模式", product.pricingMode === "net_income" ? "净收益模式" : product.pricingMode === "sale_price" ? "定价模式" : "", false],
    ["全球净收益", product.globalNetIncome === null ? "" : `${product.globalNetIncome}${product.currency ? ` ${product.currency}` : ""}`, false],
    ["站点净收益", product.siteNetIncome === null ? "" : `${product.siteNetIncome}${product.currency ? ` ${product.currency}` : ""}`, false],
    ["预计售价", product.estimatedSalePrice === null ? "" : `${product.estimatedSalePrice}${product.currency ? ` ${product.currency}` : ""}`, false],
    ["品牌", product.brand, false],
    ["重量", product.weight === null ? "" : `${product.weight}${product.weightUnit ?? ""}`, false],
    ["长度", product.length === null ? "" : String(product.length), false],
    ["宽度", product.width === null ? "" : String(product.width), false],
    ["高度", product.height === null ? "" : String(product.height), false],
    ["商品描述", product.description, true]
  ];

  for (const [label, value, wide] of displayFields) {
    const item = element("div", wide ? "field wide" : "field");
    item.append(element("span", "label", label));
    item.append(element("div", "value", value || "未读取到"));
    fields.append(item);
  }
  content.append(fields);

  const attributeEntries = Object.entries(product.attributes);
  content.append(element("h3", "section-title", `商品属性（${attributeEntries.length}）`));
  if (attributeEntries.length) {
    const list = element("ul", "list");
    for (const [key, value] of attributeEntries) {
      list.append(element("li", undefined, `${key}：${value}`));
    }
    content.append(list);
  } else {
    content.append(element("p", "status", "未读取到商品属性"));
  }

  content.append(element("h3", "section-title", `图片 URL（${product.images.length}）`));
  if (product.images.length) {
    const list = element("ul", "list");
    for (const url of product.images) list.append(element("li", undefined, url));
    content.append(list);
  } else {
    content.append(element("p", "status", "未读取到图片 URL"));
  }

  if (rawVisible) {
    content.append(element("pre", "raw", JSON.stringify(product, null, 2)));
  }
}
