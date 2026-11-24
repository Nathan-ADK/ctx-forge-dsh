# @nathan-adk/ctx-forge-dsh

零常驻注入、可逆的上下文锻造器 —— **DeepSeek Harness（DSH）专用版**，以真正节省 token 为目标。

## 省 token 的成本账（设计核心）

很多人以为"拦住长回答让它重写"能省 token —— **错了，那是负资产**：

| 手段 | 真正省 output token? | 说明 |
|---|---|---|
| Stop 拦截 → 重写 | ❌ 更费 | 长回答已生成计费 + 违规原因回注 + 重写再生成一遍 = 生成两遍 |
| 生成后裁剪 | ❌ | token 已经生成，裁剪只省呈现和下一轮上下文，不退款 |
| **生成层硬限制 maxTokens** | ✅ | 映射到底层 API `max_tokens`，模型物理上无法超生成 |
| **压低 reasoningEffort** | ✅ | 从源头减少思考 token |

所以本版**砍掉了重写逻辑**，专注三件真正有效的事：

1. **生成层硬限制**：`options.maxTokens = min(原值, 2048)` —— 正文在生成源头被物理限长。
2. **思考层压低**：`options.reasoningEffort = minimal`（仅对明确支持该档位的模型生效，不支持则不动，避免报错）。
3. **流式实时截断**：chunk 到达即计数，超 `maxLines`/`maxChars` 立即停读上游并掐断，**不缓冲整段、不重写、不回注任何违规原因**。

> 诚实边界：思考无法完全消失（模型需要它规划工具调用），只能压到最低档；流式截断是在生成后掐尾，真正省 token 靠前两层。需要复杂推理时可把 `reasoningEffort` 调 `high`、`maxTokens` 调大或设 0 关闭。

## 上下文压缩（可逆）

正文完整落盘，上下文只留四字段锚定摘要（目标/决定/事实/未决）+ 极简句柄，需要时 `ctx-forge get` 按需调阅。压缩确定性可复算，正文永不删除。

- 每轮注入成本 = 0。
- `retentionSessions: 30` 空间护栏：只留最近 30 个会话归档，本地占用有上限。

## 安装

```sh
dsh plugin add @nathan-adk/ctx-forge-dsh
# 或在 DSH 插件市场搜索 ctx-forge-dsh
```

## 配置（cordis.patch.yml）

```yaml
- id: ctx-forge-bundle
  config:
    archive: true
    outputGuard: true          # 流式实时截断（不缓冲/不重写/不回注）
    maxTokens: 2048           # 生成层硬上限；0=关闭
    reasoningEffort: minimal  # 思考层；模型不支持时自动不动
    maxLines: 3
    maxChars: 40
    retentionSessions: 30
```

环境变量（优先级更高）：`CTXFORGE_HOME`（归档目录，默认 `~/.ctxforge`）、`CTXFORGE_MAX_TOKENS`、`CTXFORGE_REASONING_EFFORT`。

放宽开关：`maxTokens` 调大/设 0、`reasoningEffort: high`、`outputGuard: false`。

## 命令

```sh
ctx-forge ingest <文件|-> --session-key <键>
ctx-forge forge --session-key <键> --budget 600
ctx-forge deep --session-key <键> --level max
ctx-forge get F0003 --session-key <键>
ctx-forge status / rm --session-key <键>
```

## 测试

```sh
npm test   # 48 项断言全部通过
```

## 许可

MIT
