# FLOWAPI_MODEL_GLOBAL_SORTING_REPORT

## 统一排序入口
- `lib/models/model-sorter.js`
- `lib/models/model-sorter.ts`

## 当前排序摘要
### `MODEL_CATALOG`
- GPT5.5 · flowapi-gpt55 · openai · series=1005000 · version=55000
- GPT5.5 Pro · flowapi-gpt55-pro · openai · series=1005000 · version=55000
- GPT5.4 mini · flowapi-gpt54 · openai · series=1003000 · version=54000
- GPT5.4 Pro · flowapi-gpt54-pro · openai · series=1003000 · version=54000
- GPT5.3 Codex Pro · flowapi-codex-pro · openai · series=905030 · version=5030
- GPT5.3 Codex Plus · flowapi-codex-plus · openai · series=895030 · version=5030
- GPT5.3 Codex Lite · flowapi-codex-lite · openai · series=885030 · version=5030
- GPT4o mini · flowapi-gpt4o-mini · openai · series=943000 · version=4000

### `listModelProductsWithConfig()`
- GPT5.5 · gpt-5.5 · openai · series=1005000 · version=55000
- GPT5.5 Pro · gpt-5.5-pro · openai · series=1005000 · version=55000
- GPT-5.5 · gpt-5.5 · openai · series=955050 · version=5050
- GPT5.4 mini · gpt-5.4-mini · openai · series=1003000 · version=54000
- GPT5.4 Pro · gpt-5.4-pro · openai · series=1003000 · version=54000
- GPT5.3 Codex Pro · gpt-5.3-codex-pro · openai · series=905030 · version=5030
- GPT5.3 Codex Plus · gpt-5.3-codex-plus · openai · series=895030 · version=5030
- GPT5.3 Codex Lite · gpt-5.3-codex-lite · openai · series=885030 · version=5030

### `getContent('models')`
- GPT-5.5 · flowapi-gpt55-pro · openai · series=1005000 · version=55000
- GPT-5.3-Codex · flowapi-codex-plus · openai · series=895030 · version=5030
- GPT-5.5 · flowapi-gpt55 · openai · series=1005000 · version=55000
- GPT-5.4 · flowapi-gpt54-pro · openai · series=1003000 · version=54000
- GPT-5.4 mini · flowapi-gpt54 · openai · series=1003000 · version=54000
- GPT-5.3-Codex · flowapi-codex-pro · openai · series=905030 · version=5030
- GPT-5.3-Codex · flowapi-codex-lite · openai · series=885030 · version=5030
- GPT-4o mini · flowapi-gpt4o-mini · openai · series=943000 · version=4000

### `listPublishedModels()`


## 规则概览
- 排序优先级：厂商组 → `displayOrder` → `featured` → 重点模型精确匹配 → 系列 → 版本 → 热度 → 发布时间 → 名称
- 厂商优先级：OpenAI → Anthropic → Google → xAI → DeepSeek → Alibaba → Moonshot → Other
- 搜索后保持同一排序函数

## 说明
- 本脚本只生成排序审计报告，不改写线上数据。
- 需要手工排序时，可继续使用现有后台字段并通过统一排序函数生效。
