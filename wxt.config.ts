import { defineConfig } from "wxt";

const miaoshouMatches = [
  "*://*.miaoshou.com/*",
  "*://*.miaoshou.com.cn/*",
  "*://*.miaoshou.cn/*"
];

export default defineConfig({
  manifest: {
    name: "妙手 AI",
    description: "读取妙手 ERP 当前商品信息",
    version: "0.1.0",
    permissions: [],
    host_permissions: miaoshouMatches,
    browser_specific_settings: {
      gecko: {
        id: "miaoshou-ai@example.com",
        strict_min_version: "109.0",
        data_collection_permissions: {
          required: ["none"]
        }
      }
    }
  }
});
