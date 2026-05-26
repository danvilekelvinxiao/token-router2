/**
 * Connection test error messages — user-friendly Chinese translations
 * for common HTTP errors during API key / model connectivity tests.
 */

export function getConnectionTestMessage(statusCode, model = "") {
  const isQwen = /qwen/i.test(model || "");

  if (statusCode === 401) {
    return {
      level: "warning",
      title: "连接检查未通过",
      message: "测试请求被拒绝，但不一定代表 API Key 无效。请确认 API Key 已完整复制（以 sk- 开头），或使用 CURL 示例进行实际调用测试。",
      canStillUse: true,
    };
  }

  if (statusCode === 403) {
    return {
      level: "error",
      title: "无调用权限",
      message: "当前 API Key 可能没有该模型的调用权限，或账户余额 / 分组权限不足。请检查模型权限和账户余额。",
      canStillUse: false,
    };
  }

  if (statusCode === 429) {
    return {
      level: "warning",
      title: "请求过于频繁",
      message: "已触发限流，请稍后再试。",
      canStillUse: true,
    };
  }

  if (statusCode === 503) {
    if (isQwen) {
      return {
        level: "warning",
        title: "模型暂时不可用",
        message: "Qwen 系列当前上游渠道暂时不可用，通常表示供应商服务繁忙、模型维护或渠道暂时不可用。这不代表你的 API Key 无效。请稍后重试，或切换 DeepSeek / GPT / Claude 等其他模型。",
        canStillUse: true,
      };
    }
    return {
      level: "warning",
      title: "模型暂时不可用",
      message: "该模型或上游渠道暂时不可用，可能是供应商服务繁忙或渠道维护。请稍后重试，或切换其他模型。这不代表你的 API Key 无效。",
      canStillUse: true,
    };
  }

  return {
    level: "warning",
    title: "连接测试失败",
    message: `上游返回错误 ${statusCode}。这不代表 API Key 无效，可能是供应商服务异常。请稍后重试，或使用 CURL 示例进行实际调用。`,
    canStillUse: true,
  };
}

export function getCurlExample(model = "deepseek-chat") {
  return `curl https://api.flowapi.fun/v1/chat/completions \\
  -H "Authorization: Bearer 你的API Key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'`;
}

export function getSelfCheckList() {
  return [
    "Base URL 是否为 https://api.flowapi.fun/v1",
    "API Key 是否完整复制，必须以 sk- 开头",
    "Authorization 格式是否为 Bearer sk-xxxx",
    "模型 ID 是否正确",
    "当前账户余额是否充足",
    "当前 API Key 是否被禁用",
    "当前模型是否已在大模型接入页上架",
  ];
}
