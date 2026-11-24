# @nathan-adk/ctx-forge-dsh

零常驻注入、可逆的上下文锻造器 —— **DeepSeek Harness (DSH) 专用版**。

把会话正文完整落盘，上下文里只保留四字段锚定摘要（目标/决定/事实/未决）+ 极简句柄，需要时用 `ctx-forge get` 按需调阅。压缩是确定性的、可复算，正文永不删除，可逆无丢失。

## 设计目标

- **每轮注入成本 = 0**：不往上下文塞任何规则文本，不做逐轮 prompt 注入。
- **极致压缩**：正文外置 + 四字段锚定摘要 + 极简句柄，深度锻造档可到 95%+。
- **本地空间有上限**：默认只保留最近 30 个会话归档，超出自动清理最旧的，不会无限膨胀。
- **默认不干预输出**：`outputGuard` 默认关闭，保留原生流式，不截断、不切残句。

## 安装

```sh
# 在你的 DSH profile 中安装（二选一）
dsh plugin add @nathan-adk/ctx-forge-dsh
# 或在插件市场搜索 ctx-forge-dsh
```

安装后 bundle 会自动插入 `ctx-forge-bundle` 插件行并激活。

## 配置

在 profile 的 `cordis.patch.yml` 中可以覆盖：

```yaml
- id: ctx-forge-bundle
  config:
    archive: true          # 是否归档正文
    budget: 600            # 回注预算（token）
    outputGuard: false     # 默认关闭；true = 流式事后规范化（去套话/限行/限字）
    maxLines: 3            # outputGuard 开启时的行数上限
    maxChars: 600          # outputGuard 开启时的字数上限
    retentionSessions: 30  # 最多保留多少个会话归档
    maxTokens: 0           # 生成层硬上限；0=关闭，>0 映射到底层 API max_tokens
```

环境变量（优先级高于配置）：
- `CTXFORGE_HOME` — 归档目录，默认 `~/.ctxforge`（跨平台通用，不会写到程序目录）
- `CTXFORGE_BUDGET` — 回注预算
- `CTXFORGE_MAX_TOKENS` — 生成层硬上限

## 命令

```sh
ctx-forge ingest <文件|-> --session-key <键>       # 归档正文
ctx-forge forge --session-key <键> --budget 600    # 锻造压缩
ctx-forge deep --session-key <键> --level max      # 深度锻造（95%+）
ctx-forge get F0003 --session-key <键>             # 按需调阅原文
ctx-forge status / rm --session-key <键>           # 查看/删除归档
```

## 归档与空间

- 默认目录 `~/.ctxforge`，包含 `sessions/`（正文 `full.md` + 块 `blocks.json` + 锚点 `anchors.json`）。
- 单会话通常几十 KB 到几 MB；`retentionSessions` 护栏保证总量有上限。
- 正文落盘不删；调阅才回注，未调阅的历史不占上下文。

## 诚实边界

- 锚定摘要是规则抽取，不是语义理解：能保留决定/数字/路径，不能替代模型级摘要。
- 压缩的代价是历史不直接可见，需要显式 `get` 调阅。
- `outputGuard` 关闭后输出风格完全由模型与系统提示决定；开启后是事后规范化，属于纠错而非事前预防。

## 测试

```sh
npm test   # 48 项断言，全部通过
```

## 许可

MIT
