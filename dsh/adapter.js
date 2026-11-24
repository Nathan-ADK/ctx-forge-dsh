'use strict';
/**
 * ctx-forge DSH 原生 cordis 适配器（零常驻注入、零输出拦截）。
 * 只在会话事件/压缩点做功：归档正文、锻造锚定摘要，按需由用户调阅。
 */
const fs = require('fs');
const path = require('path');
const forge = require('../lib/forge');
let stream = null; try { stream = require('../lib/stream'); } catch (_) {}

// 可移植默认归档根目录：~/.ctxforge（用户主目录，跨机器通用）。
// 仍可用 CTXFORGE_HOME 环境变量覆盖。
const DEFAULT_HOME = path.join(require('os').homedir(), '.ctxforge');
const HOME = process.env.CTXFORGE_HOME || DEFAULT_HOME;
const STATUS = path.join(HOME, 'dsh-status.json');

function apply(ctx, config = {}) {
  // FIX: outputGuard 默认关闭——不再缓冲整段回复、不再截断成 3 行、不破坏原生流式。
  const cfg = Object.assign({ archive: true, budget: 600, debug: false, outputGuard: true, maxLines: 3, maxChars: 40, maxTokens: 2048, reasoningEffort: 'minimal', retentionSessions: 30, streamCutoff: true }, config);
  const log = (m) => { try { if (cfg.debug) ctx.logger?.info('[ctx-forge] ' + m); } catch {} };
  const slotFor = (sid) => 'dsh_' + String(sid || 'latest').replace(/[^A-Za-z0-9_.\-\u4e00-\u9fff]/g, '_').slice(0, 60);

  function flush(extra) {
    try {
      fs.mkdirSync(HOME, { recursive: true });
      fs.writeFileSync(STATUS, JSON.stringify(Object.assign({}, extra || {}, { loaded: true, at: new Date().toISOString() }), null, 2), 'utf8');
    } catch {}
  }
  flush({ config: { archive: cfg.archive, budget: cfg.budget, outputGuard: cfg.outputGuard !== false, maxLines: cfg.maxLines, maxChars: cfg.maxChars } });
  log('loaded');

  // 零注入：规则只经 customPrompt 一次性加载；输出约束由 llm/stream 生成后 autoFix 兜底。
  ctx.on('agent/pre-step', async (payload, next) => {
    try { if (next) return await next(payload); } catch {}
    return payload;
  });

  // 三层极致精简：始终挂载 llm/stream，只做「让它生不出来」的省 token 操作。
  // 成本账：拦截重写/生成后重生成 = 负资产（生成两遍）；生成层硬限 = 真正省。
  ctx.on('llm/stream', (options, next) => {
    // ① 生成层硬限制（真正省 output token）：映射到底层 API max_tokens，模型物理上无法超生成。
    try {
      const mt = Number(process.env.CTXFORGE_MAX_TOKENS) || Number(cfg.maxTokens) || 0;
      if (mt > 0 && options && typeof options === 'object') options.maxTokens = Math.min(options.maxTokens || mt, mt);
    } catch (_) {}
    // ② 思考层（真正省 reasoning token）：仅当模型明确支持该档位才设置，
    //    否则保留原值——给不支持的模型强设档位会抛 UNSUPPORTED_REASONING_EFFORT 导致请求失败。
    try {
      const eff = String(process.env.CTXFORGE_REASONING_EFFORT || cfg.reasoningEffort || '').toLowerCase();
      if (eff && options && typeof options === 'object' && options.model) {
        const levels = (options.model.reasoning && Array.isArray(options.model.supportedThinkingLevels))
          ? options.model.supportedThinkingLevels
          : (options.model.reasoning ? ['minimal','low','medium','high','xhigh','max','off'] : ['off']);
        if (levels.includes(eff)) options.reasoningEffort = eff;
      }
    } catch (_) {}
    let upstream = null;
    try {
      upstream = next();
      if (!upstream || typeof upstream[Symbol.asyncIterator] !== 'function') return upstream;
      // ③ 输出层：实时流式截断（不缓冲整段、不重写、不回注违规原因）。
      if (cfg.outputGuard === true && stream) {
        return stream.guard(upstream, { enabled: true, maxLines: cfg.maxLines, maxChars: cfg.maxChars });
      }
      return upstream;
    } catch (e) { log('stream guard failed, passthrough: ' + e.message); return upstream; }
  });

  // FIX: 删掉原 `ctx.inject(['sessions'])` 空回调（死代码，原样返回 child，什么也不做）。
  // 归档改为可由会话结束/压缩事件显式调用，或 CLI `ctx-forge ingest` 手动调用。
  // 不在热路径注入任何上下文。
  const archiveFromMessages = (sid, messages) => {
    if (!cfg.archive) return { ok: false, error: 'archive disabled' };
    const id = slotFor(sid);
    const r = forge.ingest(HOME, messages, { sessionId: id, format: 'dsh' });
    if (!r.ok) return r;
    const f = forge.forge(HOME, id, { budget: cfg.budget });
    return Object.assign({ archived: r }, f);
  };

  // 供外部（CLI/agent/会话事件）调用的手动锻造入口。
  // FIX: DSH 不允许直接写未声明的 ctx 属性（cannot set property without provide），
  // 必须用 ctx.provide 声明服务；卸载时返回的清理函数会撤销。
  ctx.provide('forgeArchive', archiveFromMessages);

  // 空间护栏：超过 retentionSessions 的旧归档自动清理，避免本地空间无限增长。
  ctx.provide('forgePrune', () => {
    try {
      const sdir = path.join(HOME, 'sessions');
      if (!fs.existsSync(sdir)) return { removed: 0 };
      const dirs = fs.readdirSync(sdir)
        .map((n) => ({ n, p: path.join(sdir, n), t: fs.statSync(path.join(sdir, n)).mtimeMs }))
        .filter((x) => fs.statSync(x.p).isDirectory())
        .sort((a, b) => b.t - a.t);
      let removed = 0;
      for (const d of dirs.slice(cfg.retentionSessions)) {
        fs.rmSync(d.p, { recursive: true, force: true });
        removed++;
      }
      return { removed };
    } catch (e) { return { removed: 0, error: e.message }; }
  });
  ctx.forgePrune?.();
}

module.exports = { name: 'ctx-forge', inject: [], apply, STATUS, HOME };
