#!/usr/bin/env node
/* ============================================================
   expression — DOG API 表情渲染器命令行
   ------------------------------------------------------------
   零依赖。把 §30 的 13 维参数向量渲染成像素 SVG / 点阵 / JSON。

     node scripts/expression.js --list
     node scripts/expression.js --state JOY                    # SVG → stdout
     node scripts/expression.js --ascii JOY                    # 点阵 → stdout
     node scripts/expression.js --json JOY                     # 参数向量 → stdout
     node scripts/expression.js --compose "JOY:0.75,BEG:0.25" --persist
     node scripts/expression.js --all --out ./expressions
     node scripts/expression.js --sheet ./expressions/sheet.html
     node scripts/expression.js --params
     node scripts/expression.js --selftest

   退出码（shell 只支持 0–255，故不与 HTTP 码同值）：
     0 = 200 OK · 1 = 用法错误 · 2 = 422 UNPROCESSABLE · 9 = 409 CONFLICT
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const E = require(path.join(ROOT, "assets/js/expression.js"));

/* ------------------------------------------------------------------ 工具 */

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith("--")) return true;
  return next;
}
function has(name) { return process.argv.indexOf("--" + name) >= 0; }

function die(code, msg) {
  process.stderr.write(msg + "\n");
  process.exit(code);
}

// HTTP 状态码 → shell 退出码。shell 只有 0–255，且 0 必须留给成功，
// 所以不能直接拿 409 / 422 当退出码（会被 & 0xFF 截断成 153 / 166）。
const EXIT = { 200: 0, 409: 9, 422: 2 };
function exitFor(status) { return EXIT[status] !== undefined ? EXIT[status] : 1; }

function pad(s, n) {
  s = String(s);
  // 中日韩字符按 2 格宽处理，否则表格会歪
  let w = 0;
  for (const ch of s) w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  return s + " ".repeat(Math.max(1, n - w));
}

function parseMix(spec) {
  return String(spec).split(",").map(function (part) {
    const bits = part.trim().split(":");
    return { state: (bits[0] || "").trim().toUpperCase(), weight: bits[1] === undefined ? 1 : Number(bits[1]) };
  }).filter(function (x) { return x.state; });
}

/* --------------------------------------------------------------- 子命令 */

function cmdList() {
  const w = E.STATE_IDS.reduce((m, id) => Math.max(m, id.length), 0);
  process.stdout.write("id".padEnd(w) + "  类别  conf  尾巴          标题\n");
  process.stdout.write("-".repeat(w + 46) + "\n");
  E.STATES.forEach(function (s) {
    process.stdout.write(
      pad(s.id, w + 2) +
      pad(s.class, 6) +
      pad(s.confidence.toFixed(2), 6) +
      pad(s.tail, 15) +
      s.title + (s.suppressed ? "   [suppressed]" : "") + "\n"
    );
  });
  process.stdout.write("\n" + E.STATE_IDS.length + " 个状态 · " + E.PARAM_KEYS.length + " 维参数 · " + E.N + "×" + E.N + " 网格\n");
  process.stdout.write("注意：UNKNOWN 返回剪影，SICK 的向量与基线逐位相同。\n");
}

function cmdParams() {
  const k = E.PARAM_KEYS.reduce((m, x) => Math.max(m, x.length), 0);
  process.stdout.write("参数".padEnd(12) + "范围".padEnd(14) + "等级  含义 / 注释\n");
  process.stdout.write("-".repeat(96) + "\n");
  E.PARAM_DEFS.forEach(function (d) {
    process.stdout.write(
      pad(d.key, 12) + pad(d.range + (d.unit ? " " + d.unit : ""), 14) +
      pad(d.grade, 6) + d.label + " — " + d.note + "\n"
    );
  });
  const cnt = E.PARAM_DEFS.reduce(function (o, d) { o[d.grade] = (o[d.grade] || 0) + 1; return o; }, {});
  process.stdout.write("\n等级分布：A " + (cnt.A || 0) + " · B " + (cnt.B || 0) + " · C " + (cnt.C || 0) + "（共 " + E.PARAM_DEFS.length + " 项）\n");
  process.stdout.write("唯一 A 级参数是 browInner（内侧眉肌 AU101）—— 犬有、狼无。\n");
}

function cmdEndpoints() {
  process.stdout.write("端点\n");
  E.ENDPOINTS.forEach(function (e) {
    process.stdout.write("  " + pad(e.method, 8) + pad(e.path, 40) + pad(e.status, 6) + e.note + "\n");
  });
  process.stdout.write("\n状态码\n");
  E.STATUS_CODES.forEach(function (c) {
    process.stdout.write("  " + pad(c.code, 6) + pad(c.name, 20) + c.note + "\n");
  });
}

function cmdOne(stateId, format, opts) {
  const st = E.getState(stateId);
  const hit = st.id !== "UNKNOWN" || String(stateId).toUpperCase().replace(/[^A-Z]/g, "") === "UNKNOWN";
  if (!hit) {
    process.stderr.write("未知状态「" + stateId + "」→ 按 UNKNOWN 处理（返回剪影，不猜测）。\n");
    process.stderr.write("可用状态：" + E.STATE_IDS.join(" ") + "\n");
  }

  if (format === "json") {
    if (opts.vector) {
      process.stdout.write(JSON.stringify({ state: st.id, params: E.stateParams(st.id) }, null, 2) + "\n");
    } else {
      process.stdout.write(JSON.stringify(st, null, 2) + "\n");
    }
    return 0;
  }
  if (format === "ascii") {
    process.stdout.write(E.toASCII(st.id) + "\n");
    return 0;
  }
  if (format === "uri") {
    process.stdout.write(E.toDataURI(st.id, { scale: opts.scale }) + "\n");
    return 0;
  }
  process.stdout.write(E.toSVG(st.id, { scale: opts.scale, state: st.id, label: st.title }) + "\n");
  return 0;
}

function cmdAll(outDir, opts, silent) {
  fs.mkdirSync(outDir, { recursive: true });
  const lines = [];
  E.STATES.forEach(function (s) {
    const svg = E.toSVG(s.id, { scale: opts.scale, state: s.id, label: s.title });
    const file = path.join(outDir, s.id.toLowerCase() + ".svg");
    fs.writeFileSync(file, svg);
    lines.push(pad(s.id, 14) + pad(svg.length + " B", 12) + (svg.match(/<path /g) || []).length + " 条 path   " + file);
  });
  // 每个状态另存一份点阵，便于在终端或 diff 里核对
  if (opts.asciiToo) {
    fs.mkdirSync(path.join(outDir, "ascii"), { recursive: true });
    E.STATES.forEach(function (s) {
      fs.writeFileSync(path.join(outDir, "ascii", s.id.toLowerCase() + ".txt"), E.toASCII(s.id));
    });
  }
  if (!silent) {
    process.stdout.write(lines.join("\n") + "\n\n" + E.STATES.length + " 帧已写入 " + outDir + "\n");
  }
  return lines;
}

function cmdCompose(spec, opts) {
  const mix = parseMix(spec);
  if (!mix.length) return die(1, "用法：--compose \"JOY:0.75,BEG:0.25\"");
  const bad = mix.filter(function (m) { return E.STATE_IDS.indexOf(m.state) < 0; });
  if (bad.length) return die(EXIT[422], "422 UNPROCESSABLE — 不存在状态：" + bad.map(function (b) { return b.state; }).join(", "));

  const r = E.compose(mix, { persist: opts.persist });
  const mixText = mix.map(function (m) { return m.state + "×" + m.weight; }).join(" + ");

  if (!r.ok) {
    process.stderr.write(
      r.status + " " + r.reason + "\n" +
      "  混合：" + mixText + "\n" +
      "  最高权重（stability）= " + (r.stability !== undefined ? r.stability.toFixed(2) : "n/a") + "\n" +
      (r.message ? "  " + r.message + "\n" : "")
    );
    if (opts.svg) process.stdout.write(E.toSVG(r.params, { scale: opts.scale, state: "composed" }) + "\n");
    return exitFor(r.status);
  }

  process.stderr.write(
    "200 OK\n" +
    "  混合：" + mixText + "\n" +
    "  X-Expression-Dominant:  " + r.headers["X-Expression-Dominant"] + "\n" +
    "  X-Expression-Stability: " + r.headers["X-Expression-Stability"] + "\n"
  );
  if (opts.json) process.stdout.write(JSON.stringify({ params: r.params, headers: r.headers }, null, 2) + "\n");
  else if (opts.ascii) process.stdout.write(E.toASCII(r.params) + "\n");
  else process.stdout.write(E.toSVG(r.params, { scale: opts.scale, state: "composed", label: r.dominant + " " + r.stability.toFixed(2) }) + "\n");
  return 0;
}

// 单文件联系表：所有状态 + 三条响应头 + 参数。可直接用浏览器打开、也可直接贴进文档。
function cmdSheet(outFile, opts) {
  const ES = opts.scale || 8;
  const cells = E.STATES.map(function (s) {
    const svg = E.toSVG(s.id, { scale: ES, state: s.id, label: s.title });
    const key = Object.keys(s.params).filter(function (k) { return k !== "extra" && s.params[k]; });
    const diffs = key.length
      ? key.map(function (k) { return k + "=" + s.params[k]; }).join("  ")
      : "(与基线逐位相同)";
    return (
      '<figure class="cell' + (s.suppressed ? " suppressed" : "") + '">' +
      svg +
      '<figcaption><b>' + s.id + '</b> ' + esc(s.title) +
      '<span class="meta">' + s.class + ' · conf ' + s.confidence.toFixed(2) + '</span>' +
      '<span class="hdr">X-Dog-Tail: ' + s.tail + ' · X-Dog-Body: ' + s.body + ' · X-Dog-Vocal: ' + s.vocal + '</span>' +
      '<span class="p">' + esc(diffs) + '</span>' +
      '</figcaption></figure>'
    );
  }).join("\n");

  const html =
    '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">\n' +
    '<title>DOG API §30 · 表情联系表</title>\n' +
    '<style>\n' +
    '  :root{color-scheme:light}\n' +
    '  body{margin:0;padding:32px;background:#fbf7f1;color:#2b2320;' +
    'font:14px/1.6 ui-sans-serif,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}\n' +
    '  h1{font-size:20px;margin:0 0 4px} h1 span{font-weight:400;opacity:.6;font-size:14px}\n' +
    '  p.lede{max-width:74ch;opacity:.8}\n' +
    '  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:18px;margin-top:24px}\n' +
    '  .cell{margin:0;background:#fff;border:1px solid #e6dccd;border-radius:10px;padding:12px;text-align:center}\n' +
    '  .cell svg{display:block;margin:0 auto 8px;image-rendering:pixelated}\n' +
    '  figcaption{font-size:12px;text-align:left}\n' +
    '  figcaption b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}\n' +
    '  figcaption span{display:block;margin-top:3px}\n' +
    '  .meta,.hdr{opacity:.62;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}\n' +
    '  .p{opacity:.72;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;word-break:break-all}\n' +
    '  .suppressed{background:#fff8f3;border-color:#e8b48a}\n' +
    '  .suppressed::after{content:"suppressed=true";display:block;margin-top:6px;font-size:11px;color:#a35a20}\n' +
    '  footer{margin-top:28px;opacity:.6;font-size:12px;max-width:74ch}\n' +
    '</style></head><body>\n' +
    '<h1>DOG API §30 · 表情联系表 <span>' + E.STATE_IDS.length + ' 状态 · ' + E.PARAM_KEYS.length + ' 维参数 · ' + E.N + '×' + E.N + ' 网格</span></h1>\n' +
    '<p class="lede">每格是一帧的确定性渲染结果。带橙边的 SICK 没有专属参数 —— 它的向量与健康基线逐位相同，' +
    '因为表情系统工作正常，只是内容与事实不符。它仍在摇尾巴。把鼠标移上去可以看清它与基线差在哪一行。</p>\n' +
    '<div class="grid">\n' + cells + '\n</div>\n' +
    '<footer>由 <code>scripts/expression.js --sheet</code> 生成。渲染内核：<code>assets/js/expression.js</code>。' +
    '规格正文：DOG API §30 表情接口定义（Expression API v1）。点阵版可用 <code>--all --ascii</code> 导出。</footer>\n' +
    '</body></html>\n';

  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, html);
  process.stdout.write("联系表已写入 " + outFile + "（" + Buffer.byteLength(html) + " B）\n");
  return 0;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 可直接贴进任何页面的片段。这是把表情接进别处最轻的形态：
// 一行 data URI，不需要任何构建步骤、不需要网络、不需要跨域。
function cmdSnippet(stateIds, opts) {
  const scale = opts.scale || 12;
  const parts = stateIds.map(function (id) {
    const st = E.getState(id);
    const uri = E.toDataURI(id, { scale: scale, state: st.id, label: st.title });
    return (
      '<figure class="dog-expr" data-state="' + st.id + '"' +
      ' data-tail="' + st.tail + '" data-body="' + st.body + '" data-vocal="' + st.vocal + '"' +
      ' data-confidence="' + st.confidence.toFixed(2) + '"' +
      (st.suppressed ? ' data-suppressed="true"' : '') + '>\n' +
      '  <img src="' + uri + '" width="' + (E.N * scale) + '" height="' + (E.N * scale) + '"' +
      ' alt="' + esc(st.title) + '" style="image-rendering:pixelated" />\n' +
      '  <figcaption>' + st.id + ' · ' + esc(st.title) +
      '  <small>X-Dog-Tail: ' + st.tail + ' · conf ' + st.confidence.toFixed(2) + '</small></figcaption>\n' +
      '</figure>'
    );
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(stateIds.map(function (id) {
      const st = E.getState(id);
      return {
        state: st.id, title: st.title, confidence: st.confidence, suppressed: st.suppressed,
        headers: { "X-Dog-Tail": st.tail, "X-Dog-Body": st.body, "X-Dog-Vocal": st.vocal },
        params: E.stateParams(st.id),
        dataURI: E.toDataURI(id, { scale: scale, state: st.id, label: st.title })
      };
    }), null, 2) + "\n");
    return 0;
  }

  const css = '<style>\n.dog-expr{display:inline-block;margin:0 12px 12px 0;text-align:center;' +
    "font:12px/1.5 ui-sans-serif,-apple-system,'PingFang SC',sans-serif}\n" +
    '.dog-expr img{display:block;image-rendering:pixelated}\n' +
    '.dog-expr small{display:block;opacity:.6;font-family:ui-monospace,Menlo,monospace}\n' +
    '.dog-expr[data-suppressed="true"]{outline:1px dashed currentColor;outline-offset:4px}\n' +
    "</style>\n";
  process.stdout.write(css + '<div class="dog-expr-row">\n' + parts.join("\n") + "\n</div>\n");
  return 0;
}

/* --------------------------------------------------------------- 自检 */

function cmdSelftest() {
  const fails = [];
  const ok = function (cond, label) { if (!cond) fails.push(label); };

  ok(E.STATE_IDS.length === 14, "状态数应为 14，实为 " + E.STATE_IDS.length);
  ok(E.PARAM_KEYS.length === 13, "参数数应为 13，实为 " + E.PARAM_KEYS.length);
  ok(E.N === 24, "网格应为 24，实为 " + E.N);

  let total = 0, minB = Infinity, maxB = 0;
  E.STATES.forEach(function (s) {
    const svg = E.toSVG(s.id, { scale: 12 });
    total += svg.length;
    minB = Math.min(minB, svg.length);
    maxB = Math.max(maxB, svg.length);
    ok(svg.indexOf("<svg") === 0 && /<\/svg>$/.test(svg), s.id + " SVG 未闭合");
    ok(svg.indexOf("NaN") < 0 && svg.indexOf("undefined") < 0, s.id + " 含 NaN/undefined");
    ok(/<path /.test(svg), s.id + " 没有 path");
    ok(E.toASCII(s.id).split("\n").length === 24, s.id + " 点阵行数不是 24");
    ok(E.toMatrix(s.id).length === 24, s.id + " 矩阵行数不是 24");
  });

  // SICK 必须与基线逐位相同 —— 这是整章的核心断言。
  // 注意只比像素（path），元数据（data-state / aria-label）按设计就是不同的。
  const pathsOf = function (svg) { return (svg.match(/<path [^>]*>/g) || []).join(""); };
  const baseVec = JSON.stringify(E.PARAM_KEYS.filter(function (k) { return k !== "extra"; })
    .map(function (k) { return E.BASE[k]; }));
  const sickVec = JSON.stringify(E.PARAM_KEYS.filter(function (k) { return k !== "extra"; })
    .map(function (k) { return E.stateParams("SICK")[k]; }));
  ok(sickVec === baseVec, "SICK 的参数向量与基线不一致（§30 的核心声明被破坏）");
  ok(E.getState("SICK").suppressed === true, "SICK 未标记 suppressed");
  ok(pathsOf(E.toSVG("SICK")) === pathsOf(E.toSVG(E.BASE)), "SICK 的渲染像素与健康基线不同");

  // UNKNOWN 必须返回剪影而不是猜测
  const unk = E.toMatrix("UNKNOWN");
  ok(!/F|D|L|N|T/.test(unk.join("")), "UNKNOWN 应只保留剪影（不应出现实心字符）");
  ok(unk.join("").indexOf("O") >= 0, "UNKNOWN 剪影为空");

  // compose 的 409 语义
  const hold = E.compose([{ state: "JOY", weight: 0.75 }, { state: "BEG", weight: 0.25 }], { persist: true });
  const nope = E.compose([{ state: "JOY", weight: 0.55 }, { state: "BEG", weight: 0.45 }], { persist: true });
  const bad = E.compose([{ state: "NOPE", weight: 1 }], { persist: true });
  ok(hold.ok === true && hold.status === 200, "75/25 应可保持");
  ok(nope.ok === false && nope.status === 409, "55/45 应返回 409，实为 " + nope.status);
  ok(bad.ok === false && bad.status === 422, "未知状态应返回 422，实为 " + bad.status);

  // 端点与状态码清单
  ok(E.ENDPOINTS.length === 7, "端点数应为 7");
  ok(E.STATUS_CODES.length === 9, "状态码数应为 9");

  process.stdout.write("expression 自检\n" + "-".repeat(44) + "\n");
  process.stdout.write("  状态        " + E.STATE_IDS.length + "\n");
  process.stdout.write("  参数        " + E.PARAM_KEYS.length + "（A 1 / B 5 / C 7）\n");
  process.stdout.write("  SVG 体积    均值 " + Math.round(total / E.STATES.length) + " B（" + minB + "–" + maxB + "）\n");
  process.stdout.write("  SICK=基线   " + (sickVec === baseVec ? "✓" : "✗") + "\n");
  process.stdout.write("  compose     " + "75/25→200 55/45→409 unknown→422" + "\n");
  if (fails.length) {
    process.stdout.write("\n失败 " + fails.length + " 项：\n");
    fails.forEach(function (f) { process.stdout.write("  ✗ " + f + "\n"); });
    return 1;
  }
  process.stdout.write("\n全部断言通过。\n");
  return 0;
}

/* --------------------------------------------------------------- 主入口 */

function main() {
  const scale = Number(arg("scale", 12)) || 12;
  const opts = {
    scale: scale,
    persist: has("persist"),
    vector: has("vector"),
    asciiToo: has("ascii"),
    json: has("json"),
    ascii: has("ascii") || has("ascii-out"),
    svg: has("svg")
  };

  if (has("help") || process.argv.length <= 2) {
    process.stdout.write(
      "expression — DOG API 表情渲染器\n\n" +
      "  --list                     列出 14 个状态\n" +
      "  --params                   列出 13 维参数与来源等级\n" +
      "  --endpoints                列出端点与状态码\n" +
      "  --state <ID>               渲染单个状态（默认 SVG → stdout）\n" +
      "  --ascii <ID>               输出点阵\n" +
      "  --json <ID> [--vector]     输出状态元数据 / 仅参数向量\n" +
      "  --compose \"A:0.75,B:0.25\"  混合；--persist 时权重不足 0.60 返回 409\n" +
      "  --all --out <dir> [--ascii] 导出全部帧（可选同时导出点阵）\n" +
      "  --sheet <out.html>         生成单文件联系表\n" +
      "  --snippet <ID[,ID...]|all> 输出可直接粘贴的 HTML 片段（含 data URI）\n" +
      "  --selftest                 运行引擎断言\n" +
      "  --scale <n>                像素放大倍数（默认 12 → 288×288）\n"
    );
    return 0;
  }

  if (has("selftest")) return cmdSelftest();
  if (has("list")) return cmdList(), 0;
  if (has("params")) return cmdParams(), 0;
  if (has("endpoints")) return cmdEndpoints(), 0;
  if (has("sheet")) return cmdSheet(String(arg("sheet")), opts);
  if (has("all")) return cmdAll(String(arg("out", "expressions")), opts, false), 0;

  const snippet = arg("snippet", null);
  if (snippet) {
    const isAll = snippet === true || String(snippet).toLowerCase() === "all";
    const ids = isAll ? E.STATE_IDS : parseMix(String(snippet)).map(function (m) { return m.state; });
    const bad = ids.filter(function (id) { return E.STATE_IDS.indexOf(id) < 0; });
    if (bad.length) return die(EXIT[422], "422 UNPROCESSABLE — 不存在状态：" + bad.join(", "));
    return cmdSnippet(ids, opts);
  }

  const mix = arg("compose", null);
  if (mix) return cmdCompose(mix, opts);

  const state = arg("state", null) || arg("ascii", null) || arg("json", null) || arg("uri", null);
  if (state) {
    const fmt = has("ascii") ? "ascii" : has("json") ? "json" : has("uri") ? "uri" : "svg";
    return cmdOne(String(state), fmt, opts);
  }

  die(1, "没有可执行的命令。用 --help 查看用法。");
}

process.exit(main());
