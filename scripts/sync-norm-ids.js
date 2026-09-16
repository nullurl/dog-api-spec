#!/usr/bin/env node
/*
 * 由数据模块反向生成规范 ID 登记表：
 *   1. reference/norm-ids.html   人读的表格
 *   2. spec/norm-ids.json        机器可读的注册表
 *
 * 目的：让「章节标识」只有一份事实源。规范 ID 由章节的锚点派生，
 * 锚点改了 ID 就跟着改 —— 不需要人工同步，也不会对不上。
 *
 *   用法：  node scripts/sync-norm-ids.js
 *
 * 注意：本脚本只登记，不做任何分配决策。若某个已登记的 ID 消失，
 * 那说明锚点被改了 —— 这会打断跨版本引用，脚本会把它们逐条报出来并非零退出。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..") + path.sep;

/* ---------- 载入数据模块（window.* 形式，用 vm 取） ---------- */
function load(...files) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  files.forEach((f) => vm.runInContext(fs.readFileSync(ROOT + f, "utf8"), ctx, { filename: f }));
  return ctx.window;
}
const W = load("assets/data/dog.js", "assets/data/appendices.js");
const sections = W.DOG_DOC.sections;
const appendices = W.DOG_APPENDICES;
const parts = W.DOG_DOC.parts || [];

/* ---------- 编号规则（必须与 render.js 的 labels() 一致） ---------- */
const partOf = (s) => (typeof s.part === "number" ? s.part : 0);
const numerals = (() => {
  const seen = {};
  return sections.map((s) => {
    const p = partOf(s);
    seen[p] = (seen[p] || 0) + 1;
    return p + 1 + "." + seen[p];
  });
})();
const partOfEntry = (s) => parts[partOf(s)] || {};

function letters(i) {
  // A..Z, AA..
  let n = i, s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* 正文表：按 PART 插入分组行，编号列写 §X.Y */
const chRows = sections
  .map((s, i) => {
    const p = partOf(s);
    const prev = i > 0 ? partOf(sections[i - 1]) : -1;
    const head =
      p !== prev && parts.length
        ? '      <tr class="partrow"><td colspan="3">PART ' +
          esc(partOfEntry(s).roman || p + 1) + " · " + esc(partOfEntry(s).title || "") +
          (partOfEntry(s).note ? ' <em>' + esc(partOfEntry(s).note) + "</em>" : "") +
          "</td></tr>\n"
        : "";
    return (
      head +
      "      <tr><td><code>DOG-" + esc(s.id) + "</code></td>" +
      '<td class="no">§' + numerals[i] + "</td>" +
      "<td>" + esc(s.title) + "</td></tr>"
    );
  })
  .join("\n");

const apRows = appendices
  .map((s, i) => {
    return (
      "      <tr><td><code>DOG-" + esc(s.id) + "</code></td>" +
      '<td class="no">附录 ' + letters(i) + "</td>" +
      "<td>" + esc(s.title) + "</td></tr>"
    );
  })
  .join("\n");

const HTML = `<!DOCTYPE html>
<!--
  本文件由 scripts/sync-norm-ids.js 生成，请勿手工编辑。
  数据来源：assets/data/dog.js（正文 ${sections.length} 章 / ${parts.length} 个 PART）· assets/data/appendices.js（附录 ${appendices.length} 条）
  重新生成：node scripts/sync-norm-ids.js
-->
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>规范 ID 登记表 — DOG API | DOG API</title>
<meta name="description" content="DOG API 正文 ${sections.length} 章与附录 ${appendices.length} 条的稳定标识。跨版本引用用规范 ID，不要用节号。">
<link rel="stylesheet" href="../assets/css/spec.css">
<style>
  .single main { max-width: 900px; margin: 0 auto; padding: 44px 28px 140px; }
  code { white-space: nowrap; }
  td.no { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.partrow td { background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12.5px; letter-spacing: 0.04em; }
  tr.partrow em { font-weight: 400; color: var(--muted); font-style: normal; }
</style>
</head>
<body>

<div class="single">
  <main id="content">
    <span class="doc-tag">REFERENCE / NORM IDS</span>
    <h1>规范 ID 登记表</h1>
    <div class="subtitle">正文 ${sections.length} 章 + 附录 ${appendices.length} 条的稳定标识。这张表由数据模块生成，不是手写的。</div>

    <blockquote><strong>跨版本引用 SHOULD 用规范 ID，MUST NOT 只用节号。</strong>
    节号（<code>§X.Y</code>、附录字母）按数组位置在运行时生成，任何一次插入或删除都会让其后的编号整体平移；
    规范 ID 取自章节的锚点，一经分配即在后续版本中保持不动。若确实要写节号，
    SHOULD 同时写出规范 ID，例如「§4.7 外设总线（<code>DOG-peripherals</code>）」。</blockquote>

    <h2>正文（${sections.length} 章 / ${parts.length} 个 PART）</h2>
    <table>
      <tr><th>规范 ID</th><th>节号</th><th>标题</th></tr>
${chRows}
    </table>

    <h2>附录（${appendices.length} 条）</h2>
    <table>
      <tr><th>规范 ID</th><th>编号</th><th>标题</th></tr>
${apRows}
    </table>

    <hr class="divider">
    <div class="end-note">
      本页由 scripts/sync-norm-ids.js 生成 · 机器可读版本在 spec/norm-ids.json ·
      修订序列见 <a href="../versions.html">历史版本</a>
    </div>
  </main>
</div>

<script src="../assets/js/render.js"></script>
<script>SpecSite.mountChrome({ root: "../", active: "normids" });</script>

</body>
</html>
`;

const JSON_OUT = {
  $comment:
    "规范 ID 注册表。由 scripts/sync-norm-ids.js 从数据模块生成，请勿手工编辑。" +
    "规范 ID 取自章节锚点，一经分配不再更改；节号只是当前位置，会随插入删除整体平移。",
  generatedFrom: ["assets/data/dog.js", "assets/data/appendices.js"],
  parts: parts.map((p, k) => ({ index: k, roman: p.roman, title: p.title, note: p.note })),
  sections: sections.map((s, i) => ({
    normId: "DOG-" + s.id,
    anchor: s.id,
    part: partOfEntry(s).roman || partOf(s) + 1,
    sectionNumber: numerals[i],
    title: s.title,
  })),
  appendices: appendices.map((s, i) => ({ normId: "DOG-" + s.id, anchor: s.id, label: letters(i), title: s.title })),
};

const OUT_HTML = ROOT + "reference/norm-ids.html";
const OUT_JSON = ROOT + "spec/norm-ids.json";

const prevJson = fs.existsSync(OUT_JSON) ? fs.readFileSync(OUT_JSON, "utf8") : "";
const prevHtml = fs.existsSync(OUT_HTML) ? fs.readFileSync(OUT_HTML, "utf8") : "";

fs.writeFileSync(OUT_HTML, HTML);
fs.writeFileSync(OUT_JSON, JSON.stringify(JSON_OUT, null, 2) + "\n");

const same = prevHtml === HTML && prevJson === JSON.stringify(JSON_OUT, null, 2) + "\n";
console.log("规范 ID 登记表已" + (same ? "重写（内容无变化）" : "更新"));
console.log("  正文 " + sections.length + " 章 / " + parts.length + " 个 PART · 附录 " + appendices.length + " 条");
console.log("  节号 §" + numerals[0] + " … §" + numerals[numerals.length - 1]);
console.log("  " + path.relative(ROOT, OUT_HTML) + "  " + fs.statSync(OUT_HTML).size + " B");
console.log("  " + path.relative(ROOT, OUT_JSON) + "  " + fs.statSync(OUT_JSON).size + " B");

/* ---------- 变更报告 1：已登记的 ID 若消失，说明锚点被改了 ---------- */
if (prevJson) {
  const prev = JSON.parse(prevJson);
  const now = new Set([...JSON_OUT.sections, ...JSON_OUT.appendices].map((x) => x.normId));
  const gone = [...prev.sections, ...prev.appendices].map((x) => x.normId).filter((id) => !now.has(id));
  if (gone.length) {
    console.error("\n⚠ 以下规范 ID 在本次生成后消失，跨版本引用会断：");
    gone.forEach((id) => console.error("    " + id));
    console.error("  若是刻意改名，请在 CHANGELOG 里登记旧 ID → 新 ID；若否，请恢复锚点。");
    process.exitCode = 1;
  }

  /* ---------- 变更报告 2：节号漂移 ---------- */
  const pn = new Map(prev.sections.map((s) => [s.normId, s.sectionNumber]));
  const moved = JSON_OUT.sections.filter((s) => pn.has(s.normId) && pn.get(s.normId) !== s.sectionNumber);
  if (moved.length) {
    console.log("\n节号发生变化（" + moved.length + " 章）—— 这不影响规范 ID，但正文里的 § 引用要跟着改：");
    moved.slice(0, 8).forEach((s) => console.log("    " + s.normId + "  §" + pn.get(s.normId) + " → §" + s.sectionNumber));
    if (moved.length > 8) console.log("    …（共 " + moved.length + " 章）");
  }
}
