# Codex Provider Compatibility

FlowAPI supports Codex clients through the OpenAI Responses API surface at `/v1/responses`. Ordinary chat completion success is not enough to prove Codex agent support: Codex needs the full tool-call chain to survive request parsing, upstream routing, SSE streaming, and response adaptation.

## Required Codex config

Use the Responses wire API, not Chat mode:

```toml
[model_providers.flowapi]
name = "FlowAPI"
base_url = "https://pincc.flowapi.fun/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"

[general]
model_provider = "flowapi"
model = "gpt-5.5"
model_reasoning_effort = "high"
disable_response_storage = true
```

`wire_api = "responses"` is necessary but not sufficient. The relay must also preserve `tools`, `tool_choice`, `parallel_tool_calls`, `previous_response_id`, and streaming function-call events.

## What can go wrong

Common failure modes:

1. **Codex sends no tools** — the relay cannot expose terminal/file/browser tools if the client request has no `tools` field.
2. **Relay strips tools before upstream** — the model receives a plain chat request and responds as a chatbot.
3. **Upstream returns structured tool calls but relay textifies them** — `tool_calls` / `function_call` / `output_item` data is collapsed into assistant text.
4. **Upstream returns literal JSON text like `{"cmd":"..."}`** — the selected upstream/model probably does not support tool calling for this provider mode.
5. **Streaming parser only forwards text deltas** — Codex never receives `response.function_call_arguments.delta/done` or `response.output_item.done`.
6. **`previous_response_id` is lost** — Codex multi-turn tool loops cannot resume correctly.
7. **Body limit/timeout too small** — large repository context or long tool loops fail with 413/timeout.

## Diagnostic logs

FlowAPI emits redacted diagnostics when `/v1/responses` calls the internal chat route. These logs intentionally avoid API keys, full prompts, full tool arguments, environment variables, and project code.

Look for:

```text
[flowapi-codex-diagnostic] {...}
[flowapi-codex-chat-diagnostic] {...}
[flowapi-upstream-diagnostic] {...}
```

Important fields:

- `has_tools` / `tools_count`: whether Codex sent tools to `/v1/responses`.
- `forwarded_has_tools` / `forwarded_tools_count`: whether FlowAPI forwarded tools to the internal chat/upstream request.
- `has_tool_call_event` / `has_function_call_event` / `has_output_item`: whether structured tool/function events were seen or emitted.
- `previous_response_id_preserved`: whether the Responses adapter preserved response chaining metadata.
- `text_looks_like_tool_json`: whether a suspected shell/tool JSON object was returned as ordinary assistant text.
- `upstream_status` / `response_content_type` / `is_sse`: upstream transport shape.

Binary diagnosis:

| Evidence | Meaning | Fix |
|---|---|---|
| `has_tools=false` at `/v1/responses` | Codex did not inject tools for this provider/model | Check Codex config, provider capability, model selection, and new session state |
| `has_tools=true` but `forwarded_has_tools=false` | FlowAPI stripped tools | Fix request normalization/adapter |
| `forwarded_has_tools=true` but no tool/function events | Upstream did not produce tool calls | Check upstream model/provider tool support or force tool-choice test |
| Structured upstream tool calls but text output contains `{"cmd":...}` | Response parser textified tool call | Fix SSE/response adapter event mapping |

## Relay routing behavior

FlowAPI now prefers a native upstream `/v1/responses` request when all of the following are true:

- the client entered through `/v1/responses`;
- the relay still has the original Responses body;
- the selected upstream declares `supportsResponsesApi=true`.

When the upstream rejects native Responses with a known compatibility error (for example `404/405/415/422/501`, or a `400` that clearly says the endpoint/body is unsupported), FlowAPI falls back to upstream `/v1/chat/completions` for that attempt instead of silently dropping the original request at ingress.

The internal relay also returns `x-flowapi-upstream-endpoint: responses|chat` so the outer `/v1/responses` adapter knows whether it should passthrough native Responses JSON/SSE or adapt a chat-completions payload back into Responses format.

## Local compatibility test

Run with a low-balance test key only:

```bash
FLOWAPI_BASE_URL=https://pincc.flowapi.fun/v1 \
FLOWAPI_TEST_KEY=sk-test... \
FLOWAPI_MODEL=gpt-5.5 \
npm run test:codex-provider
```

The script checks:

- normal `/v1/responses` text;
- streaming Responses events;
- forced tool call passthrough;
- `previous_response_id` passthrough;
- request body size limit is not 413;
- error response remains structured;
- suspected tool-call JSON is not returned as plain text.

Expected output includes:

```text
[PASS] responses text
[PASS] responses stream
[PASS] tools passthrough
[PASS] previous_response_id passthrough
[PASS] body limit
[PASS] upstream/auth error passthrough
[PASS] Codex provider compatibility checks completed
```

A failing `tools passthrough` check does not automatically mean FlowAPI stripped tools. Read the diagnostic logs to identify whether the failure happened at client ingress, relay forwarding, upstream model support, or response adaptation.

## Security notes

Do not log or paste:

- complete API keys;
- upstream keys;
- cookies or sessions;
- refresh/access tokens;
- full prompts;
- full repository files;
- full tool arguments;
- full environment variables.

Use masked keys such as `sk-abc123***wxyz` when discussing configuration.
