/* ═══════════════════════════════════════════════════════════════════════════
   DOG API · 图表渲染内核（Mono 语法）
   ───────────────────────────────────────────────────────────────────────────
   本文件把 Lieflat Charts 的 Mono 语法搬进本项目：纸灰底 + 炭黑墨、明度即数据、
   一行一个诚实单位。19 个渲染函数对应 Lieflat 目录里的 19 张图型，
   每一张都保留原模板的核心几何与编码方式，只替换数据与文案。

   · 图形语言与令牌：Lieflat Charts（github.com/larashero3-dotcom/lieflat-charts）
     按 PolyForm Noncommercial License 1.0.0 使用。mono-tokens.js 的内容按该
     项目「开源分发时内联」的说明内联在此，未做色值改动。
   · 数据层：本项目自己的计算内核。能量 / 饮水 / 配额 / 热风险 HRI / 就诊应激
     VSI / 分诊 / 生命阶段一律实时调用 window.DogQuant 取得，不复制常量；
     表情四维取自 window.DogExpression 的真实参数向量。两者不可用时退回
     同值的内联常量，页面仍能渲染并在来源行标注「离线回退值」。

   设计约束（违反即返工，与 Lieflat 第二节一致）：
     · 只有纸灰与炭黑两极，中间 7 级灰阶；不透明、无渐变、无阴影、无发光。
     · 明度即数据：最重要 = 最黑。多系列沿 ladder 按重要性分配。
     · 面积编码一律开方（Math.sqrt）；柱状图不断轴。
     · 演示数据一律用确定性 rnd(i,k)，禁用 Math.random()。
     · SVG 最小字号：半宽卡 6.5px，通栏 5.5px。
     · 每份产出只锁一种色彩系统 —— 本文件只有 Mono；唯一的暗卡是 daily-cascade。
   ─────────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  /* ═══ 1 · 令牌（内联自 mono-tokens.js） ═══════════════════════════════════ */
  var INK = '#1C1C1A';    // 墨：主数据、标题、强调
  var PAPER = '#F0EFEB';  // 纸：页面底色 = 浅卡底色
  var MUTED = '#8F8E88';  // 次级文字、副标题
  var FAINT = '#C6C5BF';  // 来源行、辅助刻度
  var GRID = '#DEDDD6';   // 网格线、发丝线

  // 7 级灰阶 ladder：多系列按重要性从黑到浅分配
  var L = ['#1C1C1A', '#4A4944', '#6A6963', '#8F8E88', '#B0AFA9', '#C6C5BF', '#D8D7D1'];

  // 暗卡专用（底 #1C1C1A，其上的「墨」反转为纸色）
  var DARK = {
    bg: '#1C1C1A', ink: '#F0EFEB', muted: '#8F8E88', faint: '#55554F',
    grid: '#2E2D29', ladder: ['#F0EFEB', '#DCDAD2', '#C9C7BD', '#B3B0A4', '#8F8E88', '#6A6963', '#4A4944']
  };

  // 字体：Inter 优先，中文回落到系统字体。不外链 —— 本项目所有页面
  // 都必须能直接双击打开、不联网、不请求 CDN。
  var FONT_STACK = "'Inter','PingFang SC','Hiragino Sans GB','Microsoft YaHei',-apple-system,'Segoe UI',sans-serif";

  var MOTION = {
    enter: 900, enterSlow: 1200,
    staggerDot: 12,   // 点阵逐个延迟 ms（8–15）
    staggerBar: 100   // 条形逐根延迟 ms（80–130）
  };

  /* ═══ 2 · 卡片 CSS（生成新图时照抄这个结构） ══════════════════════════
     <div class="card [dark] [wide]">
       <h2>结论式标题</h2>
       <div class="sub">副标题 · 图例说明 · 单位</div>
       <svg data-chart="xx" viewBox="0 0 400 320"></svg>
       <div class="src">图型名 · 系列 · 数据来源（全大写）</div>
     </div>                                                            */
  var CARD_CSS = [
    ':root{--bg:' + PAPER + ';--dark:' + DARK.bg + ';--ink:' + INK + ';--muted:' + MUTED + ';--faint:' + FAINT + ';--grid:' + GRID + '}',
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{background:var(--bg);font-family:' + FONT_STACK + ';color:var(--ink);padding:40px;-webkit-font-smoothing:antialiased}',
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px;max-width:1400px;margin:0 auto}',
    '.card{background:var(--bg);border-radius:24px;padding:28px 28px 20px}',
    '.card.dark{background:var(--dark);color:' + PAPER + '}',
    '.card.dark .sub{color:' + MUTED + '}',
    '.card.dark .src{color:' + DARK.faint + '}',
    '.card.wide{grid-column:1/-1}',
    'h2{font-weight:700;font-size:16.5px;letter-spacing:-.02em;margin-bottom:3px}',
    '.sub{font-size:11.5px;color:var(--muted);margin-bottom:14px;line-height:1.65}',
    '.src{font-size:9.5px;color:var(--faint);margin-top:10px;letter-spacing:.08em;font-weight:500}',
    '.ch{height:320px}',
    '.card svg{width:100%;height:auto;display:block;margin:0 auto;cursor:pointer}',
    'svg text{font-family:' + FONT_STACK + '}',
    // 入场动画：pop 缩放入场 / fade 淡入 / draw 描线；带 reduced-motion 降级
    '.pop{transform-box:fill-box;transform-origin:center;animation:pop .5s cubic-bezier(.2,.7,.3,1.3) both}',
    '@keyframes pop{from{transform:scale(0)}to{transform:none}}',
    '.fade{animation:fade .9s ease both}',
    '@keyframes fade{from{opacity:0}}',
    '.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1s cubic-bezier(.4,0,.2,1) both}',
    '@keyframes draw{to{stroke-dashoffset:0}}',
    '@media (prefers-reduced-motion:reduce){.pop,.fade{animation:none}.draw{animation:none;stroke-dasharray:none;stroke-dashoffset:0}}'
  ].join('\n');

  /* ═══ 3 · 几何与 SVG 快捷 ═══════════════════════════════════════════════ */
  var NS = 'http://www.w3.org/2000/svg';
  var D2R = Math.PI / 180;

  function el(p, t, a) {
    var n = document.createElementNS(NS, t);
    for (var k in a) if (a[k] != null) n.setAttribute(k, a[k]);
    p.appendChild(n);
    return n;
  }
  function txt(p, a, s) { var n = el(p, 'text', a); n.textContent = s; return n; }
  function tip(n, s) {
    var t = document.createElementNS(NS, 'title');
    t.textContent = s; n.appendChild(t); return n;
  }
  // 确定性伪随机：刷新两次必须长一样，否则截图 / 回归对比全部失效
  function rnd(i, k) { return Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000; }
  function pol(cx, cy, r, deg) { return [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)]; }
  // 环形扇区 path
  function sect(cx, cy, r0, r1, a0, a1) {
    var big = a1 - a0 > 180 ? 1 : 0;
    var pa = pol(cx, cy, r1, a0), pb = pol(cx, cy, r1, a1);
    var pc = pol(cx, cy, r0, a1), pd = pol(cx, cy, r0, a0);
    return 'M' + pa[0] + ' ' + pa[1] + ' A' + r1 + ' ' + r1 + ' 0 ' + big + ' 1 ' + pb[0] + ' ' + pb[1] +
      ' L' + pc[0] + ' ' + pc[1] + ' A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + pd[0] + ' ' + pd[1] + ' Z';
  }
  // 手绘感圆（editorial 系气泡用）：圆周叠两个慢波 + 噪声，seed 定形
  function blob(x, y, r, seed) {
    var n = Math.max(14, Math.round(r * 1.6)), pts = [], t, a, w;
    for (t = 0; t < n; t++) {
      a = t / n * Math.PI * 2;
      w = 1 + .055 * Math.sin(a * 2 + seed * 7) + .04 * Math.sin(a * 3 + seed * 13) + (rnd(seed + t, 3) - .5) * .03;
      pts.push([x + Math.cos(a) * r * w, y + Math.sin(a) * r * w]);
    }
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (t = 0; t < n; t++) {
      var p = pts[t], q = pts[(t + 1) % n];
      d += ' Q' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ' + ((p[0] + q[0]) / 2).toFixed(1) + ' ' + ((p[1] + q[1]) / 2).toFixed(1);
    }
    return d + ' Z';
  }
  function smoothPath(pts) {
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var k = 1; k < pts.length - 1; k++) {
      var p = pts[k], q = pts[k + 1];
      d += ' Q' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ' + ((p[0] + q[0]) / 2).toFixed(1) + ' ' + ((p[1] + q[1]) / 2).toFixed(1);
    }
    var last = pts[pts.length - 1];
    return d + ' L' + last[0].toFixed(1) + ' ' + last[1].toFixed(1);
  }

  /* ═══ 4 · 统一 reveal：滚入视野才播，点击重播 ═══════════════════════════
     带 timer 登记（keep），重播前清干净，防动画叠加。 */
  var timers = {};
  function keep(id, t) { (timers[id] = timers[id] || []).push(t); }
  function clearTimers(id) {
    (timers[id] || []).forEach(function (t) { clearInterval(t); clearTimeout(t); });
    timers[id] = [];
  }
  function reveal(node, fn) {
    var id = node.getAttribute('data-chart');
    var go = function () {
      clearTimers(id);
      node.innerHTML = '';
      fn(node);
    };
    if (typeof IntersectionObserver === 'undefined') { go(); node.addEventListener('click', go); return; }
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { go(); io.disconnect(); }
    }, { threshold: .3 });
    io.observe(node);
    node.addEventListener('click', go);
  }

  /* ═══ 5 · 数据层：优先实时调用本项目引擎 ═══════════════════════════════ */
  function Q() { return global.DogQuant || null; }
  function X() { return global.DogExpression || null; }

  // 图表使用的标准个体：14.5 kg 绝育成年混血犬（与 §29 示例一致）
  var DOG = { weightKg: 14.5, ageMonths: 48, ageYears: 4, neutered: true, breedClass: 'mixed', coat: 'short' };

  function num(v, fb) { return (typeof v === 'number' && isFinite(v)) ? v : fb; }
  function lifeExp(weightKg) {
    var q = Q();
    if (q && q.lifeStage) {
      var r = q.lifeStage({ ageYears: 4, weightKg: weightKg });
      if (r && typeof r.lifeExpectancy === 'number') return r.lifeExpectancy;
    }
    return Math.min(18, Math.max(5, 16.7 - 2.17 * Math.log(weightKg)));  // 离线回退
  }
  function hriScore(tempC, humidityPct, prof, env) {
    var q = Q();
    if (q && q.hri) {
      var p = {}; for (var k in DOG) p[k] = DOG[k];
      for (var k2 in (prof || {})) p[k2] = prof[k2];
      var e = { tempC: tempC, humidityPct: humidityPct, acclimatedDays: 30 };
      for (var k3 in (env || {})) e[k3] = env[k3];
      var r = q.hri(p, e);
      if (r && typeof r.score === 'number') return r.score;
    }
    return Math.max(0, tempC - 22) * 0.6 + Math.max(0, humidityPct - 40) * 0.15 - 2;  // 离线回退
  }

  /* ═══ 6 · 渲染器 ═══════════════════════════════════════════════════════ */
  var RENDER = {};

  /* ── F1 Rung Bars ────────────────────────────────────────────────────────
     柱状图的 Lupi 化：柱身 = 一格格横档，1 档 = 1 个诚实单位（这里是 1 小时）。
     远看是柱状图剪影，近看每一档都数得出来。                                   */
  RENDER['sleep-rungs'] = function (s) {
    var D = [['幼犬 <12 月', 19], ['老龄犬', 16], ['猫（参照）', 15], ['成犬', 13], ['人（参照）', 8]];
    var base = 268, step = 6.4, HW = 17;
    D.forEach(function (row, i) {
      var name = row[0], v = row[1], x = 72 + i * 66;
      var shade = i === 4 ? FAINT : i === 2 ? MUTED : i === 1 ? L[1] : i === 3 ? L[2] : INK;
      for (var k = 0; k < v; k++) {
        var y = base - k * step, w = HW - 1.6 + rnd(k + 1, i + 2) * 3.2;
        el(s, 'line', {
          x1: x - w, y1: y, x2: x + w, y2: y, stroke: shade, 'stroke-width': 1,
          opacity: i === 4 ? .6 : .5 + rnd(k + 2, i + 4) * .5, class: 'fade',
          style: 'animation-delay:' + (i * .08 + k * .012) + 's'
        });
        if (k % 5 === 4) el(s, 'circle', {
          cx: x + HW + 4.5, cy: y, r: .8, fill: FAINT, class: 'fade',
          style: 'animation-delay:' + (i * .08 + k * .012) + 's'
        });
      }
      var topY = base - (v - 1) * step;
      var n = txt(s, {
        x: x, y: topY - 11, 'font-size': 11.5, 'font-weight': 800, fill: i === 4 ? MUTED : INK,
        'text-anchor': 'middle', class: 'fade', style: 'animation-delay:' + (.4 + i * .08) + 's'
      }, v);
      tip(n, name + ' — 每日 ' + v + ' 小时');
      txt(s, {
        x: x, y: base + 18, 'font-size': 7.5, 'font-weight': 700, fill: MUTED, 'text-anchor': 'middle',
        'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:' + (i * .08) + 's'
      }, name);
    });
    el(s, 'line', { x1: 24, y1: base + 4, x2: 376, y2: base + 4, stroke: GRID, 'stroke-width': .8, class: 'fade' });
    txt(s, {
      x: 200, y: 306, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:.9s'
    }, '一格 = 一小时 · 每第五格带点标 · 两只参照物种不上墨');
  };

  /* ── F2 Hairline Line ────────────────────────────────────────────────────
     折线图的 Lupi 化：每天一根发丝立成日历地板 + 发丝折线 + 逐点圆点。
     越界的点改空心；分级线是虚线，不是坐标轴。                                 */
  RENDER['hri-line'] = function (s) {
    var N = 25, vs = [], ts = [], i;
    for (i = 0; i < N; i++) { ts.push(16 + i); vs.push(Math.round(hriScore(16 + i, 40) * 10) / 10); }
    var vmin = -4, vmax = 11;
    var x = function (d) { return 30 + d * (346 / (N - 1)); };
    var base = 264, map = function (v) { return base - (v - vmin) / (vmax - vmin) * (base - 54); };
    // 分级线：HRI 的 0/5/10/15 是规则线，画成虚线而非轴
    [[5, '注意'], [10, '警告 · 户外取消']].forEach(function (row, gi) {
      var y = map(row[0]);
      el(s, 'line', {
        x1: 26, y1: y, x2: 374, y2: y, stroke: '#C6C5BF', 'stroke-width': .7,
        'stroke-dasharray': '2 4', class: 'fade', style: 'animation-delay:' + (.5 + gi * .1) + 's'
      });
      txt(s, {
        x: 30, y: y - 5, 'font-size': 6.8, 'font-weight': 700, fill: MUTED,
        'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:' + (.55 + gi * .1) + 's'
      }, 'HRI ' + row[0] + ' · ' + row[1]);
    });
    // 日历地板
    for (i = 0; i < N; i++) el(s, 'line', {
      x1: x(i), y1: base, x2: x(i), y2: base - 7, stroke: L[5], 'stroke-width': .6,
      class: 'fade', style: 'animation-delay:' + (i * .008) + 's'
    });
    el(s, 'line', { x1: 24, y1: base, x2: 376, y2: base, stroke: GRID, 'stroke-width': .8, class: 'fade' });
    // 32 °C 硬停：与分数无关的一条规则
    var xs = x(32 - 16);
    el(s, 'line', {
      x1: xs, y1: 48, x2: xs, y2: base, stroke: INK, 'stroke-width': .9,
      'stroke-dasharray': '3 3', class: 'fade', style: 'animation-delay:1s'
    });
    txt(s, {
      x: xs - 4, y: 44, 'font-size': 6.8, 'font-weight': 800, fill: INK, 'text-anchor': 'end',
      'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:1.05s'
    }, '32 °C 起硬停');
    var pts = vs.map(function (v, d) { return x(d) + ' ' + map(v); }).join(' L ');
    el(s, 'path', {
      d: 'M' + pts, fill: 'none', stroke: INK, 'stroke-width': 1, pathLength: 1,
      class: 'draw', style: 'animation-duration:1.3s'
    });
    var top = [];
    for (var d2 = 0; d2 < N; d2++) if (vs[d2] >= 4.9 && (d2 === 0 || vs[d2 - 1] < 4.9)) top.push(d2);
    top = top.concat([N - 1]);
    vs.forEach(function (v, d) {
      var over = ts[d] >= 32, big = top.indexOf(d) >= 0;
      var dot = el(s, 'circle', {
        cx: x(d), cy: map(v), r: big ? 4.2 : 2.1,
        fill: over ? PAPER : INK, stroke: INK, 'stroke-width': over ? 1.1 : 0,
        class: 'pop', style: 'animation-delay:' + (.2 + d * .028) + 's'
      });
      tip(dot, ts[d] + ' °C · RH 40% · HRI ' + v + (over ? '（已入硬停区）' : ''));
      if (big) txt(s, {
        x: x(d), y: map(v) - 11, 'font-size': 9.5, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:' + (1 + d * .01) + 's',
        class: 'fade'
      }, v);
    });
    [[16, '16 °C'], [28, '28 °C'], [40, '40 °C']].forEach(function (row) {
      txt(s, {
        x: x(row[0] - 16), y: base + 18, 'font-size': 7.5, 'font-weight': 600, fill: MUTED,
        'text-anchor': 'middle', 'letter-spacing': '.08em', class: 'fade'
      }, row[1]);
    });
    txt(s, {
      x: 200, y: 306, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.2s'
    }, '一个点 = 一摄氏度 · 空心 = 已入硬停区 · 虚线是规则线不是坐标轴');
  };

  /* ── F3 Hairline Area ────────────────────────────────────────────────────
     面积图的 Lupi 化：填充不是色块，是一天一根发丝立到自己的峰值。
     横轴取对数间距 —— 小体型段才有分辨率，而且刻度会写明它是体重。              */
  RENDER['life-area'] = function (s) {
    var N = 48, W0 = 1.5, W1 = 70;
    var wOf = function (i) { return W0 * Math.pow(W1 / W0, i / (N - 1)); };
    var base = 264, vmin = 7, vmax = 16;
    var x = function (i) { return 28 + i * (346 / (N - 1)); };
    var map = function (v) { return base - (v - vmin) / (vmax - vmin) * (base - 56); };
    el(s, 'line', { x1: 22, y1: base, x2: 378, y2: base, stroke: GRID, 'stroke-width': .8, class: 'fade' });
    var vs = [], i;
    for (i = 0; i < N; i++) vs.push(lifeExp(wOf(i)));
    var peak = 0;                                   // 最轻的那只最长寿
    vs.forEach(function (v, d) {
      el(s, 'line', {
        x1: x(d), y1: base, x2: x(d), y2: map(v),
        stroke: d === peak ? INK : MUTED, 'stroke-width': d === peak ? 1.1 : .55,
        opacity: d === peak ? 1 : .5 + rnd(d + 1, 7) * .45,
        class: 'fade', style: 'animation-delay:' + (d * .014) + 's'
      });
    });
    var pts = vs.map(function (v, d) { return x(d) + ' ' + map(v); }).join(' L ');
    el(s, 'path', {
      d: 'M' + pts, fill: 'none', stroke: INK, 'stroke-width': 1.2, pathLength: 1,
      class: 'draw', style: 'animation-delay:.4s;animation-duration:1.3s'
    });
    // 两个标数点：1.5 kg 与 70 kg —— 曲线的两端
    [[peak, vs[peak]], [N - 1, vs[N - 1]]].forEach(function (row, k) {
      var d = row[0], v = row[1];
      var dot = el(s, 'circle', {
        cx: x(d), cy: map(v), r: 4.2, fill: INK, class: 'pop',
        style: 'animation-delay:' + (1.1 + k * .1) + 's'
      });
      tip(dot, (k === 0 ? W0 + ' kg' : W1 + ' kg') + ' — 预期寿命 ' + v + ' 年');
      txt(s, {
        x: x(d) + (k === 0 ? 8 : -8), y: map(v) - 11, 'font-size': 9.5, 'font-weight': 800, fill: INK,
        'text-anchor': k === 0 ? 'start' : 'end',
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:' + (1.2 + k * .1) + 's',
        class: 'fade'
      }, v.toFixed(1) + ' 年');
    });
    [[2, '2 kg'], [5, '5'], [10, '10'], [20, '20'], [40, '40'], [70, '70 kg']].forEach(function (row) {
      var i2 = (N - 1) * Math.log(row[0] / W0) / Math.log(W1 / W0);
      el(s, 'line', {
        x1: x(i2), y1: base, x2: x(i2), y2: base + (row[0] === 70 ? 7 : 4), stroke: L[5],
        'stroke-width': .6, class: 'fade'
      });
      txt(s, {
        x: x(i2), y: base + 18, 'font-size': 7.5, 'font-weight': 600, fill: MUTED,
        'text-anchor': 'middle', class: 'fade'
      }, row[1]);
    });
    txt(s, {
      x: 200, y: 306, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.4s'
    }, '一根发丝 = 一个体重档 · 横轴取对数 · 体重每翻一倍，寿命少 1.5 年');
  };

  /* ── F4 Tick Donut ───────────────────────────────────────────────────────
     环形图的 Lupi 化：一整天 1440 分钟折成 100 格表盘，1 格 = 1%。
     段间留一格呼吸，中心只放总数与单位说明。                                   */
  RENDER['day-donut'] = function (s) {
    // 前五段来自引擎目标值，末段是余量。分钟数是真的；占比只是把 1440 分钟
    // 折成 100 格时的格数，取整差额显式记在「独处 / 其余」上，不静默摊掉。
    var MIN = 1440, D = [
      ['睡眠', 780, INK],                 // dns 休息目标 = 13 h
      ['独处 / 其余', 475, L[1]],          // 1440 − 其余五项的真实余量
      ['进食饮水', 60, MUTED],
      ['人际互动', 60, L[4]],              // dns 社交目标 60 min
      ['户外运动', 45, FAINT],             // exerciseTarget = 45 min
      ['嗅闻', 20, L[6]]                  // sniffTarget = 20 min
    ];
    var pct = D.map(function (r) { return Math.round(r[1] / MIN * 100); });
    var sum = pct.reduce(function (a, b) { return a + b; }, 0);
    pct[1] += 100 - sum;                  // 取整的差额显式记在第二段上
    var cx = 200, cy = 146, R0 = 62;
    var k0 = 0;
    D.forEach(function (row, si) {
      var name = row[0], mins = row[1], v = pct[si], shade = row[2];
      for (var k = 0; k < v; k++) {
        var idx = k0 + k, a = idx * 3.6 - 90;
        var len = 10 + rnd(idx + 1, si + 2) * 6;
        var p1 = pol(cx, cy, R0, a), p2 = pol(cx, cy, R0 + len, a);
        el(s, 'line', {
          x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: shade, 'stroke-width': 1,
          class: 'fade', style: 'animation-delay:' + (idx * .01) + 's'
        });
        if (idx % 10 === 0) {
          var dp = pol(cx, cy, R0 - 5, a);
          el(s, 'circle', { cx: dp[0], cy: dp[1], r: .8, fill: FAINT, class: 'fade', style: 'animation-delay:' + (idx * .01) + 's' });
        }
      }
      var mid = (k0 + v / 2) * 3.6 - 90;
      var lp = pol(cx, cy, R0 + 40, mid), gp = pol(cx, cy, R0 + 20, mid);
      el(s, 'line', {
        x1: gp[0], y1: gp[1], x2: lp[0], y2: lp[1], stroke: FAINT, 'stroke-width': .7,
        'stroke-dasharray': '1 3', class: 'fade', style: 'animation-delay:' + (.6 + si * .1) + 's'
      });
      var cosA = Math.cos(mid * D2R);
      var anchor = cosA > 0.3 ? 'start' : cosA < -0.3 ? 'end' : 'middle';
      var lab = txt(s, {
        x: lp[0], y: lp[1] + 3, 'font-size': 8, 'font-weight': 800, fill: shade === INK ? INK : L[1],
        'text-anchor': anchor, 'letter-spacing': '.04em',
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:' + (.65 + si * .1) + 's',
        class: 'fade'
      }, name + ' · ' + v);
      tip(lab, name + ' — ' + mins + ' 分钟／日（占表盘 ' + v + ' 格）');
      k0 += v;
    });
    txt(s, {
      x: cx, y: cy - 2, 'font-size': 22, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
      class: 'fade', style: 'animation-delay:.9s'
    }, '100');
    txt(s, {
      x: cx, y: cy + 14, 'font-size': 6.8, 'font-weight': 600, fill: MUTED, 'text-anchor': 'middle',
      'letter-spacing': '.08em', class: 'fade', style: 'animation-delay:.9s'
    }, '格 · 一格 = 1% = 14.4 分钟');
    txt(s, {
      x: 200, y: 300, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.2s'
    }, '十二点为零 · 每第十格带点标 · 分钟数是真的，格数是取整的，差额记在「独处 / 其余」上');
  };

  /* ── F5 Tick Rows ────────────────────────────────────────────────────────
     横向条形：一行 = 一个分诊等级，1 tick = 一条红线。行尾大数。                */
  RENDER['triage-rows'] = function (s) {
    var q = Q(), D;
    // 标签与处置说明一律向引擎反查，不在图里另写一份 ——
    // 取该优先级的第一条红线代入 triage()，返回的就是该级的官方式措辞。
    // （曾经这里手写过「P1 紧急 / P2 尽快 · 当日安排」，与 §28 的「当日（小时级）/ 72 小时内」打架，
    //   正是本项目反复嘲笑的那类漂移：一份事实两个副本。）
    var LEVEL_FALLBACK = ['立即（分钟级）', '当日（小时级）', '72 小时内', '常规'];
    var level = function (p) {
      var def = q && q.TRIAGE_DEFS ? q.TRIAGE_DEFS.filter(function (t) { return t.p === p; })[0] : null;
      var flags = {}; if (def) flags[def.key] = true;
      var r = (q && q.triage && def) ? q.triage(flags) : null;
      var ok = !!(r && r.priority === p);
      var lab = ok ? r.label : LEVEL_FALLBACK[p];
      var m = lab.match(/^(.+?)（(.+?)）$/);          // 「立即（分钟级）」→ 立即 / 分钟级
      return [(ok ? r.code : 'P' + p) + ' ' + (m ? m[1] : lab), m ? m[2] : lab, ok ? r.note : ''];
    };
    if (q && q.TRIAGE_DEFS) {
      var by = {};
      q.TRIAGE_DEFS.forEach(function (t) { by[t.p] = (by[t.p] || 0) + 1; });
      D = [0, 1, 2, 3].map(function (p) {
        var lv = level(p);
        return [lv[0], num(by[p], 0), lv[1], lv[2]];
      });
    } else {
      D = [0, 1, 2, 3].map(function (p) {
        var lv = level(p);
        return [lv[0], [12, 8, 6, 1][p], lv[1], lv[2]];
      });
    }
    var total = D.reduce(function (a, r) { return a + r[1]; }, 0);
    var y0 = function (i) { return 52 + i * 48; }, X0 = 104, PX = 6.9;
    D.forEach(function (row, i) {
      var name = row[0], v = row[1], shortNote = row[2], fullNote = row[3], y = y0(i);
      var shade = i < 2 ? INK : i === 2 ? L[1] : MUTED;
      txt(s, {
        x: 94, y: y + 3, 'font-size': 8, 'font-weight': 700, fill: '#6A6963', 'text-anchor': 'end',
        'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:' + (i * .08) + 's'
      }, name);
      el(s, 'line', {
        x1: X0, y1: y + 9, x2: X0 + 14 * PX, y2: y + 9, stroke: GRID, 'stroke-width': .6,
        class: 'fade', style: 'animation-delay:' + (i * .08) + 's'
      });
      for (var k = 0; k < v; k++) {
        var x = X0 + k * PX + PX / 2, h = 9 + rnd(k + 1, i + 2) * 6;
        el(s, 'line', {
          x1: x, y1: y + 9, x2: x, y2: y + 9 - h, stroke: shade, 'stroke-width': .9,
          opacity: .55 + rnd(k + 3, i + 5) * .45, class: 'fade',
          style: 'animation-delay:' + (i * .08 + k * .012) + 's'
        });
        if (k % 5 === 4) el(s, 'circle', {
          cx: x, cy: y + 13, r: .8, fill: FAINT, class: 'fade',
          style: 'animation-delay:' + (i * .08 + k * .012) + 's'
        });
      }
      var lab = txt(s, {
        x: X0 + v * PX + 10, y: y + 4, 'font-size': 11.5, 'font-weight': 800, fill: i < 2 ? INK : MUTED,
        class: 'fade', style: 'animation-delay:' + (.4 + i * .08) + 's'
      }, v);
      tip(lab, name + ' — ' + v + ' 条' + (fullNote ? ' · ' + fullNote : ''));
      txt(s, {
        x: X0 + v * PX + 10 + 18, y: y + 4, 'font-size': 7, 'font-weight': 600, fill: FAINT,
        class: 'fade', style: 'animation-delay:' + (.5 + i * .08) + 's'
      }, shortNote);
    });
    txt(s, {
      x: 200, y: 300, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1s'
    }, '一根 tick = 一条红线 · 共 ' + total + ' 条 · 每第五根带点标');
  };

  /* ── F9 Rung Waterfall ───────────────────────────────────────────────────
     瀑布：从 0 一分一分累加到总分，每级一把小梯子，加项实档。
     取整口径在底注里认账，不凑数。                                            */
  RENDER['hri-waterfall'] = function (s) {
    var q = Q(), rows = [];
    if (q && q.hri) {
      var prof = { weightKg: 12, coat: 'double', brachycephalic: true, ageMonths: 48, breedClass: 'mixed' };
      var r = q.hri(prof, { tempC: 27, humidityPct: 60, acclimatedDays: 0 });
      var NAME = {
        '气温': '气温 27 °C', '湿度': '湿度 60%',
        '短鼻结构（散热通道受限）': '短鼻结构', '双层 / 厚被毛': '双层被毛', '未热适应': '未热适应'
      };
      r.factors.forEach(function (f) {
        if (f.label.indexOf('气温') === 0) rows.push(['气温 27 °C', f.points]);
        else if (f.label.indexOf('湿度') === 0) rows.push(['湿度 60%', f.points]);
        else if (NAME[f.label]) rows.push([NAME[f.label], f.points]);
      });
    }
    if (rows.length < 4) rows = [['气温 27 °C', 3], ['湿度 60%', 3], ['短鼻结构', 4], ['双层被毛', 1.5], ['未热适应', 2]];
    var TOTAL = rows.reduce(function (a, r2) { return a + r2[1]; }, 0);
    var step = 6.4, UNIT = 0.5, base = 250, HW = 11;
    var yOf = function (k) { return base - k * step; };
    var levels = [], lv = 0;
    rows.forEach(function (r2) { levels.push([r2[0], r2[1], lv]); lv += r2[1]; });
    var x0 = function (i) { return 52 + i * 58; };
    // 硬止线：HRI ≥ 10 取消户外运动
    var yStop = yOf(10 / UNIT);
    el(s, 'line', {
      x1: 24, y1: yStop, x2: 376, y2: yStop, stroke: INK, 'stroke-width': .9,
      'stroke-dasharray': '3 3', class: 'fade', style: 'animation-delay:.5s'
    });
    txt(s, {
      x: 28, y: yStop - 5, 'font-size': 6.8, 'font-weight': 800, fill: INK, 'letter-spacing': '.06em',
      class: 'fade', style: 'animation-delay:.55s'
    }, '10 = 取消户外运动');
    levels.forEach(function (row, i) {
      var name = row[0], v = row[1], lo = row[2];
      var x = x0(i), n = Math.round(v / UNIT);
      for (var k = 0; k < n; k++) {
        var y = yOf(Math.round(lo / UNIT) + k), w = HW - 1.2 + rnd(k + 1, i + 2) * 2.4;
        el(s, 'line', {
          x1: x - w, y1: y, x2: x + w, y2: y, stroke: INK, 'stroke-width': 1,
          opacity: .6 + rnd(k + 2, i + 4) * .4, class: 'fade',
          style: 'animation-delay:' + (i * .12 + k * .014) + 's'
        });
      }
      if (i < levels.length - 1) {
        var lvl = Math.round((lo + v) / UNIT);
        el(s, 'line', {
          x1: x + HW + 2, y1: yOf(lvl), x2: x0(i + 1) - HW - 2, y2: yOf(lvl),
          stroke: FAINT, 'stroke-width': .7, 'stroke-dasharray': '2 3', class: 'fade',
          style: 'animation-delay:' + (.3 + i * .12) + 's'
        });
      }
      var num2 = txt(s, {
        x: x, y: yOf(Math.round((lo + v) / UNIT)) - 8, 'font-size': 9.5, 'font-weight': 800,
        fill: INK, 'text-anchor': 'middle', class: 'fade', style: 'animation-delay:' + (.4 + i * .12) + 's'
      }, v);
      tip(num2, name + ' —— 贡献 ' + v + ' 个指数点');
      txt(s, {
        x: x, y: base + 18, 'font-size': 6.8, 'font-weight': 700, fill: MUTED, 'text-anchor': 'middle',
        'letter-spacing': '.04em', class: 'fade', style: 'animation-delay:' + (i * .12) + 's'
      }, name);
    });
    // 合计柱：从 0 立起
    var xt = x0(levels.length), nt = Math.round(TOTAL / UNIT);
    for (var k2 = 0; k2 < nt; k2++) {
      var yt = yOf(k2), wt = HW - 1.2 + rnd(k2 + 1, 9) * 2.4;
      el(s, 'line', {
        x1: xt - wt, y1: yt, x2: xt + wt, y2: yt, stroke: INK, 'stroke-width': 1,
        opacity: .55 + rnd(k2 + 2, 11) * .45, class: 'fade',
        style: 'animation-delay:' + (.7 + k2 * .02) + 's'
      });
    }
    var tot = txt(s, {
      x: xt, y: yOf(nt) - 9, 'font-size': 12, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
      class: 'fade', style: 'animation-delay:1.1s'
    }, TOTAL);
    tip(tot, '合计 ' + TOTAL + ' 个指数点 —— 已越过硬止线 ' + (TOTAL - 10) + ' 点');
    txt(s, {
      x: xt, y: base + 18, 'font-size': 6.8, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
      'letter-spacing': '.04em', class: 'fade', style: 'animation-delay:1.1s'
    }, '合计');
    el(s, 'line', { x1: 24, y1: base + 4, x2: 376, y2: base + 4, stroke: GRID, 'stroke-width': .8, class: 'fade' });
    txt(s, {
      x: 200, y: 300, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.2s'
    }, '一格 = 0.5 个指数点 · 虚线阶梯 = 累计水位 · 横虚线 = 硬止线 10');
  };

  /* ── F10 Dot Heat ────────────────────────────────────────────────────────
     星期×小时的小热力：点面积 = 相对强度（开方换算），静默格留一粒极小点。
     两个峰是真的（晨昏活动双峰），工作日白天的那道沟也是真的。                   */
  RENDER['bark-heat'] = function (s) {
    var DAY = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    var x0 = function (j) { return 66 + j * 26.5; }, y0 = function (i) { return 58 + i * 29; };
    var v = function (i, j) {
      var wk = i < 5, hour = 6 + j * 2;
      var morning = Math.exp(-Math.pow(hour - 8, 2) / 6);
      var evening = Math.exp(-Math.pow(hour - 18, 2) / 6);
      var midday = wk ? 0.14 : 0.58;     // 工作日白天家里没人
      var raw = (wk ? 1 : .86) * (morning * 26 + evening * 22 + midday * 10) * (0.62 + rnd(i * 12 + j + 1, j + 3) * .75);
      return Math.round(raw);
    };
    var max = 0, mi = 0, mj = 0, i, j;
    for (i = 0; i < 7; i++) for (j = 0; j < 12; j++) { var t = v(i, j); if (t > max) { max = t; mi = i; mj = j; } }
    for (i = 0; i < 7; i++) {
      txt(s, {
        x: 52, y: y0(i) + 3, 'font-size': 7.5, 'font-weight': 700, fill: '#6A6963', 'text-anchor': 'end',
        'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:' + (i * .05) + 's'
      }, DAY[i]);
      for (j = 0; j < 12; j++) {
        var tv = v(i, j), x = x0(j), y = y0(i);
        if (!tv) {
          el(s, 'circle', { cx: x, cy: y, r: .8, fill: L[6], class: 'pop', style: 'animation-delay:' + (i * .05 + j * .015) + 's' });
          continue;
        }
        var hero = (i === mi && j === mj);
        var dot = el(s, 'circle', {
          cx: x, cy: y, r: 1.2 + Math.sqrt(tv) * 1.9,
          fill: tv > max * .66 ? INK : tv > max * .33 ? '#6A6963' : '#B0AFA9',
          class: 'pop', style: 'animation-delay:' + (i * .05 + j * .015) + 's'
        });
        tip(dot, DAY[i] + ' ' + String((6 + j * 2) % 24).padStart(2, '0') + ':00 — 相对强度 ' + tv + '（满分 100）');
        if (hero) el(s, 'circle', {
          cx: x, cy: y, r: 1.2 + Math.sqrt(tv) * 1.9 + 3.4, fill: 'none', stroke: INK,
          'stroke-width': 1, 'stroke-dasharray': '2 3', class: 'fade', style: 'animation-delay:1s'
        });
      }
    }
    for (j = 0; j < 12; j += 2) txt(s, {
      x: x0(j), y: y0(6) + 26, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      class: 'fade', style: 'animation-delay:' + (j * .02) + 's'
    }, String((6 + j * 2) % 24).padStart(2, '0'));
    txt(s, {
      x: 200, y: 306, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.1s'
    }, '点面积 = 相对强度 · 虚线环 = 峰值格 ' + max + ' · 小点 = 安静时段 · C 级示意数据');
  };

  /* ── F11 Tick Gauge ──────────────────────────────────────────────────────
     进度：tick 弯成 210° 表盘，一格 = 24 分制的 1%。干预线落在第 25 格，
     所以「过没过线」用尺子量得出来。                                            */
  RENDER['pain-gauge'] = function (s) {
    var MAXP = 24, THRESH = 6, NOW = 9;
    var GOAL = NOW / MAXP * 100;              // 37.5
    var cx = 200, cy = 190, R0 = 104, A0 = -195, SW = 210;
    for (var k = 0; k < 100; k++) {
      var a = A0 + k / 100 * SW, inked = k < GOAL;
      var len = inked ? 13 + rnd(k + 1, 3) * 6 : 5 + rnd(k + 1, 7) * 2.5;
      var p1 = pol(cx, cy, R0, a), p2 = pol(cx, cy, R0 + len, a);
      el(s, 'line', {
        x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
        stroke: inked ? INK : L[5], 'stroke-width': inked ? 1 : .6,
        class: 'fade', style: 'animation-delay:' + (k * .01) + 's'
      });
    }
    [THRESH / MAXP * 100, 50, 75, 100].forEach(function (m) {
      var a = A0 + m / 100 * SW;
      var dp = pol(cx, cy, R0 - 7, a), tp = pol(cx, cy, R0 - 19, a);
      el(s, 'circle', { cx: dp[0], cy: dp[1], r: m < 50 ? 1.4 : 1, fill: m < 50 ? INK : '#B0AFA9', class: 'fade', style: 'animation-delay:.8s' });
      txt(s, {
        x: tp[0], y: tp[1] + 3, 'font-size': 7, 'font-weight': m < 50 ? 800 : 600,
        fill: m < 50 ? INK : FAINT, 'text-anchor': 'middle', class: 'fade', style: 'animation-delay:.85s'
      }, m < 50 ? '6 分' : Math.round(m / 100 * MAXP));
    });
    var aT = A0 + GOAL / 100 * SW, ep = pol(cx, cy, R0 + 20, aT);
    el(s, 'circle', { cx: ep[0], cy: ep[1], r: 2.6, fill: INK, class: 'pop', style: 'animation-delay:1.1s' });
    var big = txt(s, {
      x: cx, y: cy - 4, 'font-size': 34, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
      class: 'fade', style: 'animation-delay:1s'
    }, NOW);
    tip(big, 'Glasgow CMPS-SF —— ' + NOW + ' / ' + MAXP + ' 分，干预线 ' + THRESH + ' 分');
    txt(s, {
      x: cx, y: cy + 14, 'font-size': 8, 'font-weight': 600, fill: MUTED, 'text-anchor': 'middle',
      'letter-spacing': '.08em', class: 'fade', style: 'animation-delay:1.05s'
    }, '/ ' + MAXP + ' 分 · 干预线 ' + THRESH + ' 分');
    txt(s, {
      x: cx, y: cy + 34, 'font-size': 7.5, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
      class: 'fade', style: 'animation-delay:1.1s'
    }, '已越过 1.5 倍，需镇痛干预');
    txt(s, {
      x: 200, y: 300, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.2s'
    }, '一格 = 24 分制的 1% · 上墨 = 已计分 · 加粗刻度 = 干预线');
  };

  /* ── F12 Dumbbell Queue ──────────────────────────────────────────────────
     哑铃对比：空心点 = 区间下限，实心点 = 区间上限，两点之间串珠，
     一颗珠 = 0.1 个系数。极值不入图 —— 它会把 7 行全压扁。                       */
  RENDER['der-dumbbell'] = function (s) {
    var q = Q(), D = [];
    if (q && q.K_FACTORS) {
      var K = q.K_FACTORS;
      [['减重期', 'weightLoss', 0], ['增重期', 'weightGain', 1], ['老年期', 'senior', 2],
      ['绝育成犬', 'neuteredAdult', 3], ['未绝育成犬', 'intactAdult', 4],
      ['幼犬 4 月–1 岁', 'puppyOver4m', 5], ['幼犬 <4 月', 'puppyUnder4m', 6]].forEach(function (row) {
        var f = K[row[1]];
        if (f) D.push([row[0], f.lo, f.hi, row[2]]);
      });
    }
    if (!D.length) D = [['减重期', .8, 1, 0], ['增重期', 1.2, 1.4, 1], ['老年期', 1.2, 1.4, 2], ['绝育成犬', 1.4, 1.6, 3], ['未绝育成犬', 1.6, 1.8, 4], ['幼犬 4 月–1 岁', 2, 2.5, 5], ['幼犬 <4 月', 2.5, 3, 6]];
    D.sort(function (a, b) { return a[1] - b[1]; });
    var y0 = function (i) { return 56 + i * 36; }, X0 = 128, X1 = 360;
    var LO = 0.7, HI = 3.2, mapX = function (v) { return X0 + (v - LO) / (HI - LO) * (X1 - X0); };
    [[1, '1'], [2, '2'], [3, '3']].forEach(function (row) {
      var x = mapX(row[0]);
      el(s, 'line', { x1: x, y1: 44, x2: x, y2: 288, stroke: L[6], 'stroke-width': .7, class: 'fade' });
      txt(s, { x: x, y: 294, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle', class: 'fade' }, row[1]);
    });
    txt(s, { x: 360, y: 294, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'start', class: 'fade' }, 'K 系数');
    D.forEach(function (row, i) {
      var name = row[0], was = row[1], now = row[2], y = y0(i);
      var xa = mapX(was), xb = mapX(now);
      txt(s, {
        x: 112, y: y + 3, 'font-size': 7.5, 'font-weight': 700, fill: '#6A6963', 'text-anchor': 'end',
        'letter-spacing': '.04em', class: 'fade', style: 'animation-delay:' + (i * .08) + 's'
      }, name);
      el(s, 'line', {
        x1: xa, y1: y, x2: xb, y2: y, stroke: '#DEDDD6', 'stroke-width': .8,
        class: 'fade', style: 'animation-delay:' + (i * .08) + 's'
      });
      var n = Math.round((now - was) / 0.1);
      for (var k = 0; k < n; k++) {
        var t = (k + .5) / n, x = xa + t * (xb - xa), yy = y + (rnd(k + 1, i + 3) - .5) * 2.6;
        el(s, 'circle', {
          cx: x, cy: yy, r: 1.5 + rnd(k + 2, i + 4) * .9, fill: MUTED, opacity: .85,
          class: 'pop', style: 'animation-delay:' + (.3 + i * .08 + k * .04) + 's'
        });
      }
      el(s, 'circle', { cx: xa, cy: y, r: 4.2, fill: PAPER, stroke: INK, 'stroke-width': 1.3, class: 'pop', style: 'animation-delay:' + (.2 + i * .08) + 's' });
      var after = el(s, 'circle', { cx: xb, cy: y, r: 4.6, fill: INK, class: 'pop', style: 'animation-delay:' + (.6 + i * .08) + 's' });
      tip(after, name + ' — K ' + was + ' ～ ' + now + '，即 RER 的 ' + was + ' ～ ' + now + ' 倍');
      txt(s, {
        x: xa - 9, y: y - 8, 'font-size': 8.5, 'font-weight': 700, fill: FAINT, 'text-anchor': 'end',
        class: 'fade', style: 'animation-delay:' + (.3 + i * .08) + 's'
      }, was);
      txt(s, {
        x: xb + 9, y: y - 8, 'font-size': 10, 'font-weight': 800, fill: INK,
        class: 'fade', style: 'animation-delay:' + (.7 + i * .08) + 's'
      }, now);
    });
    txt(s, {
      x: 200, y: 312, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1s'
    }, '一颗串珠 = 0.1 个系数 · 空心 = 下限 · 实心 = 上限 · 工作犬 5–11 不入图，它会把刻度压扁');
  };

  /* ── F15 Tick Box ────────────────────────────────────────────────────────
     箱线图的 Basics 皮：发丝须线 + 胶囊箱体（四分位），纸色横档 = 中位数，
     空心点 = 离群值。明度按中位快慢排：呼吸越慢越黑。                            */
  RENDER['rr-box'] = function (s) {
    var G = [
      ['安静睡眠', [8, 10, 12, 14, 17], []],
      ['清醒静息', [11, 14, 17, 20, 25], []],
      ['活动后', [16, 20, 26, 34, 48], [52, 55]],
      ['30 °C 环境', [18, 23, 30, 38, 52], [58]]
    ];
    var SHADE = [INK, L[1], MUTED, L[4]];
    var TOP = 46, BASE = 258, MAXH = 60;
    var mapY = function (v) { return BASE - v / MAXH * (BASE - TOP); };
    [0, 15, 30, 45, 60].forEach(function (h2) {
      el(s, 'line', {
        x1: 38, y1: mapY(h2), x2: 378, y2: mapY(h2),
        stroke: h2 === 30 ? '#B0AFA9' : L[6], 'stroke-width': .8,
        'stroke-dasharray': h2 === 30 ? '2 3' : null, class: 'fade', style: 'animation-delay:' + (h2 * .008) + 's'
      });
      txt(s, {
        x: 32, y: mapY(h2) + 3, 'font-size': 7.5, 'font-weight': 600, fill: MUTED, 'text-anchor': 'end',
        class: 'fade', style: 'animation-delay:' + (h2 * .008) + 's'
      }, h2);
    });
    txt(s, {
      x: 374, y: mapY(30) - 6, 'font-size': 6.8, 'font-weight': 800, fill: MUTED, 'text-anchor': 'end',
      'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:.9s'
    }, '30 = 连续 3 日即就医');
    G.forEach(function (row, g) {
      var name = row[0], f = row[1], outs = row[2];
      var x = 78 + g * 84, BW = 24;
      el(s, 'line', {
        x1: x, y1: mapY(f[0]), x2: x, y2: mapY(f[4]), stroke: MUTED, 'stroke-width': .8,
        pathLength: 1, class: 'draw', style: 'animation-delay:' + (g * .12) + 's;animation-duration:.6s'
      });
      [f[0], f[4]].forEach(function (vv) {
        el(s, 'line', { x1: x - 7, y1: mapY(vv), x2: x + 7, y2: mapY(vv), stroke: MUTED, 'stroke-width': 1, class: 'fade', style: 'animation-delay:' + (.2 + g * .12) + 's' });
      });
      var box = el(s, 'rect', {
        x: x - BW / 2, y: mapY(f[3]), width: BW, height: mapY(f[1]) - mapY(f[3]), rx: 9,
        fill: SHADE[g], class: 'pop', style: 'animation-delay:' + (.15 + g * .12) + 's'
      });
      tip(box, name + ' — 中间一半落在 ' + f[1] + '–' + f[3] + ' 次/分');
      el(s, 'line', {
        x1: x - BW / 2 + 3, y1: mapY(f[2]), x2: x + BW / 2 - 3, y2: mapY(f[2]),
        stroke: PAPER, 'stroke-width': 2.2, class: 'fade', style: 'animation-delay:' + (.5 + g * .12) + 's'
      });
      txt(s, {
        x: x + BW / 2 + 6, y: mapY(f[2]) + 3, 'font-size': 9.5, 'font-weight': 800, fill: INK,
        class: 'fade', style: 'animation-delay:' + (.6 + g * .12) + 's'
      }, f[2]);
      outs.forEach(function (o, k) {
        var d = el(s, 'circle', {
          cx: x + (rnd(k + 1, g + 3) - .5) * 8, cy: mapY(o), r: 2.6, fill: PAPER,
          stroke: '#6A6963', 'stroke-width': 1.1, class: 'pop', style: 'animation-delay:' + (.7 + g * .12 + k * .06) + 's'
        });
        tip(d, name + ' 离群值 — ' + o + ' 次/分');
      });
      txt(s, {
        x: x, y: BASE + 18, 'font-size': 7.5, 'font-weight': 700, fill: MUTED, 'text-anchor': 'middle',
        'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:' + (g * .12) + 's'
      }, name);
    });
    txt(s, {
      x: 200, y: 306, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.2s'
    }, '箱体 = 中间一半 · 纸色横档 = 中位数 · 空心 = 离群值 · 越黑 = 呼吸越慢 · C 级示意');
  };

  /* ── F17 Candlestick ─────────────────────────────────────────────────────
     K 线的 Mono 化：实心墨 = 收跌，空心 = 收涨，影线是全幅发丝。
     这里不用涨跌色 —— 体重不是股价，而且本项目的色彩系统只有灰阶。              */
  RENDER['weight-candle'] = function (s) {
    var N = 30, DAYS = [], px = 14.5, d;
    for (d = 0; d < N; d++) {
      var drift = d < 9 ? .014 : d < 17 ? -.022 : .007;
      var open = px;
      var close = Math.max(13.95, open + drift + (rnd(d + 1, 3) - .5) * .30);
      var hi = Math.max(open, close) + rnd(d + 2, 7) * .10;
      var lo = Math.min(open, close) - rnd(d + 3, 11) * .10;
      DAYS.push([open, close, hi, lo]); px = close;
    }
    var X0 = 48, PW = 11, BASE = 258, TOP = 46;
    var vmin = 13.6, vmax = 15.1;
    var mapY = function (v) { return BASE - (v - vmin) / (vmax - vmin) * (BASE - TOP); };
    var x = function (dd) { return X0 + dd * PW + PW / 2; };
    [13.6, 14.0, 14.5, 15.0].forEach(function (v) {
      el(s, 'line', { x1: X0 - 4, y1: mapY(v), x2: X0 + N * PW + 4, y2: mapY(v), stroke: L[6], 'stroke-width': .8, class: 'fade' });
      txt(s, { x: X0 - 8, y: mapY(v) + 3, 'font-size': 7.5, 'font-weight': 600, fill: MUTED, 'text-anchor': 'end', class: 'fade' }, v.toFixed(1));
    });
    // −5% 阈值线：规则看的是这一条，不是每天的波动
    var thr = DOG.weightKg * 0.95;
    el(s, 'line', {
      x1: X0 - 4, y1: mapY(thr), x2: X0 + N * PW + 4, y2: mapY(thr), stroke: INK,
      'stroke-width': .9, 'stroke-dasharray': '3 3', class: 'fade', style: 'animation-delay:.9s'
    });
    txt(s, {
      x: X0 + N * PW + 2, y: mapY(thr) - 5, 'font-size': 6.8, 'font-weight': 800, fill: INK,
      'text-anchor': 'end', 'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:.95s'
    }, '−5% = ' + thr.toFixed(2) + ' kg');
    var hiD = 0, loD = 0;
    DAYS.forEach(function (dd, i2) { if (dd[2] > DAYS[hiD][2]) hiD = i2; if (dd[3] < DAYS[loD][3]) loD = i2; });
    DAYS.forEach(function (row, i2) {
      var o = row[0], c = row[1], h2 = row[2], l = row[3];
      var cx = x(i2), up = c >= o;
      var yT = mapY(Math.max(o, c)), yB = mapY(Math.min(o, c));
      el(s, 'line', { x1: cx, y1: mapY(h2), x2: cx, y2: mapY(l), stroke: '#6A6963', 'stroke-width': .7, class: 'fade', style: 'animation-delay:' + (i2 * .03) + 's' });
      var body = el(s, 'rect', Object.assign({
        x: cx - 3.4, y: yT, width: 6.8, height: Math.max(2.5, yB - yT), rx: 3,
        class: 'fade', style: 'animation-delay:' + (.05 + i2 * .03) + 's'
      }, up ? { fill: PAPER, stroke: INK, 'stroke-width': 1.1 } : { fill: INK }));
      tip(body, '第 ' + (i2 + 1) + ' 日 — 晨 ' + o.toFixed(2) + ' / 晚 ' + c.toFixed(2) + ' / 高 ' + h2.toFixed(2) + ' / 低 ' + l.toFixed(2) + ' kg');
      if (i2 === hiD) txt(s, {
        x: cx, y: mapY(h2) - 7, 'font-size': 8, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:1s', class: 'fade'
      }, h2.toFixed(2));
      if (i2 === loD) txt(s, {
        x: cx, y: mapY(l) + 14, 'font-size': 8, 'font-weight': 800, fill: '#6A6963', 'text-anchor': 'middle',
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:1s', class: 'fade'
      }, l.toFixed(2));
    });
    el(s, 'line', { x1: X0 - 4, y1: BASE + 8, x2: X0 + N * PW + 4, y2: BASE + 8, stroke: GRID, 'stroke-width': .8, class: 'fade' });
    for (d = 0; d < N; d++) el(s, 'line', {
      x1: x(d), y1: BASE + 8, x2: x(d), y2: BASE + 8 - (d % 5 === 0 ? 6 : 3), stroke: L[5], 'stroke-width': .6,
      class: 'fade', style: 'animation-delay:' + (d * .008) + 's'
    });
    ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].forEach(function (w, k) {
      txt(s, { x: x(k * 5), y: BASE + 21, 'font-size': 7, 'font-weight': 600, fill: MUTED, 'text-anchor': 'middle', 'letter-spacing': '.06em', class: 'fade' }, w);
    });
    txt(s, {
      x: 200, y: 306, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.1s'
    }, '墨水柱 = 收跌 · 空心 = 收涨 · 影线 = 当日全幅 · 一格 = 0.1 kg · C 级示意');
  };

  /* ── L2 Dot Cascade（暗卡） ───────────────────────────────────────────────
     排名比较的可数版本：一列一行为，一点 = 10 次。柱子沿一条对角线铺开，
     所以排名自己就长成了一道斜线。唯一一张暗卡。                                */
  RENDER['daily-cascade'] = function (s) {
    var DK = DARK;
    var CAUSE = ['嗅闻停顿', '甩身 / 伸展', '看向主人', '吠叫', '叼起玩具', '讨摸'];
    var COUNT = [240, 120, 90, 46, 32, 26];
    var x = function (i) { return 74 + i * 56; }, base = function (i) { return 272 - i * 8; };
    el(s, 'line', {
      x1: x(0) - 10, y1: base(0) + 4, x2: x(5) + 10, y2: base(5) + 4,
      stroke: DK.ladder[6], 'stroke-width': 1, 'stroke-dasharray': '2 4', class: 'fade'
    });
    CAUSE.forEach(function (name, i) {
      var n = Math.ceil(COUNT[i] / 10), bx = x(i), by = base(i);
      for (var k = 0; k < n - 1; k++) el(s, 'circle', {
        cx: bx, cy: by - 12 - k * 8.8, r: 2.2, fill: DK.ladder[3], opacity: .9,
        class: 'pop', style: 'animation-delay:' + (i * .06 + k * .03) + 's'
      });
      var topY = by - 12 - (n - 1) * 8.8;
      var top = el(s, 'circle', { cx: bx, cy: topY, r: 4.6, fill: DK.ink, class: 'pop', style: 'animation-delay:' + (i * .06 + n * .03) + 's' });
      tip(top, name + ' — 每日约 ' + COUNT[i] + ' 次（' + n + ' 点，一点 = 10 次）');
      txt(s, {
        x: bx, y: topY - 10, 'font-size': 9, 'font-weight': 700, fill: DK.ink, 'text-anchor': 'middle',
        class: 'fade', style: 'animation-delay:' + (.2 + i * .06) + 's'
      }, COUNT[i]);
      txt(s, {
        x: bx, y: by + 12, 'font-size': 6.5, 'font-weight': 600, fill: DK.ladder[5], 'text-anchor': 'end',
        transform: 'rotate(-90 ' + bx + ' ' + by + 12 + ')', class: 'fade',
        style: 'animation-delay:' + (.1 + i * .06) + 's'
      }, name);
    });
    txt(s, {
      x: 200, y: 308, 'font-size': 7, 'font-weight': 600, fill: DK.faint, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.1s'
    }, '一点 = 10 次 · 计数来自一天的行为抽样 · C 级示意数据');
  };

  /* ── L7 Brand Spectrum ───────────────────────────────────────────────────
     双极量表：每行两端都是合法位置，所以「中值」在这里没有特殊含义。
     大点 = 这只狗，小点 = 三个参照群体。线索色带把四行串成一条脊。                */
  RENDER['trait-spectrum'] = function (s) {
    var ROWS = [['独处无妨', '不能独处'], ['活跃好动', '沉稳少动'], ['对狗友好', '只认主人'], ['服从指令', '自行其是']];
    var US = [.72, .30, .45, .66];
    var REF = [[.55, .62, .48], [.42, .55, .38], [.50, .46, .58], [.58, .50, .44]];
    var X0 = 128, X1 = 352, Y = function (i) { return 58 + i * 60; };
    var px = function (t) { return X0 + t * (X1 - X0); };
    var d = 'M' + px(US[0]) + ' ' + Y(0);
    for (var i = 1; i < 4; i++) d += ' C' + px(US[i - 1]) + ' ' + (Y(i - 1) + 30) + ' ' + px(US[i]) + ' ' + (Y(i) - 30) + ' ' + px(US[i]) + ' ' + Y(i);
    el(s, 'path', {
      d: d, fill: 'none', stroke: PAPER, 'stroke-width': 30, 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', opacity: .9, pathLength: 1, class: 'draw', style: 'animation-duration:1.4s'
    });
    ROWS.forEach(function (row, i) {
      var y = Y(i);
      el(s, 'line', { x1: X0, y1: y, x2: X1, y2: y, stroke: L[4], 'stroke-width': 1, class: 'fade', style: 'animation-delay:' + (i * .08) + 's' });
      [X0, X1].forEach(function (x) {
        el(s, 'line', { x1: x, y1: y - 4, x2: x, y2: y + 4, stroke: L[4], 'stroke-width': 1, class: 'fade', style: 'animation-delay:' + (i * .08) + 's' });
      });
      txt(s, {
        x: X0 - 12, y: y + 3, 'font-size': 8, 'font-weight': 600, fill: '#6A6963', 'text-anchor': 'end',
        class: 'fade', style: 'animation-delay:' + (i * .08) + 's'
      }, row[0]);
      txt(s, {
        x: X1 + 12, y: y + 3, 'font-size': 8, 'font-weight': 600, fill: '#6A6963',
        class: 'fade', style: 'animation-delay:' + (i * .08) + 's'
      }, row[1]);
      REF[i].forEach(function (t, k) {
        var c = el(s, 'circle', {
          cx: px(t), cy: y, r: 3.2, fill: MUTED, class: 'pop',
          style: 'animation-delay:' + (.3 + i * .1 + k * .05) + 's'
        });
        var who = ['品种均值', '同龄均值', '收容犬均值'][k];
        tip(c, who + ' — 偏向「' + row[1] + '」' + Math.round(t * 100) + '%');
      });
      var us = el(s, 'circle', { cx: px(US[i]), cy: y, r: 8, fill: INK, class: 'pop', style: 'animation-delay:' + (.5 + i * .1) + 's' });
      tip(us, '这只狗 — 偏向「' + row[1] + '」' + Math.round(US[i] * 100) + '%');
    });
    txt(s, {
      x: X0, y: 292, 'font-size': 7.5, 'font-weight': 600, fill: FAINT, 'letter-spacing': '.1em',
      class: 'fade', style: 'animation-delay:.9s'
    }, '● 这只狗   ● 品种均值 · 同龄均值 · 收容犬均值');
  };

  /* ── L10 Radial Patchwork ────────────────────────────────────────────────
     逐事件叠加：每次吠叫一个楔，角度 = 时刻，长度 = 强度。
     透明度本身编码密度 —— 那是数据，不是装饰。                                  */
  RENDER['bark-patchwork'] = function (s) {
    var CX = 200, CY = 150, N = 46;
    for (var h = 0; h < 96; h++) {
      var a = -90 + h * 3.75, p1 = pol(CX, CY, 132, a), p2 = pol(CX, CY, h % 4 === 0 ? 138 : 135, a);
      el(s, 'line', {
        x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: FAINT,
        'stroke-width': h % 4 === 0 ? 1 : .5, class: 'fade', style: 'animation-delay:' + (h * .006) + 's'
      });
    }
    [0, 6, 12, 18].forEach(function (hh) {
      var p = pol(CX, CY, 147, -90 + hh * 15);
      txt(s, {
        x: p[0], y: p[1] + 3, 'font-size': 8, 'font-weight': 700, fill: MUTED, 'text-anchor': 'middle', class: 'fade'
      }, String(hh).padStart(2, '0'));
    });
    var wedges = [];
    for (var i = 0; i < N; i++) {
      var peak = rnd(i + 1, 2) > .5 ? 8 : 18;          // 晨昏两簇
      var hour = (peak + (rnd(i + 1, 3) - .5) * 7 + 24) % 24;
      var a0 = -90 + hour * 15;
      var sw = 10 + rnd(i + 1, 4) * 34;                 // 楔的口径：手绘感抖动，不承载数据
      var r1 = 32 + rnd(i + 1, 5) * 96;                 // 长度 = 强度（本图唯一承载数据的维度）
      wedges.push([a0, sw, r1, hour, i]);
    }
    wedges.forEach(function (row) {
      var a0 = row[0], sw = row[1], r1 = row[2], hour = row[3], i2 = row[4];
      var w = el(s, 'path', {
        d: sect(CX, CY, 16, r1, a0, a0 + sw), fill: INK,
        'fill-opacity': .07 + rnd(i2 + 1, 6) * .09, class: 'fade',
        style: 'animation-delay:' + (.2 + i2 * .02) + 's'
      });
      tip(w, '第 ' + (i2 + 1) + ' 次吠叫 — ' + String(Math.floor(hour)).padStart(2, '0') + ':' + String(Math.floor(hour % 1 * 60)).padStart(2, '0') + ' · 强度 ' + Math.round((r1 - 32) / 96 * 100));
    });
    // 描边 = 强度最大的三次（即投诉级）
    wedges.slice().sort(function (a, b) { return b[2] - a[2]; }).slice(0, 3).forEach(function (row, k) {
      var w = el(s, 'path', {
        d: sect(CX, CY, 16, row[2], row[0], row[0] + row[1]), fill: 'none', stroke: INK,
        'stroke-width': 1.1, class: 'fade', style: 'animation-delay:' + (1.2 + k * .15) + 's'
      });
      tip(w, '第 ' + (row[4] + 1) + ' 次 — 强度最大，属于投诉级');
    });
    el(s, 'circle', { cx: CX, cy: CY, r: 3, fill: INK, class: 'pop', style: 'animation-delay:1.3s' });
    txt(s, {
      x: CX, y: 316, 'font-size': 7.5, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.4s'
    }, '描边 = 强度最大的三次（投诉级）· C 级示意数据');
  };

  /* ── L13 Hourglass Stream ────────────────────────────────────────────────
     漏斗：每一段的宽度 = 该阶段还剩下多少，发丝从上往下漏。
     左侧写的是转化率，不是人数 —— 人靠宽度读，比例靠数字读。                      */
  RENDER['care-funnel'] = function (s) {
    var STAGE = [['察觉到不对', 1000], ['能说清', 780], ['决定就诊', 520], ['拿到诊断', 240], ['开始治疗', 190]];
    var CXm = 185, sy = function (k) { return 34 + k * 64; }, w = function (c) { return c / 1000 * 290; };
    STAGE.forEach(function (row, k) {
      var name = row[0], c = row[1], y = sy(k), hw = w(c) / 2;
      var n = Math.round(c / 20);
      for (var t = 0; t < n; t++) {
        var x = CXm - hw + (t + .5) / n * hw * 2 + (rnd(t + 1, k + 3) - .5) * 3;
        el(s, 'line', {
          x1: x, y1: y - 6, x2: x, y2: y + 6, stroke: INK, 'stroke-width': .8,
          opacity: .45 + rnd(t + 2, k + 5) * .5, class: 'fade', style: 'animation-delay:' + (k * .12 + t * .006) + 's'
        });
      }
      if (k < 4) {
        var hw1 = w(STAGE[k + 1][1]) / 2;
        for (var t2 = 0; t2 < 26; t2++) {
          var xt = CXm + (rnd(t2 + 1, k * 7 + 1) - .5) * 2 * hw * .94;
          var xb = CXm + (rnd(t2 + 3, k * 7 + 5) - .5) * 2 * hw1 * .94;
          el(s, 'path', {
            d: 'M' + xt + ' ' + (y + 8) + ' C' + xt + ' ' + (y + 34) + ' ' + xb + ' ' + (sy(k + 1) - 34) + ' ' + xb + ' ' + (sy(k + 1) - 8),
            fill: 'none', stroke: L[4], 'stroke-width': .5, opacity: .3, pathLength: 1,
            class: 'draw', style: 'animation-delay:' + (.2 + k * .15 + t2 * .01) + 's;animation-duration:.8s'
          });
        }
        var pct = Math.round(STAGE[k + 1][1] / c * 100);
        txt(s, {
          x: 26, y: (y + sy(k + 1)) / 2 + 3, 'font-size': 8.5, 'font-weight': 800, fill: MUTED,
          class: 'fade', style: 'animation-delay:' + (.5 + k * .15) + 's'
        }, pct + '%');
        txt(s, {
          x: 26, y: (y + sy(k + 1)) / 2 + 13, 'font-size': 6.5, 'font-weight': 600, fill: FAINT,
          'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:' + (.5 + k * .15) + 's'
        }, '通过');
      }
      el(s, 'line', {
        x1: CXm + hw + 6, y1: y, x2: 340, y2: y, stroke: GRID, 'stroke-width': .8,
        class: 'fade', style: 'animation-delay:' + (.3 + k * .12) + 's'
      });
      txt(s, {
        x: 344, y: y - 1, 'font-size': 7.5, 'font-weight': 700, fill: L[1], 'letter-spacing': '.06em',
        class: 'fade', style: 'animation-delay:' + (.35 + k * .12) + 's'
      }, name);
      var v = txt(s, {
        x: 344, y: y + 10, 'font-size': 9.5, 'font-weight': 800, fill: INK,
        class: 'fade', style: 'animation-delay:' + (.4 + k * .12) + 's'
      }, c.toLocaleString());
      tip(v, name + ' — ' + c + ' 例（每千次「察觉到不对」计）');
    });
    txt(s, {
      x: CXm, y: 324, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.2s'
    }, '一根发丝 ≈ 20 例 · 宽度 = 该阶段剩下多少 · 左侧 = 通过率 · C 级示意数据');
  };

  /* ── L14 Hundred Field ───────────────────────────────────────────────────
     小数据的单位分解：五个权重加起来正好 100，于是一个点 = 总分的 1%。
     密度来自单位，不来自记录数。                                                */
  RENDER['dns-hundred'] = function (s) {
    var q = Q(), SEG = [], wts = {};
    if (q && q.DNS_DIMS) q.DNS_DIMS.forEach(function (d) { wts[d.key] = d.weight; });
    var defs = [
      ['运动', 'exercise', 25], ['嗅闻', 'sniff', 20], ['社交 / 陪伴', 'social', 20],
      ['休息', 'rest', 20], ['认知 / 咀嚼', 'cognitive', 15]
    ];
    var SH = [INK, '#55554F', '#6A6963', MUTED, L[4]];
    defs.forEach(function (d, i) {
      var pct = wts[d[1]] != null ? Math.round(wts[d[1]] * 100) : d[2];
      SEG.push([d[0], pct, SH[i]]);
    });
    var POS = [[116, 112], [286, 104], [200, 250], [326, 226], [72, 232]];
    [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [0, 4]].forEach(function (p, k) {
      el(s, 'line', {
        x1: POS[p[0]][0], y1: POS[p[0]][1], x2: POS[p[1]][0], y2: POS[p[1]][1],
        stroke: GRID, 'stroke-width': .7, 'stroke-dasharray': '2 5',
        class: 'fade', style: 'animation-delay:' + (.9 + k * .1) + 's'
      });
    });
    SEG.forEach(function (row, ci) {
      var name = row[0], v = row[1], shade = row[2], cx = POS[ci][0], cy = POS[ci][1];
      var edge = 0;
      for (var k = 0; k < v; k++) {
        var a = k * 137.508 + ci * 55;
        var rr = 4 + Math.sqrt(k) * 5.9 + rnd(k + 1, ci + 2) * 3;
        edge = Math.max(edge, rr);
        var p = pol(cx, cy, rr, a);
        if (k % 5 === 0) el(s, 'line', {
          x1: cx, y1: cy, x2: p[0], y2: p[1], stroke: L[5], 'stroke-width': .6,
          class: 'fade', style: 'animation-delay:' + (ci * .14 + k * .012) + 's'
        });
        var dot = el(s, 'circle', {
          cx: p[0], cy: p[1], r: 1.5 + rnd(k + 2, ci + 3) * 1.7, fill: shade, opacity: .9,
          class: 'pop', style: 'animation-delay:' + (ci * .14 + k * .012) + 's'
        });
        tip(dot, name + ' — 占总分的 1 / 100（权重 ' + v + '%）');
      }
      el(s, 'circle', { cx: cx, cy: cy, r: 2.4, fill: INK, class: 'pop', style: 'animation-delay:' + (ci * .14) + 's' });
      txt(s, {
        x: cx, y: cy + edge + 13, 'font-size': 8, 'font-weight': 800, fill: INK, 'text-anchor': 'middle',
        'letter-spacing': '.06em',
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:' + (.5 + ci * .12) + 's',
        class: 'fade'
      }, name + ' · ' + v);
    });
    txt(s, {
      x: 200, y: 314, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.3s'
    }, '一个点 = 总分的 1% · 25 + 20 + 20 + 20 + 15 = 100 · 簇的大小就是权重');
  };

  /* ── L15 Ballot Tally ────────────────────────────────────────────────────
     多选题（各项独立 0–100）：每一行都是 100 个人站成一排，
     选了它的上墨。行与行之间不可比大小之外的东西 —— 加总不等于 100。             */
  RENDER['fear-tally'] = function (s) {
    var ASK = [['打雷 / 烟花', 51], ['独自在家', 46], ['吸尘器 / 家电', 41], ['剪指甲 / 洗澡', 33]];
    ASK.forEach(function (row, i) {
      var name = row[0], v = row[1], base = 74 + i * 58;
      txt(s, {
        x: 28, y: base - 26, 'font-size': 7.5, 'font-weight': 700, fill: '#6A6963',
        'letter-spacing': '.06em', class: 'fade', style: 'animation-delay:' + (i * .1) + 's'
      }, name);
      el(s, 'line', {
        x1: 28, y1: base, x2: 372, y2: base, stroke: GRID, 'stroke-width': .6,
        class: 'fade', style: 'animation-delay:' + (i * .1) + 's'
      });
      for (var k = 0; k < 100; k++) {
        var x = 28 + k * 3.44, picked = k < v;
        var h = picked ? 12 + rnd(k + 1, i + 2) * 5 : 4.5 + rnd(k + 1, i + 5) * 2;
        el(s, 'line', {
          x1: x, y1: base, x2: x, y2: base - h,
          stroke: picked ? INK : L[5], 'stroke-width': picked ? .9 : .55,
          class: 'fade', style: 'animation-delay:' + (i * .1 + k * .006) + 's'
        });
        if (k % 10 === 0) el(s, 'circle', {
          cx: x, cy: base + 4.5, r: .8, fill: FAINT, class: 'fade',
          style: 'animation-delay:' + (i * .1 + k * .006) + 's'
        });
      }
      var lab = txt(s, {
        x: 28 + (v - 1) * 3.44 + 9, y: base - 11, 'font-size': 11, 'font-weight': 800, fill: INK,
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:' + (.5 + i * .1) + 's',
        class: 'fade'
      }, v);
      tip(lab, '100 只里有 ' + v + ' 只选了它 —— 可多选，所以不能加总看');
    });
    txt(s, {
      x: 200, y: 310, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.1s'
    }, '一根 tick = 一百只里的一只 · 每第十根带点标 · C 级：来自通行观察，非对照实验');
  };

  /* ── L17 Calendar Heat（通栏） ───────────────────────────────────────────
     日历热力：一格一天，52 周 × 7 天，点面积 = 当天的外出次数。
     两个峰不是勤快，是地面温度允许 —— 盛夏与严冬各自塌下去。                      */
  RENDER['walk-calendar'] = function (s) {
    var MON = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];
    var X0 = 60, Y0 = 44, P = 14.6;
    var val = function (w, d) {
      if (d >= 5) return rnd(w * 7 + d + 1, 3) > .75 ? 1 : 0;
      var spring = Math.exp(-Math.pow(w - 14, 2) / 90);
      var autumn = Math.exp(-Math.pow(w - 40, 2) / 80);
      var heat = Math.exp(-Math.pow(w - 27, 2) / 40);    // 盛夏，地面烫
      var cold = Math.exp(-Math.pow(w - 50, 2) / 30);    // 严冬
      var raw = 1 + 2.2 * (spring + autumn) - 1.1 * heat - 0.9 * cold + rnd(w * 7 + d + 1, d + 2) * 1.4;
      return Math.max(0, Math.round(raw));
    };
    var max = 0, mw = 0, md = 0, w, d;
    for (w = 0; w < 52; w++) for (d = 0; d < 7; d++) { var t = val(w, d); if (t > max) { max = t; mw = w; md = d; } }
    ['周一', '周三', '周五', '周日'].forEach(function (lab, k) {
      txt(s, {
        x: X0 - 10, y: Y0 + [0, 2, 4, 6][k] * P + 3, 'font-size': 6.5, 'font-weight': 700, fill: MUTED,
        'text-anchor': 'end', class: 'fade', style: 'animation-delay:' + (k * .04) + 's'
      }, lab);
    });
    MON.forEach(function (m, k) {
      var x = X0 + Math.round(k * 52 / 12) * P;
      txt(s, {
        x: x, y: Y0 - 16, 'font-size': 7, 'font-weight': 700, fill: MUTED, 'letter-spacing': '.08em',
        class: 'fade', style: 'animation-delay:' + (k * .03) + 's'
      }, m);
      el(s, 'line', { x1: x, y1: Y0 - 11, x2: x, y2: Y0 - 5, stroke: FAINT, 'stroke-width': .7, class: 'fade', style: 'animation-delay:' + (k * .03) + 's' });
    });
    for (w = 0; w < 52; w++) for (d = 0; d < 7; d++) {
      var x2 = X0 + w * P, y2 = Y0 + d * P, tv = val(w, d), delay = (w * .012 + d * .004);
      if (!tv) {
        el(s, 'circle', { cx: x2, cy: y2, r: .75, fill: L[6], class: 'pop', style: 'animation-delay:' + delay + 's' });
        continue;
      }
      var r = 1.1 + Math.sqrt(tv) * 1.75;
      var dot = el(s, 'circle', {
        cx: x2, cy: y2, r: r,
        fill: tv > max * .66 ? INK : tv > max * .33 ? '#6A6963' : '#B0AFA9',
        class: 'pop', style: 'animation-delay:' + delay + 's'
      });
      tip(dot, '第 ' + (w + 1) + ' 周 ' + ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][d] + ' — 外出 ' + tv + ' 次');
    }
    var px = X0 + mw * P, py = Y0 + md * P, pr = 1.1 + Math.sqrt(max) * 1.75;
    el(s, 'circle', {
      cx: px, cy: py, r: pr + 3.6, fill: 'none', stroke: INK, 'stroke-width': 1,
      'stroke-dasharray': '2 3', class: 'fade', style: 'animation-delay:1s'
    });
    var dir = (mw > 34) ? -1 : 1;
    el(s, 'path', {
      d: 'M' + (px + dir * (pr + 6)) + ' ' + (py + 6) + ' C' + (px + dir * 34) + ' ' + (py + 28) + ' ' + (px + dir * 52) + ' ' + (py + 34) + ' ' + (px + dir * 68) + ' ' + (py + 34),
      fill: 'none', stroke: L[4], 'stroke-width': .7, class: 'fade', style: 'animation-delay:1.1s'
    });
    txt(s, {
      x: px + dir * 74, y: py + 37, 'font-size': 7, fill: '#6A6963', 'font-style': 'italic',
      'text-anchor': dir > 0 ? 'start' : 'end', class: 'fade', style: 'animation-delay:1.15s'
    }, '全年最多的一天 —— ' + max + ' 次');
    txt(s, {
      x: 420, y: 182, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.2s'
    }, '一个点 = 一天 · 点面积 = 当日外出次数 · 小点 = 没出门 · 两个峰在 4–5 月与 10 月，盛夏与严冬各自塌下去');
  };

  /* ── L20 Parallel Coordinates ────────────────────────────────────────────
     多维记录对比：一条发丝线 = 一个表情状态走过四根轴。
     虚线是健康基线 —— SICK 与 UNKNOWN 与它逐位相同，所以画不出第二条线。         */
  RENDER['expr-parallel'] = function (s) {
    var FB = {
      BASE: [.25, 1, 0, 0], ATTENTIVE: [.78, 1, 0, .38], GAZE: [.45, .95, .08, .60],
      JOY: [.62, .72, .60, .30], APPEASEMENT: [0, .62, .18, .22], BEG: [.45, 1.08, .12, .95],
      ALERT: [1, .78, 0, .05], CURIOUS: [.85, 1, .04, .28], STRESS: [0, 1.02, .45, .15],
      GUILTY: [.1, .68, .05, .78], SLEEP: [0, .06, .10, 0], ZOOMIES: [.92, 1.15, .75, .40],
      PAIN: [0, .42, .12, -.60], SICK: [.25, 1, 0, 0], UNKNOWN: [.25, 1, 0, 0]
    };
    var x4 = X(), ORDER = [], BASEV = FB.BASE.slice();
    if (x4 && x4.STATE_IDS && x4.stateParams) {
      BASEV = ['earPerk', 'eyeOpen', 'mouthOpen', 'browInner'].map(function (k) { return x4.BASE[k]; });
      x4.STATE_IDS.forEach(function (id) {
        var p = x4.stateParams(id);
        ORDER.push([id, [p.earPerk, p.eyeOpen, p.mouthOpen, p.browInner]]);
      });
    } else {
      ['ATTENTIVE', 'GAZE', 'JOY', 'APPEASEMENT', 'BEG', 'ALERT', 'CURIOUS', 'STRESS', 'GUILTY', 'SLEEP', 'ZOOMIES', 'PAIN', 'SICK', 'UNKNOWN'].forEach(function (id) {
        ORDER.push([id, FB[id].slice()]);
      });
    }
    var DIMS = [['耳位', 0, 1], ['睁眼度', 0, 1.4], ['张口', 0, 1], ['内侧眉肌 AU101', -1, 1]];
    var AX = [64, 156, 248, 340], TOP = 66, BOT = 252;
    var mapY = function (di, v) { return BOT - (v - DIMS[di][1]) / (DIMS[di][2] - DIMS[di][1]) * (BOT - TOP); };
    var hero = ORDER.reduce(function (a, b) { return b[1][3] > a[1][3] ? b : a; }, ORDER[0]);
    DIMS.forEach(function (dim, di) {
      el(s, 'line', { x1: AX[di], y1: TOP - 8, x2: AX[di], y2: BOT + 8, stroke: L[4], 'stroke-width': 1, class: 'fade', style: 'animation-delay:' + (di * .06) + 's' });
      [TOP - 8, BOT + 8].forEach(function (yy) {
        el(s, 'line', { x1: AX[di] - 4, y1: yy, x2: AX[di] + 4, y2: yy, stroke: L[4], 'stroke-width': 1, class: 'fade', style: 'animation-delay:' + (di * .06) + 's' });
      });
      txt(s, {
        x: AX[di], y: TOP - 24, 'font-size': 7, 'font-weight': 800, fill: '#6A6963', 'text-anchor': 'middle',
        'letter-spacing': '.04em', class: 'fade', style: 'animation-delay:' + (di * .06) + 's'
      }, dim[0]);
      txt(s, { x: AX[di] + 8, y: TOP - 6, 'font-size': 6.5, 'font-weight': 600, fill: FAINT, class: 'fade', style: 'animation-delay:' + (.1 + di * .06) + 's' }, dim[2]);
      txt(s, { x: AX[di] + 8, y: BOT + 12, 'font-size': 6.5, 'font-weight': 600, fill: FAINT, class: 'fade', style: 'animation-delay:' + (.1 + di * .06) + 's' }, dim[1]);
    });
    var pathOf = function (vals) {
      var ys = vals.map(function (v, di) { return mapY(di, v); });
      var d2 = 'M' + AX[0] + ' ' + ys[0].toFixed(1);
      for (var k = 0; k < 3; k++) {
        var mx = (AX[k] + AX[k + 1]) / 2;
        d2 += ' C' + mx + ' ' + ys[k].toFixed(1) + ' ' + mx + ' ' + ys[k + 1].toFixed(1) + ' ' + AX[k + 1] + ' ' + ys[k + 1].toFixed(1);
      }
      return { d: d2, ys: ys };
    };
    // 基线先画：虚线，压在下面
    var bp = pathOf(BASEV);
    el(s, 'path', {
      d: bp.d, fill: 'none', stroke: INK, 'stroke-width': 1.3, 'stroke-dasharray': '3 3',
      opacity: .85, class: 'fade', style: 'animation-delay:.9s'
    });
    bp.ys.forEach(function (y, di) {
      el(s, 'circle', { cx: AX[di], cy: y, r: 2.2, fill: PAPER, stroke: INK, 'stroke-width': 1.1, class: 'fade', style: 'animation-delay:1s' });
    });
    ORDER.forEach(function (row, i) {
      var name = row[0], vals = row[1], isHero = (row === hero);
      var same = vals.join(',') === BASEV.join(',');
      var p = pathOf(vals);
      var ln = el(s, 'path', {
        d: p.d, fill: 'none',
        stroke: isHero ? INK : same ? L[4] : MUTED,
        'stroke-width': isHero ? 2 : same ? .55 : .65,
        opacity: isHero ? 1 : same ? .5 : .5 + rnd(i + 1, 5) * .3,
        pathLength: 1, class: 'draw', style: 'animation-delay:' + (.2 + i * .045) + 's;animation-duration:.8s'
      });
      tip(ln, name + ' — 耳位 ' + vals[0] + ' · 睁眼 ' + vals[1] + ' · 张口 ' + vals[2] + ' · 内侧眉肌 ' + vals[3] +
        (same ? '（与健康基线逐位相同）' : ''));
      p.ys.forEach(function (y, di) {
        el(s, 'circle', {
          cx: AX[di], cy: y, r: isHero ? 3 : 1.4, fill: isHero ? INK : MUTED,
          opacity: isHero ? 1 : .7, class: 'pop', style: 'animation-delay:' + (.3 + i * .045 + di * .04) + 's'
        });
      });
      if (isHero) txt(s, {
        x: AX[3] + 12, y: p.ys[3] + 3, 'font-size': 9, 'font-weight': 800, fill: INK,
        style: 'paint-order:stroke;stroke:' + PAPER + ';stroke-width:3px;animation-delay:1s', class: 'fade'
      }, name);
    });
    // SICK / UNKNOWN 的落点说明 —— 它们就在虚线上，画不出第二条线
    el(s, 'line', { x1: 200, y1: BOT + 8, x2: 200, y2: 272, stroke: FAINT, 'stroke-width': .7, class: 'fade', style: 'animation-delay:1.1s' });
    txt(s, {
      x: 196, y: 282, 'font-size': 7.5, 'font-weight': 600, fill: '#6A6963', 'text-anchor': 'end',
      class: 'fade', style: 'animation-delay:1.15s'
    }, '虚线 = 健康基线');
    txt(s, {
      x: 204, y: 282, 'font-size': 7.5, 'font-weight': 800, fill: INK,
      class: 'fade', style: 'animation-delay:1.15s'
    }, 'SICK 与 UNKNOWN 与它逐位重合');
    txt(s, {
      x: 200, y: 306, 'font-size': 7, 'font-weight': 600, fill: FAINT, 'text-anchor': 'middle',
      'letter-spacing': '.1em', class: 'fade', style: 'animation-delay:1.25s'
    }, '一条发丝 = 一个状态 · 13 维里取 4 维 · 上墨的是内侧眉肌拉得最满的那个');
  };

  /* ═══ 6.5 · 图型目录（页内索引表与校验脚本共用） ═══════════════════════
     id · 卡内标题 · Lieflat 图型（编号 + gallery 文件）· 数据来源 · 来源等级
     vb = svg viewBox（页面与校验脚本共用同一份，避免两处各写一遍后漂移）
     wide = 通栏卡（唯一一张：日历热力的 52 周需要横向空间）                     */
  var HALF = '0 0 400 320';
  var CATALOG = [
    { id: 'sleep-rungs', li: 'F1 Rung Bars', file: 'templates/basics-gallery.html', data: 'DogQuant 休息目标 + 物种参照', grade: 'A', vb: HALF },
    { id: 'hri-line', li: 'F2 Hairline Line', file: 'templates/basics-gallery.html', data: 'DogQuant.hri() 逐度求值', grade: 'C', vb: HALF },
    { id: 'life-area', li: 'F3 Hairline Area', file: 'templates/basics-gallery.html', data: 'DogQuant.lifeStage() 逐体重求值', grade: 'A', vb: HALF },
    { id: 'day-donut', li: 'F4 Tick Donut', file: 'templates/basics-gallery.html', data: '1440 分钟＝100 格，目标值取自 DNS', grade: 'B', vb: HALF },
    { id: 'triage-rows', li: 'F5 Tick Rows', file: 'templates/basics-gallery.html', data: 'DogQuant.TRIAGE_DEFS 按优先级计数', grade: 'C', vb: HALF },
    { id: 'hri-waterfall', li: 'F9 Rung Waterfall', file: 'templates/basics-gallery.html', data: 'DogQuant.hri() 的因子分解', grade: 'C', vb: HALF },
    { id: 'bark-heat', li: 'F10 Dot Heat', file: 'templates/basics-gallery.html', data: '晨昏双峰行为的合成示意', grade: 'C', vb: HALF },
    { id: 'pain-gauge', li: 'F11 Tick Gauge', file: 'templates/basics-gallery.html', data: 'CMPS-SF 0–24 与干预线 6', grade: 'A', vb: HALF },
    { id: 'der-dumbbell', li: 'F12 Dumbbell Queue', file: 'templates/basics-gallery.html', data: 'DogQuant.K_FACTORS 区间', grade: 'B', vb: HALF },
    { id: 'rr-box', li: 'F15 Tick Box', file: 'templates/basics-gallery.html', data: '静息呼吸 10–30 区间上的合成分布', grade: 'C', vb: HALF },
    { id: 'weight-candle', li: 'F17 Candlestick', file: 'templates/basics-gallery.html', data: '每日体重四值的合成记录', grade: 'C', vb: HALF },
    { id: 'daily-cascade', li: 'L2 Dot Cascade', file: 'templates/lupi-gallery.html', data: '一天行为抽样的计数', grade: 'C', vb: HALF, dark: true },
    { id: 'trait-spectrum', li: 'L7 Brand Spectrum', file: 'templates/lupi-gallery.html', data: '性格四维定位与三个参照群体', grade: 'C', vb: HALF },
    { id: 'bark-patchwork', li: 'L10 Radial Patchwork', file: 'templates/lupi-gallery.html', data: '46 次吠叫的时刻与强度', grade: 'C', vb: '0 0 400 330' },
    { id: 'care-funnel', li: 'L13 Hourglass Stream', file: 'templates/lupi-gallery.html', data: '从察觉异常到治疗的阶段留存', grade: 'C', vb: '0 0 400 340' },
    { id: 'dns-hundred', li: 'L14 Hundred Field', file: 'templates/lupi-gallery.html', data: 'DogQuant.DNS_DIMS 权重 = 100 点', grade: 'C', vb: HALF },
    { id: 'fear-tally', li: 'L15 Ballot Tally', file: 'templates/lupi-gallery.html', data: '恐惧诱因的百只队列', grade: 'C', vb: HALF },
    { id: 'walk-calendar', li: 'L17 Calendar Heat', file: 'templates/lupi-gallery.html', data: '全年 52 周 × 7 天的外出次数', grade: 'C', vb: '0 0 840 200', wide: true },
    { id: 'expr-parallel', li: 'L20 Parallel Coordinates', file: 'templates/lupi-gallery.html', data: 'DogExpression.stateParams() 真实向量', grade: 'A', vb: HALF }
  ];

  /* ═══ 7 · 导出 ═════════════════════════════════════════════════════════ */
  var API = {
    version: '1.0',
    MONO: { INK: INK, PAPER: PAPER, MUTED: MUTED, FAINT: FAINT, GRID: GRID, L: L, DARK: DARK, FONT_STACK: FONT_STACK, MOTION: MOTION, CARD_CSS: CARD_CSS },
    RENDER: RENDER,
    CATALOG: CATALOG,
    rnd: rnd, pol: pol, sect: sect, blob: blob, smoothPath: smoothPath,
    el: el, txt: txt, tip: tip, reveal: reveal, keep: keep,
    lifeExp: lifeExp, hriScore: hriScore, DOG: DOG,
    /* 把页面上所有 [data-chart] 的 svg 挂上渲染器 */
    mount: function () {
      var nodes = document.querySelectorAll('svg[data-chart]');
      var missing = [];
      Array.prototype.forEach.call(nodes, function (n) {
        var kind = n.getAttribute('data-chart');
        if (!RENDER[kind]) { missing.push(kind); return; }
        reveal(n, RENDER[kind]);
      });
      return { mounted: nodes.length - missing.length, total: nodes.length, missing: missing };
    },
    /* 供命令行 / 校验脚本使用：直接拿一张图的 SVG 字符串（Node 里用 DOM stub） */
    render: function (kind) {
      if (!RENDER[kind]) throw new Error('未知图型：' + kind);
      var svg = document.createElementNS(NS, 'svg');
      RENDER[kind](svg);
      return svg;
    }
  };

  global.DogCharts = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
