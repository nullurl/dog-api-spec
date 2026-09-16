#!/usr/bin/env node
/*
 * 由引擎的参数注册表（assets/js/quantify.js 的 PARAMS）反向生成：
 *   1. 附录 P 的表格与等级分布
 *   2. 各文档中所有"共 N 项 / A 级 N 项"的计数声明
 *   3. §29 内部的等级分布代码块
 *
 * 目的：让参数只有一份事实源。改参数请只改 quantify.js，然后跑本脚本。
 *
 *   用法：  node scripts/sync-params.js
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..") + path.sep;
const Q = require(ROOT + "assets/js/quantify.js");
const P = Q.PARAMS;

const cnt = P.reduce((o, p) => ((o[p.grade] = (o[p.grade] || 0) + 1), o), {});
const rows = P.map(
  (p) =>
    "        <tr><td>" + p.label + "</td><td>" + p.range + "</td><td>" + p.unit +
    "</td><td>" + p.sample + "</td><td>" + p.alarm + "</td><td>" + p.grade + "</td></tr>"
).join("\n");

const block =
  "      <table>\n" +
  "        <tr><th>参数</th><th>范围 / 公式</th><th>单位</th><th>采样</th><th>报警阈值</th><th>等级</th></tr>\n" +
  rows + "\n" +
  "      </table>\n" +
  "      <h3>等级分布（由参数注册表实时统计）</h3>\n" +
  "      <pre>A 级  " + cnt.A + " 项   同行评议文献或大规模实测数据\n" +
  "B 级  " + cnt.B + " 项   临床指南或专业机构共识\n" +
  "C 级  " + cnt.C + " 项   社区经验或本项目定义的复合指标\n" +
  "── 合计 " + P.length + " 项\n\n" +
  "A 级可以直接引用\nB 级可以引用并注明指南出处\nC 级可以照做，但请不要说「研究发现」</pre>\n";

/* ---------- 1. 附录 P ---------- */
const ap = ROOT + "assets/data/appendices.js";
let src = fs.readFileSync(ap, "utf8");
const startMark = "      <table>\n        <tr><th>参数</th><th>范围 / 公式</th><th>单位</th><th>采样</th><th>报警阈值</th><th>等级</th></tr>";
const endMark = "      <blockquote>本文档对自己的评价是诚实的";
const s = src.indexOf(startMark);
const e = src.indexOf(endMark);
if (s < 0 || e < 0 || e < s) throw new Error("附录 P 的锚点未找到 —— 请检查 appendices.js 是否被改动");
src = src.slice(0, s) + block + src.slice(e);
fs.writeFileSync(ap, src);
console.log("附录 P 已按注册表重写：", P.length, "行 |", JSON.stringify(cnt));

/* ---------- 2. 文档里的计数声明 ---------- */
const A = cnt["A"] || 0, B = cnt["B"] || 0, C = cnt["C"] || 0, T = P.length;
// 每条为一个 [文件, [[旧文本, 新文本], ...]]；旧文本允许匹配不到（幂等：第二次跑时已是新文本）
const num = /(\d+)/;
const edits = [
  ["docs/quantification.md", [
    [new RegExp("当前分布：\\*\\*A 级 \\d+ 项 · B 级 \\d+ 项 · C 级 \\d+ 项\\*\\*（注册表见 `quantify.js` 的 `PARAMS`，共 \\d+ 条）。"),
     "当前分布：**A 级 " + A + " 项 · B 级 " + B + " 项 · C 级 " + C + " 项**（注册表见 `quantify.js` 的 `PARAMS`，共 " + T + " 条）。"]
  ]],
  ["README.md", [
    [new RegExp("\\*\\*来源等级\\*\\*：`A` = 同行评议或大规模实测（\\d+ 项）· `B` = 临床指南共识（\\d+ 项）· `C` = 社区经验或本项目定义（\\d+ 项）(，共 \\d+ 项)?。*"),
     "**来源等级**：`A` = 同行评议或大规模实测（" + A + " 项）· `B` = 临床指南共识（" + B + " 项）· `C` = 社区经验或本项目定义（" + C + " 项），共 " + T + " 项。"],
    [new RegExp("`assets/js/quantify\\.js` —— 计算内核。\\d+ 项参数注册表"),
     "`assets/js/quantify.js` —— 计算内核。" + T + " 项参数注册表"]
  ]],
  ["index.html", [
    [new RegExp("只有那 \\d+ 项 A 级，才让剩下的 \\d+ 项 C 级"),
     "只有那 " + A + " 项 A 级，才让剩下的 " + C + " 项 C 级"],
    [new RegExp('<div class="n">\\d+</div><div class="l">量化参数（A/B/C 分级）</div>'),
     '<div class="n">' + T + '</div><div class="l">量化参数（A/B/C 分级）</div>']
  ]],
  ["docs/CHANGELOG.md", [
    [new RegExp("`assets/js/quantify\\.js` —— 量化引擎。\\d+ 项参数注册表"),
     "`assets/js/quantify.js` —— 量化引擎。" + T + " 项参数注册表"],
    [new RegExp("首次引入来源等级标注：A \\d+ 项 · B \\d+ 项 · C \\d+ 项"),
     "首次引入来源等级标注：A " + A + " 项 · B " + B + " 项 · C " + C + " 项"]
  ]]
];

edits.forEach(([file, pairs]) => {
  const fp = ROOT + file;
  if (!fs.existsSync(fp)) { console.log("  ! 文件不存在，跳过：" + file); return; }
  let t = fs.readFileSync(fp, "utf8");
  pairs.forEach(([from, to]) => {
    const next = t.replace(from, to);
    if (next === t) console.log("  · 无需改动或无匹配 @" + file);
    t = next;
  });
  fs.writeFileSync(fp, t);
  console.log("  已同步", file);
});

/* ---------- 3. §29 内部的等级分布代码块 ---------- */
const dd = ROOT + "assets/data/dog.js";
const raw = fs.readFileSync(dd, "utf8");
const doc = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const s29 = doc.sections.find((x) => x.id === "quant");
if (!s29) {
  console.log("  ! 未找到 §29（id: quant）");
} else {
  const r29 = /本方案中 A 级指标（公式有出处）\s*：\d+ 项\n本方案中 B 级指标（指南共识）\s*：\d+ 项\n本方案中 C 级指标（经验 \/ 本项目定义）\s*：\d+ 项(\n本方案合计注册参数\s*：\d+ 项)?/;
  const n29 = "本方案中 A 级指标（公式有出处）        ：" + A + " 项\n本方案中 B 级指标（指南共识）          ：" + B + " 项\n本方案中 C 级指标（经验 / 本项目定义） ：" + C + " 项\n本方案合计注册参数                     ：" + T + " 项";
  if (r29.test(s29.html)) {
    s29.html = s29.html.replace(r29, n29);
    fs.writeFileSync(dd, "/* DOG API 规范数据 — 由 legacy 单文件版本提取生成 */\nwindow.DOG_DOC = " + JSON.stringify(doc, null, 2) + ";\n");
    console.log("  已同步 §29 等级分布");
  } else {
    console.log("  · §29 无匹配（或已是新文本）");
  }
}

console.log("\n完成。A/B/C =", A + "/" + B + "/" + C, "共", T, "项。");
