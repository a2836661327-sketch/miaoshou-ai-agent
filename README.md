# 妙手 AI 助手（V0.1）

一个使用 WXT、TypeScript 和 WebExtension API 构建的跨浏览器扩展。当前版本只尝试读取妙手 ERP 商品编辑页上的商品信息，不调用 AI 服务，也不会修改或保存商品。

## 环境与构建

需要 Node.js 20 或更高版本。

```bash
npm install
npm run compile
npm run build
npm run build:firefox
```

构建输出位于 `.output/`。Chromium 构建使用 Manifest V3；Firefox 构建由 WXT 生成 Firefox 扩展包。也可以运行 `npm run dev` 或 `npm run dev:firefox` 启动对应浏览器的开发构建。

仓库的 GitHub Actions 会在每次 push 或手动运行时构建 Chromium 和 Firefox 版本，并分别上传 `.output/chrome-mv3/`、`.output/firefox-mv2/` 作为构建 artifact。下载方式：打开 GitHub 仓库的 **Actions**，进入最近一次 **Build browser extensions** 成功运行，在页面底部 **Artifacts** 区域下载 `miaoshou-ai-chromium-v0.1-fields-drag` 或 `miaoshou-ai-firefox-v0.1-fields-drag`。Chromium artifact 下载后解压，选择直接包含 `manifest.json` 的扩展目录。

助手按钮可在视口内拖动，位置保存在扩展本地存储中；双击按钮可恢复默认位置。助手面板中的“导出字段诊断”仅导出商品编辑区域的表单 DOM 元数据，不读取浏览器存储、Cookie 或凭据字段。

在本地打包 Chromium 测试目录（需先运行 `npm run build`）：

```powershell
Compress-Archive -Path .output\chrome-mv3 -DestinationPath miaoshou-ai-chromium-v0.1.zip -Force
```

解压 ZIP 后，在扩展管理页选择解压出的 `chrome-mv3` 文件夹。

## 加载测试

### Chrome、Edge、Brave、Opera、QQ、360

1. 执行 `npm run build`，或从 GitHub Actions 下载 Chromium artifact 并解压。
2. 打开浏览器扩展管理页（Chrome/Brave/Opera：`chrome://extensions`；Edge：`edge://extensions`；QQ、360 使用各自的扩展管理页）。
3. 开启“开发者模式”并选择“加载已解压的扩展程序”。
4. 选择 `.output/chrome-mv3` 目录（本地构建），或下载并解压后的 `chrome-mv3` 目录。
5. 打开妙手 ERP 商品编辑页，点击右下角“妙手 AI”，再点击“读取当前商品”。

### Firefox

1. 执行 `npm run build:firefox`。
2. 打开 `about:debugging#/runtime/this-firefox`，点击“临时载入附加组件”。
3. 选择 `.output/firefox-mv2/manifest.json`（如当前 WXT 版本输出目录名称不同，请选择 `.output/firefox-*` 中生成的 manifest）。
4. 打开妙手 ERP 商品编辑页并按上述步骤测试。

临时加载的 Firefox 扩展在关闭浏览器后会被移除。

## 当前读取方式与边界

提取器单独位于 `src/miaoshou/extractor.ts`，基于页面可见控件的标签、名称、占位文本和常见富文本编辑器进行启发式匹配。由于妙手可能调整页面结构、控件标签或编辑器实现，字段读取并非稳定的官方接口；特别是属性表格、富文本描述和商品图片可能需要根据真实页面 DOM 增加专用选择器。

扩展在 `https://erp.91miaoshou.com/*` 全站运行，并在该站点的所有 frame 中注入，包括 Mercado Libre 采集箱列表页与商品编辑弹窗/页面。商品字段提取仍是启发式读取，页面本身若通过跨域 iframe 加载，浏览器的同源与扩展权限规则仍可能限制内容访问。
