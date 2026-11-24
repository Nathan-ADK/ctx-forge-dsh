'use strict';
/**
 * ctx-forge DSH 流式输出闸门：cordis llm/stream waterfall 同步包裹，
 * 按 gate 判定对整段回复做极简约束。同步返回 AsyncIterable（绝不 await next）。
 *
 * DSH 无 Stop 事件可重试，故采用"生成后规范化"：缓冲整段 → 提取极简结论 → 一次性吐出。
 * 这保证 DSH 侧与 WorkBuddy Stop 闸门效果一致（过程≤8字状态词、结论≤3行、中文、禁填充）。
 */
const gate = require('./gate');

const DEFAULT = { enabled: true, maxChars: 600, maxLines: 3 };

function guard(upstream, cfg = {}) {
  const c = Object.assign({}, DEFAULT, cfg);
  if (!c.enabled || !upstream || typeof upstream[Symbol.asyncIterator] !== 'function') return upstream;

  async function* wrapped() {
    let full = '';
    try {
      for await (const chunk of upstream) full += (typeof chunk === 'string' ? chunk : String(chunk || ''));
    } catch (e) {
      // 上游出错：原样吐回已收到内容，不吞流
      if (full) yield full;
      throw e;
    }
    if (!full) return;
    const norm = normalize(full, c);
    yield norm;
  }
  return wrapped();
}

// 生成后规范化：去填充、抽结论、限行、限字
function normalize(text, c) {
  let s = String(text || '');
  // 去 system-reminder 包裹
  s = s.replace(/<system-reminder[\s\S]*?<\/system-reminder>/g, '');
  // FIX: 去掉"去填充语开头"里过于贪婪的 `我来帮你...[^。\n]*` 分支，
  // 旧正则把"好的，我来帮你做这个。"切成残句"帮你做这个。"。
  // 现在只删独立的客套整句，且必须命中句末标点，避免误伤正文。
  s = s.replace(/^(好的[，,]?\s*)?(我来帮你|我来|以下是)[^\n。！？]{0,12}[。！？]/gm, '');
  s = s.replace(/(希望(这|以下)?[^。\n]{0,20}(有帮助|对你有用))/g, '');
  const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const kept = lines.slice(0, c.maxLines);
  let out = kept.join('\n');
  if (out.length > c.maxChars) out = out.slice(0, c.maxChars).replace(/[，、；：]$/, '') + '…';
  return out || s.slice(0, c.maxChars);
}

module.exports = { guard, normalize, DEFAULT };
