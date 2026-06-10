#!/bin/bash
# ============================================================================
# FlowAPI + sub2api 模型同步上线 & 商业化评估 - 自动化测试脚本
#
# 使用方法:
#   chmod +x scripts/full-test.sh
#   bash scripts/full-test.sh
#
# 注意: 本脚本不包含硬编码的敏感 Key，所有 Key 从 .env.local 读取
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"
WARN="${YELLOW}WARN${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RESULTS=""
TOTAL=0
PASSED=0
FAILED=0

report() {
  local status="$1"
  local test="$2"
  local detail="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$status" = "PASS" ]; then PASSED=$((PASSED + 1)); fi
  if [ "$status" = "FAIL" ]; then FAILED=$((FAILED + 1)); fi
  echo -e "  [$status] $test"
  if [ -n "$detail" ]; then echo -e "         $detail"; fi
}

echo ""
echo "=============================================================================="
echo "  FlowAPI + sub2api 模型同步上线 & 商业化评估测试"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================================================="
echo ""

# ===== 加载配置 =====
ENV_FILE="$PROJECT_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
  SUB2API_KEY=$(grep SUB2API_API_KEY "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  SUB2API_BASE=$(grep SUB2API_BASE_URL "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  FLOWAPI_SECRET=$(grep ADMIN_SECRET "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  UNIAPI_KEY=$(grep UNIAPI_API_KEY "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
fi

SUB2API_BASE="${SUB2API_BASE:-http://localhost:8080}"
FLOWAPI_BASE="http://localhost:3000"
NEWAPI_BASE="http://localhost:3001"
SUB2API_KEY="${SUB2API_KEY:-""}"
FLOWAPI_SECRET="${FLOWAPI_SECRET:-flowapi-admin-2024}"
UNIAPI_KEY="${UNIAPI_KEY:-""}"

echo "--- 配置检查 ---"
echo "  Sub2API Base: $SUB2API_BASE"
echo "  FlowAPI Base: $FLOWAPI_BASE"
echo "  Sub2API Key:  ${SUB2API_KEY:0:12}..."
echo "  Admin Secret: ${FLOWAPI_SECRET:0:12}..."
echo ""

# ============================================================================
# 第一阶段: 确认 sub2api 模型可用
# ============================================================================
echo "=========================================="
echo "  第一阶段: sub2api 模型状态检查"
echo "=========================================="

# 1.1 sub2api 服务状态
if curl -s -o /dev/null -w "%{http_code}" "$SUB2API_BASE/v1/models" -H "Authorization: Bearer $SUB2API_KEY" | grep -q "200"; then
  report PASS "sub2api 服务可达"
else
  report FAIL "sub2api 服务不可达" "请检查 Docker: docker ps | grep sub2api"
fi

# 1.2 模型列表
MODELS=$(curl -s "$SUB2API_BASE/v1/models" -H "Authorization: Bearer $SUB2API_KEY" 2>/dev/null)
MODEL_COUNT=$(echo "$MODELS" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null || echo "0")
echo ""
echo "  sub2api 可用模型 ($MODEL_COUNT 个):"
echo "$MODELS" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for m in d.get('data',[]):
    print(f'    - {m[\"id\"]}')
" 2>/dev/null

# 1.3 GPT-5.5 真实调用
echo ""
echo "  --- 测试 GPT-5.5 ---"
GPT55_START=$(python3 -c "import time; print(int(time.time()*1000))")
GPT55_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  "$SUB2API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SUB2API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.5","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}')
GPT55_END=$(python3 -c "import time; print(int(time.time()*1000))")
GPT55_HTTP=$(echo "$GPT55_RESP" | grep "HTTP:" | cut -d: -f2)
GPT55_LATENCY=$((GPT55_END - GPT55_START))

if [ "$GPT55_HTTP" = "200" ]; then
  GPT55_USAGE=$(echo "$GPT55_RESP" | grep -v "HTTP:" | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d.get('usage',{})
print(f'in={u.get(\"prompt_tokens\")} out={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
" 2>/dev/null)
  report PASS "GPT-5.5 可用" "HTTP:$GPT55_HTTP | ${GPT55_LATENCY}ms | tokens: $GPT55_USAGE"
else
  GPT55_ERR=$(echo "$GPT55_RESP" | grep -v "HTTP:" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error',{}).get('message','?'))" 2>/dev/null)
  report FAIL "GPT-5.5 不可用" "HTTP:$GPT55_HTTP | $GPT55_ERR"
fi

# 1.4 Codex 测试
echo ""
echo "  --- 测试 Codex (gpt-5.3-codex) ---"
CODEX_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  "$SUB2API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SUB2API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}')
CODEX_HTTP=$(echo "$CODEX_RESP" | grep "HTTP:" | cut -d: -f2)

if [ "$CODEX_HTTP" = "200" ]; then
  CODEX_USAGE=$(echo "$CODEX_RESP" | grep -v "HTTP:" | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d.get('usage',{})
print(f'in={u.get(\"prompt_tokens\")} out={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
" 2>/dev/null)
  report PASS "Codex (gpt-5.3-codex) 可用" "HTTP:$CODEX_HTTP | tokens: $CODEX_USAGE"
else
  CODEX_ERR=$(echo "$CODEX_RESP" | grep -v "HTTP:" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error',{}).get('message','?'))" 2>/dev/null)
  report FAIL "Codex (gpt-5.3-codex) 不可用" "HTTP:$CODEX_HTTP | $CODEX_ERR"
fi

# 1.5 codex-auto-review 测试
echo ""
echo "  --- 测试 Codex Auto Review ---"
AUTO_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  "$SUB2API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SUB2API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"codex-auto-review","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}')
AUTO_HTTP=$(echo "$AUTO_RESP" | grep "HTTP:" | cut -d: -f2)

if [ "$AUTO_HTTP" = "200" ]; then
  AUTO_USAGE=$(echo "$AUTO_RESP" | grep -v "HTTP:" | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d.get('usage',{})
print(f'in={u.get(\"prompt_tokens\")} out={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
" 2>/dev/null)
  report PASS "codex-auto-review 可用" "HTTP:$AUTO_HTTP | tokens: $AUTO_USAGE"
else
  AUTO_ERR=$(echo "$AUTO_RESP" | grep -v "HTTP:" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error',{}).get('message','?'))" 2>/dev/null)
  report FAIL "codex-auto-review 不可用" "HTTP:$AUTO_HTTP | $AUTO_ERR"
fi

# 1.6 GPT-5.4 测试
echo ""
echo "  --- 测试 GPT-5.4 ---"
GPT54_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  "$SUB2API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SUB2API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}')
GPT54_HTTP=$(echo "$GPT54_RESP" | grep "HTTP:" | cut -d: -f2)

if [ "$GPT54_HTTP" = "200" ]; then
  GPT54_USAGE=$(echo "$GPT54_RESP" | grep -v "HTTP:" | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d.get('usage',{})
print(f'in={u.get(\"prompt_tokens\")} out={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
" 2>/dev/null)
  report PASS "GPT-5.4 可用" "HTTP:$GPT54_HTTP | tokens: $GPT54_USAGE"
else
  report FAIL "GPT-5.4 不可用" "HTTP:$GPT54_HTTP"
fi

echo ""

# ============================================================================
# 第二阶段: FlowAPI 模型同步检查
# ============================================================================
echo "=========================================="
echo "  第二阶段: FlowAPI 模型广场检查"
echo "=========================================="

# 2.1 FlowAPI 服务状态
if curl -s -o /dev/null -w "%{http_code}" "$FLOWAPI_BASE" | grep -q "200"; then
  report PASS "FlowAPI 服务运行中" "$FLOWAPI_BASE"
else
  report FAIL "FlowAPI 未运行" "请运行: cd token-router2 && npm run dev"
fi

# 2.2 模型列表 API
FLOWAPI_MODELS=$(curl -s "$FLOWAPI_BASE/api/models" -H "x-admin-secret: $FLOWAPI_SECRET" 2>/dev/null)
echo ""
echo "  FlowAPI 模型产品:"
echo "$FLOWAPI_MODELS" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    products=d.get('products',d.get('data',[]))
    for p in products:
        status='✅' if p.get('isAvailable') else '⏳' if p.get('isComingSoon') else '❌'
        print(f'    {status} {p.get(\"displayName\",\"?\")} | id={p.get(\"id\",\"?\")} | model={p.get(\"actualModelId\",\"?\")} | provider={p.get(\"provider\",\"?\")}')
except: print('  parse error')
" 2>/dev/null || echo "  (无法获取模型列表)"

echo ""

# ============================================================================
# 第三阶段: FlowAPI API Key 创建 & 真实调用
# ============================================================================
echo "=========================================="
echo "  第三阶段: FlowAPI API Key & 真实调用"
echo "=========================================="

# 3.1 创建测试 API Key
echo "  --- 创建测试 API Key ---"
CREATE_KEY_RESP=$(curl -s -X POST "$FLOWAPI_BASE/api/customer/keys" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $FLOWAPI_SECRET" \
  -d '{"customerId":"cus_admin","publicModelId":"flowapi-gpt55","label":"test-gpt55-auto"}' 2>/dev/null)

echo "$CREATE_KEY_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('ok') or d.get('token'):
    t=d.get('token','***')
    print(f'  Key created: {t[:20]}...')
else:
    print(f'  Error: {d.get(\"error\",\"unknown\")}')
" 2>/dev/null || echo "  Key creation failed"

# 3.2 尝试通过 FlowAPI 调用
echo ""
echo "  --- FlowAPI → sub2api 调用测试 ---"
FLOWAPI_KEY=$(echo "$CREATE_KEY_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -n "$FLOWAPI_KEY" ] && [ "$FLOWAPI_KEY" != "None" ]; then
  CALL_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
    "$FLOWAPI_BASE/v1/chat/completions" \
    -H "Authorization: Bearer $FLOWAPI_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"flowapi-gpt55","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}' 2>/dev/null)
  CALL_HTTP=$(echo "$CALL_RESP" | grep "HTTP:" | cut -d: -f2)

  if [ "$CALL_HTTP" = "200" ]; then
    CALL_USAGE=$(echo "$CALL_RESP" | grep -v "HTTP:" | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d.get('usage',{})
print(f'in={u.get(\"prompt_tokens\")} out={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
" 2>/dev/null)
    report PASS "FlowAPI 调用 GPT-5.5 成功" "HTTP:$CALL_HTTP | tokens: $CALL_USAGE"
  else
    CALL_ERR=$(echo "$CALL_RESP" | grep -v "HTTP:" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',d.get('message','?'))[:100])" 2>/dev/null)
    report FAIL "FlowAPI 调用 GPT-5.5 失败" "HTTP:$CALL_HTTP | $CALL_ERR"
  fi
else
  report WARN "无法获取 API Key" "跳过调用测试"
fi

echo ""

# ============================================================================
# 第四阶段: new-api 状态检查
# ============================================================================
echo "=========================================="
echo "  第四阶段: new-api 服务状态"
echo "=========================================="

if curl -s -o /dev/null -w "%{http_code}" "$NEWAPI_BASE/api/status" | grep -q "200"; then
  report PASS "new-api 运行中" "$NEWAPI_BASE"
else
  report WARN "new-api 状态未知" "端口 3001"
fi

echo ""

# ============================================================================
# 第五阶段: 服务可用性综合检查
# ============================================================================
echo "=========================================="
echo "  第五阶段: 服务可用性总结"
echo "=========================================="

SERVICES=0
SERVICE_OK=0

# 检查 FlowAPI
if curl -s -o /dev/null -w "%{http_code}" "$FLOWAPI_BASE" 2>/dev/null | grep -q "200"; then
  echo "  ✅ FlowAPI     (localhost:3000)"
  SERVICE_OK=$((SERVICE_OK+1))
else
  echo "  ❌ FlowAPI     (localhost:3000) - 未运行"
fi
SERVICES=$((SERVICES+1))

# 检查 sub2api
if curl -s -o /dev/null -w "%{http_code}" "$SUB2API_BASE/v1/models" -H "Authorization: Bearer $SUB2API_KEY" 2>/dev/null | grep -q "200"; then
  echo "  ✅ sub2api     ($SUB2API_BASE)"
  SERVICE_OK=$((SERVICE_OK+1))
else
  echo "  ❌ sub2api     ($SUB2API_BASE) - 不可达"
fi
SERVICES=$((SERVICES+1))

# 检查 new-api
if curl -s -o /dev/null -w "%{http_code}" "$NEWAPI_BASE/api/status" 2>/dev/null | grep -q "200"; then
  echo "  ✅ new-api     (localhost:3001)"
  SERVICE_OK=$((SERVICE_OK+1))
else
  echo "  ⚠️  new-api     (localhost:3001) - 状态未知"
fi
SERVICES=$((SERVICES+1))

echo ""

# ============================================================================
# 结果汇总
# ============================================================================
echo "=========================================="
echo "  测试结果汇总"
echo "=========================================="
echo "  总测试: $TOTAL | 通过: $PASSED | 失败: $FAILED"
echo "  服务可用: $SERVICE_OK/$SERVICES"
echo ""

# 输出 JSON 结果
cat > /tmp/flowapi-test-results.json <<EOF
{
  "testTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "services": {
    "flowapi": $(curl -s -o /dev/null -w "%{http_code}" "$FLOWAPI_BASE" 2>/dev/null | grep -q "200" && echo "true" || echo "false"),
    "sub2api": $(curl -s -o /dev/null -w "%{http_code}" "$SUB2API_BASE/v1/models" -H "Authorization: Bearer $SUB2API_KEY" 2>/dev/null | grep -q "200" && echo "true" || echo "false"),
    "newapi": $(curl -s -o /dev/null -w "%{http_code}" "$NEWAPI_BASE/api/status" 2>/dev/null | grep -q "200" && echo "true" || echo "false")
  },
  "models": {
    "gpt55_available": $( [ "$GPT55_HTTP" = "200" ] && echo "true" || echo "false"),
    "gpt54_available": $( [ "$GPT54_HTTP" = "200" ] && echo "true" || echo "false"),
    "codex_gpt53_available": $( [ "$CODEX_HTTP" = "200" ] && echo "true" || echo "false"),
    "codex_auto_review_available": $( [ "$AUTO_HTTP" = "200" ] && echo "true" || echo "false")
  },
  "totalTests": $TOTAL,
  "passed": $PASSED,
  "failed": $FAILED
}
EOF

echo "  详细结果已写入: /tmp/flowapi-test-results.json"
echo ""
echo "=============================================================================="
