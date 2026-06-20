#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listModelProductsWithConfig } from "../lib/model-products-server.js";
import { listPublishedModels } from "../lib/admin-commercial-config.js";
import { getContent } from "../lib/content-cms.js";
import { sortModelsForDisplay, getModelProviderFamily, getModelSeriesScore, getModelVersionScore } from "../lib/models/model-sorter.js";
import { MODEL_CATALOG } from "../lib/models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const reportPath = path.join(repoRoot, "FLOWAPI_MODEL_GLOBAL_SORTING_REPORT.md");

function formatTop(models, count = 8) {
  return sortModelsForDisplay(models)
    .slice(0, count)
    .map((model) => `- ${model.displayName || model.name || model.modelId || model.id} · ${model.modelId || model.publicModelId || model.id} · ${getModelProviderFamily(model)} · series=${getModelSeriesScore(model)} · version=${getModelVersionScore(model)}`)
    .join("\n");
}

async function main() {
  const productRows = await listModelProductsWithConfig({ includeUnavailable: true }).catch(() => []);
  const publishedRows = await listPublishedModels().catch(() => []);
  const cmsModels = getContent("models") || [];
  const apiCatalog = [...MODEL_CATALOG];

  const report = [
    "# FLOWAPI_MODEL_GLOBAL_SORTING_REPORT",
    "",
    "## 统一排序入口",
    "- `lib/models/model-sorter.js`",
    "- `lib/models/model-sorter.ts`",
    "",
    "## 当前排序摘要",
    "### `MODEL_CATALOG`",
    formatTop(apiCatalog),
    "",
    "### `listModelProductsWithConfig()`",
    formatTop(productRows),
    "",
    "### `getContent('models')`",
    formatTop(cmsModels),
    "",
    "### `listPublishedModels()`",
    formatTop(publishedRows),
    "",
    "## 规则概览",
    "- 排序优先级：厂商组 → `displayOrder` → `featured` → 重点模型精确匹配 → 系列 → 版本 → 热度 → 发布时间 → 名称",
    "- 厂商优先级：OpenAI → Anthropic → Google → xAI → DeepSeek → Alibaba → Moonshot → Other",
    "- 搜索后保持同一排序函数",
    "",
    "## 说明",
    "- 本脚本只生成排序审计报告，不改写线上数据。",
    "- 需要手工排序时，可继续使用现有后台字段并通过统一排序函数生效。",
    "",
  ].join("\n");

  fs.writeFileSync(reportPath, report, "utf8");
  process.stdout.write(`${reportPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
