import { mountAssistant } from "../src/ui/assistant";
import { extractMiaoshouProduct, isProductEditorPage } from "../src/miaoshou/extractor";

export default defineContentScript({
  matches: [
    "*://*.miaoshou.com/*",
    "*://*.miaoshou.com.cn/*",
    "*://*.miaoshou.cn/*"
  ],
  runAt: "document_idle",
  main() {
    let mounted = false;
    let observer: MutationObserver | undefined;
    let observerTimeout: number | undefined;
    let observedChanges = 0;
    let scheduledCheck = false;

    const stopObserving = () => {
      observer?.disconnect();
      observer = undefined;
      if (observerTimeout !== undefined) {
        window.clearTimeout(observerTimeout);
        observerTimeout = undefined;
      }
    };

    const checkPage = () => {
      scheduledCheck = false;
      if (!mounted && isProductEditorPage(document, location)) {
        mountAssistant(document, () => extractMiaoshouProduct(document, location));
        mounted = true;
        console.info("[Miaoshou AI] Assistant mounted on a product editor page.");
      }
    };

    const scheduleCheck = () => {
      if (scheduledCheck) return;
      scheduledCheck = true;
      window.setTimeout(checkPage, 250);
    };

    const startBoundedObserver = () => {
      if (!document.body || observer) return;
      observedChanges = 0;
      observer = new MutationObserver((records) => {
        if (records.every((record) => record.target.parentElement?.closest("[data-miaoshou-ai-root]"))) {
          return;
        }

        observedChanges += 1;
        scheduleCheck();
        if (observedChanges >= 120) stopObserving();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      observerTimeout = window.setTimeout(stopObserving, 60_000);
    };

    checkPage();
    startBoundedObserver();
    window.addEventListener("popstate", scheduleCheck);
    window.addEventListener("hashchange", scheduleCheck);
    window.addEventListener("pageshow", scheduleCheck);
  }
});
