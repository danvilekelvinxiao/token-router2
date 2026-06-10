#!/bin/bash
# sub2api API testing script
# Reads keys from .env.local to avoid credential leakage in CLI

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source env vars from .env.local
set -a
source "$PROJECT_DIR/.env.local" 2>/dev/null || true
set +a

# ===== Configuration (from .env.local) =====
SUB2API_BASE="${SUB2API_BASE_URL:-http://localhost:8080}"
SUB2API_KEY="${SUB2API_API_KEY:-}"
FLOWAPI_BASE="http://localhost:3000"

if [ -z "$SUB2API_KEY" ]; then
  echo "ERROR: SUB2API_API_KEY not set in .env.local"
  exit 1
fi

echo "========================================="
echo "  sub2api Model Testing Report"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

# ===== Test 1: List models =====
echo "--- Test 1: GET /v1/models ---"
MODELS_RESP=$(curl -s "$SUB2API_BASE/v1/models" -H "Authorization: Bearer $SUB2API_KEY")
MODEL_COUNT=$(echo "$MODELS_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")
MODEL_LIST=$(echo "$MODELS_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for m in d.get('data',[]):
    print(f'  - {m[\"id\"]}')
" 2>/dev/null || echo "  parse error")

echo "Total models: $MODEL_COUNT"
echo "$MODEL_LIST"
echo ""

# ===== Test 2: GPT-5.5 =====
echo "--- Test 2: GPT-5.5 chat completion ---"
START_MS=$(python3 -c "import time; print(int(time.time()*1000))")
GPT55_RESP=$(curl -s -w "\n__HTTP_%{http_code}__" \
  "$SUB2API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SUB2API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.5","messages":[{"role":"user","content":"Reply OK only"}],"max_tokens":20}')
END_MS=$(python3 -c "import time; print(int(time.time()*1000))")

HTTP_CODE=$(echo "$GPT55_RESP" | grep -o '__HTTP_[0-9]*__' | sed 's/__HTTP_//;s/__//')
BODY=$(echo "$GPT55_RESP" | sed 's/__HTTP_[0-9]*__$//')
LATENCY=$((END_MS - START_MS))

echo "HTTP: $HTTP_CODE | Latency: ${LATENCY}ms"
echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'choices' in d:
    c=d['choices'][0]['message']['content'][:200]
    u=d.get('usage',{})
    print(f'  SUCCESS')
    print(f'  Content: {c}')
    print(f'  Model: {d.get(\"model\",\"?\")}')
    print(f'  Tokens: prompt={u.get(\"prompt_tokens\")} completion={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
elif 'error' in d:
    err=d['error']
    print(f'  FAILED: {err.get(\"message\",err)}')
else:
    print(f'  UNKNOWN: ' + json.dumps(d,ensure_ascii=False)[:300])
"
echo ""

# ===== Test 3: Codex =====
echo "--- Test 3: Codex (gpt-5.3-codex) chat completion ---"
START_MS=$(python3 -c "import time; print(int(time.time()*1000))")
CODEX_RESP=$(curl -s -w "\n__HTTP_%{http_code}__" \
  "$SUB2API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SUB2API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"Reply OK only"}],"max_tokens":20}')
END_MS=$(python3 -c "import time; print(int(time.time()*1000))")

HTTP_CODE=$(echo "$CODEX_RESP" | grep -o '__HTTP_[0-9]*__' | sed 's/__HTTP_//;s/__//')
BODY=$(echo "$CODEX_RESP" | sed 's/__HTTP_[0-9]*__$//')
LATENCY=$((END_MS - START_MS))

echo "HTTP: $HTTP_CODE | Latency: ${LATENCY}ms"
echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'choices' in d:
    c=d['choices'][0]['message']['content'][:200]
    u=d.get('usage',{})
    print(f'  SUCCESS')
    print(f'  Content: {c}')
    print(f'  Model: {d.get(\"model\",\"?\")}')
    print(f'  Tokens: prompt={u.get(\"prompt_tokens\")} completion={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
elif 'error' in d:
    err=d['error']
    print(f'  FAILED: {err.get(\"message\",err)}')
else:
    print(f'  UNKNOWN: ' + json.dumps(d,ensure_ascii=False)[:300])
"
echo ""

# ===== Test 4: Also test gpt-5.4 =====
echo "--- Test 4: GPT-5.4 (backup) ---"
START_MS=$(python3 -c "import time; print(int(time.time()*1000))")
GPT54_RESP=$(curl -s -w "\n__HTTP_%{http_code}__" \
  "$SUB2API_BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SUB2API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4","messages":[{"role":"user","content":"Reply OK only"}],"max_tokens":20}')
END_MS=$(python3 -c "import time; print(int(time.time()*1000))")

HTTP_CODE=$(echo "$GPT54_RESP" | grep -o '__HTTP_[0-9]*__' | sed 's/__HTTP_//;s/__//')
BODY=$(echo "$GPT54_RESP" | sed 's/__HTTP_[0-9]*__$//')
LATENCY=$((END_MS - START_MS))

echo "HTTP: $HTTP_CODE | Latency: ${LATENCY}ms"
echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'choices' in d:
    c=d['choices'][0]['message']['content'][:200]
    u=d.get('usage',{})
    print(f'  SUCCESS')
    print(f'  Content: {c}')
    print(f'  Tokens: prompt={u.get(\"prompt_tokens\")} completion={u.get(\"completion_tokens\")} total={u.get(\"total_tokens\")}')
elif 'error' in d:
    err=d['error']
    print(f'  FAILED: {err.get(\"message\",err)}')
else:
    print(f'  UNKNOWN: ' + json.dumps(d,ensure_ascii=False)[:300])
"

echo ""
echo "========================================="
echo "  Test Complete"
echo "========================================="
