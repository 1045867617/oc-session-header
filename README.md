# opencode 会话头注入（SillyTavern / TauriTavern 扩展）

给扩展（如柏宝书）发往 **opencode** 的请求补上 `x-opencode-session` 请求头。

## 背景

OpenCode Go（以及部分场景下的 Zen）要求每个请求携带 `x-opencode-session`，缺失会返回
`400 Request is missing x-opencode-session`。

SillyTavern 的 `custom_include_headers`（Include Request Headers）只在
`chat_completion_source: 'custom'` 时生效，而柏宝书等扩展默认发的是
`openai + reverse_proxy`，所以头带不上去。

本扩展在浏览器端拦截发往 ST 后端的
`POST /api/backends/chat-completions/generate`，把请求体改写成 `custom` 源，
并把 `x-opencode-session` 放进 `custom_include_headers`，由 ST 服务端转发给上游。

## 安装

SillyTavern / TauriTavern → 扩展 → 安装扩展 → 填本仓库 URL。

## 配置

扩展面板中会出现「opencode 会话头注入」：

| 字段 | 说明 |
| --- | --- |
| 目标地址包含 | 只有接口地址里含这个字符串才会被改写，默认 `opencode.ai` |
| x-opencode-session | 每段对话一个稳定 ID 即可，默认已填一个固定值 |
| x-opencode-org-id | 使用「用户会话令牌」时填写；服务账号密钥留空 |
| User-Agent | Go 要求客户端有自己的 UA，不要用通用库名 |
| 调试日志 | 在控制台输出改写情况 |

## 使用

副 API 渠道的 URL 直接填 `https://opencode.ai/zen/go/v1`，密钥填你的 opencode token，
模型填 `deepseek-v4-flash` 之类即可。请求头由本扩展补上。

## 注意

- 只改写目标地址匹配的请求，其它 API 不受影响。
- ST 的「获取模型列表」走的是 `/api/backends/chat-completions/status`，不带这些头；
  opencode 的 `/models` 不校验该头，因此不影响。
