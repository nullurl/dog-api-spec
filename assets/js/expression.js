/*!
 * DOG 表情渲染引擎 —— EXPR v1
 * ---------------------------------------------------------------------------
 * 设计前提：本系统里没有表情库。
 * 14 个状态全部是同一个 13 维参数向量在不同取值下的渲染结果；
 * 引擎内不含任何位图、素材或外部依赖，输出为整数坐标的像素级 SVG。
 *
 * 栅格化顺序（后画的覆盖先画的）：
 *   耳 → 头 → 口鼻 → 嘴 → 鼻 → 眼 → 眉 → 颊 → 叠加层 → 轮廓
 *
 * 零依赖，浏览器（window.DogExpression）与 Node（require）双用。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DogExpression = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ 画布 */

  var N = 24; // 网格边长；1 格 = 1 SVG 单位

  // 调色板。字符 → 颜色；"." 为透明。字符集刻意压到 11 个。
  var PALETTE = {
    ".": null,
    O: "#2a1f18", // 轮廓
    D: "#a86e33", // 深毛（耳 / 阴影）
    F: "#d99a5b", // 主毛色
    L: "#f2c78f", // 浅毛（口鼻）
    N: "#33241a", // 鼻 / 口腔
    W: "#fffaf3", // 眼白
    P: "#241a12", // 瞳孔
    T: "#e8837b", // 舌
    B: "#eba595", // 颊
    K: "#8a5320", // 眉（比深毛更暗，保证 24 px 下可读）
    M: "#c48a4e"  // 运动残影。刻意不参与轮廓描边，否则每条残影都会胖一圈
  };

  // ASCII 预览用的替身字符（终端里便于肉眼检查形状）
  var ASCII = {
    ".": " ", O: "#", D: "+", F: "o", L: ":",
    N: "X", W: "·", P: "@", T: "~", B: ",", K: "=", M: "-"
  };

  // 参与轮廓描边的前景字符。眉、眼白、瞳孔、颊不参与，
  // 否则眼白周围会多出一圈黑边，像戴了护目镜。
  var SILHOUETTE = { F: 1, D: 1, L: 1, N: 1, T: 1 };

  /* ------------------------------------------------------------ 参数定义 */

  var BASE = {
    earPerk: 0.25,   // 耳廓前倾（0 下垂 → 1 竖立）
    earBack: 0,      // 耳廓后压（恐惧 / 顺从 / 疼痛）
    tilt: 0,         // 头部偏航（度）
    eyeOpen: 1,      // 睑裂开度（0 闭合 → 1.4 露巩膜）
    pupilX: 0,       // 视线水平偏移
    pupilY: 0,       // 视线垂直偏移
    whaleEye: 0,     // 鲸鱼眼（巩膜暴露）
    browInner: 0,    // 内侧眉肌 AU101（犬有 / 狼无）
    browOuter: 0,    // 外侧眉肌
    mouthOpen: 0,    // 张口度
    tongue: 0,       // 舌伸出
    blush: 0,        // 颊部
    extra: "none"    // 叠加层
  };

  var BOUNDS = {
    earPerk: [0, 1], earBack: [0, 1], tilt: [-15, 15],
    eyeOpen: [0, 1.4], pupilX: [-1, 1], pupilY: [-1, 1],
    whaleEye: [0, 1], browInner: [-1, 1], browOuter: [-1, 1],
    mouthOpen: [0, 1], tongue: [0, 1], blush: [0, 1]
  };

  var PARAM_KEYS = ["earPerk", "earBack", "tilt", "eyeOpen", "pupilX", "pupilY",
    "whaleEye", "browInner", "browOuter", "mouthOpen", "tongue", "blush", "extra"];

  // 参数注册表。等级沿用规范全文的 A / B / C 体系。
  var PARAM_DEFS = [
    { key: "earPerk", label: "耳廓前倾", range: "0–1", unit: "", grade: "B", note: "耳廓立起程度。1 = 全竖立（注意与 earBack 不互斥，二者可同时为非零）" },
    { key: "earBack", label: "耳廓后压", range: "0–1", unit: "", grade: "B", note: "恐惧、顺从与急性疼痛的共同表征；单看此参数无法区分三者" },
    { key: "tilt", label: "头部偏航", range: "−15 – +15", unit: "°", grade: "B", note: "定位声源时的偏航角。人类普遍把它读作「可爱」，本引擎不纠正这一误读" },
    { key: "eyeOpen", label: "睑裂开度", range: "0 – 1.4", unit: "", grade: "B", note: "0 = 闭合，1 = 常态，>1 露出下巩膜。CMPS-SF 把眯眼列为疼痛面部单元之一" },
    { key: "pupilX", label: "视线水平偏移", range: "−1 – +1", unit: "", grade: "C", note: "瞳孔相对眼窝中心的偏移；回避型视线是安抚信号的组成部分" },
    { key: "pupilY", label: "视线垂直偏移", range: "−1 – +1", unit: "", grade: "C", note: "同上，垂直分量" },
    { key: "whaleEye", label: "鲸鱼眼（巩膜暴露）", range: "0–1", unit: "", grade: "B", note: "应激的核心指标。副作用是让瞳孔显得变小，从而看起来「不像它」" },
    { key: "browInner", label: "内侧眉肌 AU101", range: "−1 – +1", unit: "", grade: "A", note: "levator anguli oculi medialis。犬有、狼无（Kaminski 2019, PNAS）。本系统唯一为人类新增的硬件" },
    { key: "browOuter", label: "外侧眉肌", range: "−1 – +1", unit: "", grade: "C", note: "与 browInner 的差值决定是「祈求」还是「愧疚」——同一个硬件，两种读法" },
    { key: "mouthOpen", label: "张口度", range: "0–1", unit: "", grade: "C", note: "散热与表情共用同一执行器，因此无法从张口判断情绪" },
    { key: "tongue", label: "舌伸出", range: "0–1", unit: "", grade: "C", note: "低频舔鼻同时是安抚信号与应激信号" },
    { key: "blush", label: "颊部", range: "0–1", unit: "", grade: "C", note: "本项目定义，无解剖学依据。之所以保留，是因为人类会读它" },
    { key: "extra", label: "叠加层", range: "zzz / sweat / blur / unknown / none", unit: "", grade: "C", note: "非解剖叠加。unknown 时返回剪影而不是猜测" }
  ];

  var EXTRAS = ["none", "zzz", "sweat", "blur", "unknown"];

  /* ------------------------------------------------------------ 几何工具 */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function blank() {
    var g = [];
    for (var y = 0; y < N; y++) {
      var row = [];
      for (var x = 0; x < N; x++) row.push(".");
      g.push(row);
    }
    return g;
  }

  // 整体倾斜用「对采样点做逆旋转」实现，而不是逐个部件旋转。
  // 返回 { fwd, inv }；tilt = 0 时为恒等变换。
  function transformPair(tilt) {
    if (!tilt) {
      var id = function (x, y) { return [x, y]; };
      return { fwd: id, inv: id };
    }
    var a = tilt * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var px = N / 2, py = N / 2 + 1.4; // 旋转轴心：颈部方向
    return {
      fwd: function (x, y) {
        var dx = x - px, dy = y - py;
        return [px + dx * c - dy * s, py + dx * s + dy * c];
      },
      inv: function (x, y) {
        var dx = x - px, dy = y - py;
        return [px + dx * c + dy * s, py - dx * s + dy * c];
      }
    };
  }

  var TF_ID = transformPair(0).fwd; // 恒等变换，供不随头部倾斜的叠加层使用

  // 超椭圆：n = 2 是普通椭圆，n > 2 越接近圆角矩形。
  // 头部用 n ≈ 3，否则椭圆的顶端会收成一个尖，在 24 px 下像顶了个锥子。
  function ellTest(wx, wy, cx, cy, rx, ry, rot, n) {
    var dx = wx - cx, dy = wy - cy;
    if (rot) {
      var a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      var qx = dx * c + dy * s, qy = -dx * s + dy * c;
      dx = qx; dy = qy;
    }
    var p = n || 2;
    if (p === 2) return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    return Math.pow(Math.abs(dx) / rx, p) + Math.pow(Math.abs(dy) / ry, p) <= 1;
  }

  function fillEll(g, tf, cx, cy, rx, ry, ch, rot, yMin, yMax, n) {
    if (!(rx > 0) || !(ry > 0)) return;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var w = tf(x + 0.5, y + 0.5);
        if (yMin !== undefined && w[1] < yMin) continue;
        if (yMax !== undefined && w[1] > yMax) continue;
        if (ellTest(w[0], w[1], cx, cy, rx, ry, rot, n)) g[y][x] = ch;
      }
    }
  }

  function fillRect(g, tf, x0, y0, x1, y1, ch) {
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var w = tf(x + 0.5, y + 0.5);
        if (w[0] >= x0 && w[0] <= x1 && w[1] >= y0 && w[1] <= y1) g[y][x] = ch;
      }
    }
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + t * dx - px, qy = ay + t * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }

  // 折线描边。比逐点打点更稳：整体倾斜时细线不会断开。
  function strokePolyline(g, tf, pts, ch, hw) {
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var w = tf(x + 0.5, y + 0.5), best = Infinity;
        for (var i = 0; i < pts.length - 1; i++) {
          var d = distToSeg(w[0], w[1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
          if (d < best) best = d;
        }
        if (best <= hw) g[y][x] = ch;
      }
    }
  }

  // 只给剪影外缘描边：空白格若与前景相邻，则变为轮廓色。
  function outline(g) {
    var src = [];
    for (var y = 0; y < N; y++) src.push(g[y].slice());
    var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var yy = 0; yy < N; yy++) {
      for (var xx = 0; xx < N; xx++) {
        if (src[yy][xx] !== ".") continue;
        for (var k = 0; k < 4; k++) {
          var nx = xx + nb[k][0], ny = yy + nb[k][1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          var c = src[ny][nx];
          if (c !== "." && SILHOUETTE[c]) { g[yy][xx] = "O"; break; }
        }
      }
    }
  }

  /* -------------------------------------------------------------- 各部件 */

  // 耳：一枚旋转超椭圆。下垂与竖立之间是连续插值，不是两个素材切换。
  function drawEars(g, tf, p) {
    var baseCx = 4.6 - p.earBack * 0.6;
    var baseCy = 8.6 - p.earPerk * 1.9 + p.earBack * 0.9;
    var rx = 2.10 + p.earBack * 0.45 - p.earPerk * 0.10;
    var ry = 4.80 - p.earPerk * 1.05 - p.earBack * 1.60;
    var rot = 18 + p.earPerk * 4 + p.earBack * 34;
    // 耳根：颅骨顶部很窄，中等竖立度时耳廓与颅骨之间会裂开一道 1 px 的缝。
    // 用一枚小椭圆把两者接上，画在颅骨之前，因此只露出朝外的部分。
    var rootCx = 6.5 - p.earBack * 0.5;
    var rootCy = 8.4 + p.earBack * 0.6 - p.earPerk * 0.3;
    for (var s = -1; s <= 1; s += 2) {
      fillEll(g, tf, s < 0 ? rootCx : N - rootCx, rootCy, 2.00, 2.50, "D",
        0, undefined, undefined, 2.4);
      var cx = s < 0 ? baseCx : N - baseCx;
      fillEll(g, tf, cx, baseCy, rx, ry, "D", s * rot, undefined, undefined, 2.3);
    }
  }

  function drawHead(g, tf) {
    // 颅骨用 n = 3.4：更方的顶盖才能和耳根接上，椭圆顶会收成尖并裂出缝
    fillEll(g, tf, 12, 13.5, 6.8, 7.0, "F", 0, undefined, undefined, 3.4);
    fillEll(g, tf, 12, 18.3, 5.0, 3.0, "L", 0, undefined, undefined, 2.6); // 口鼻
  }

  // 鼻。与嘴之间刻意留出约 1.8 px 的空档：
  // 二者在真实头骨上相邻，在这个分辨率下相邻就等于合并。
  function drawNose(g, tf) {
    fillEll(g, tf, 12, 16.5, 1.95, 1.25, "N", 0, undefined, undefined, 2.6);
  }

  function drawMouth(g, tf, p) {
    var open = p.mouthOpen;
    if (open < 0.06) {
      // 静息唇线。弧必须画得极浅：斜率一大，2 px 的线就会断成两截。
      var pts = [];
      for (var i = 0; i <= 6; i++) {
        var t = i / 6;
        pts.push([9.4 + t * 5.2, 19.55 + Math.sin(Math.PI * t) * 0.45]);
      }
      strokePolyline(g, tf, pts, "N", 0.60);
      return;
    }
    var mrx = 1.15 + open * 1.55;
    var mry = 0.45 + open * 1.60;
    var mcy = 19.05 + open * 0.65;
    fillEll(g, tf, 12, mcy, mrx, mry, "N", 0, undefined, undefined, 2.4);
    if (p.tongue > 0.06) {
      var trx = (0.95 + p.tongue * 1.05) * (0.55 + open * 0.45);
      var tryy = 0.40 + p.tongue * 1.15;
      var tcy = mcy + mry * 0.35 + p.tongue * 0.60;
      fillEll(g, tf, 12, tcy, trx, tryy, "T", 0, undefined, undefined, 2.2);
    }
  }

  // 眼。eyeOpen 通过垂直裁切实现，不切换素材。
  function drawEye(g, tf, s, p) {
    var cx = 12 + s * 3.4;
    var cy = 12.5;
    var open = clamp(p.eyeOpen, 0.02, 1.4);

    if (open < 0.16) {
      // 闭合：画一条松弛的弧（睑缘），而不是留下一块空白
      var pts = [];
      for (var i = 0; i <= 4; i++) {
        var t = i / 4;
        pts.push([cx - 1.5 + t * 3.0, cy + 0.55 * Math.sin(Math.PI * t)]);
      }
      strokePolyline(g, tf, pts, "K", 0.55);
      return;
    }

    var rx = 1.72 * (1 + p.whaleEye * 0.24);
    var ry = 1.60 * (1 + p.whaleEye * 0.12);
    var yMin = cy - ry * Math.min(open, 1.0);
    var yMax = cy + ry * Math.min(open, 1.15);

    fillEll(g, tf, cx, cy, rx, ry, "W", 0, yMin, yMax, 2.2);

    var pr = 1.00 * (1 - p.whaleEye * 0.32);
    fillEll(g, tf, cx + p.pupilX * 0.85, cy + p.pupilY * 0.75,
      pr, pr, "P", 0, yMin, yMax, 2.2);
  }

  // 眉。内侧上扬（AU101）与外侧上扬是同一个参数的两种取值，
  // 它们的差值正是人类读成「祈求」或「愧疚」的依据。
  // 眼睛闭合时不画眉：睡眠中的眉位不携带信息，画出来只会让脸变吵。
  function drawBrow(g, tf, s, p) {
    if (p.eyeOpen < 0.16) return;
    var cx = 12 + s * 3.4;
    var innerX = cx - s * 1.45;
    var outerX = cx + s * 1.65;
    var baseY = 9.0;
    var pts = [];
    for (var i = 0; i <= 4; i++) {
      var t = i / 4; // 0 = 外侧，1 = 内侧
      var x = outerX + (innerX - outerX) * t;
      var lift = p.browOuter + (p.browInner - p.browOuter) * t;
      pts.push([x, baseY - lift * 1.45 - 0.35 * Math.sin(Math.PI * t)]);
    }
    strokePolyline(g, tf, pts, "K", 0.55);
  }

  function drawBlush(g, tf, p) {
    if (p.blush < 0.25) return;
    var k = 0.45 + p.blush * 0.55;
    fillEll(g, tf, 6.3, 15.3, 1.60 * k, 1.00 * k, "B");
    fillEll(g, tf, 17.7, 15.3, 1.60 * k, 1.00 * k, "B");
  }

  function drawExtra(g, tf, p) {
    var e = p.extra;
    if (e === "zzz") {
      zGlyph(g, tf, 17.4, 1.4, 3.1, "O");
      zGlyph(g, tf, 20.6, 4.6, 2.1, "O");
      return;
    }
    if (e === "sweat") {
      fillEll(g, tf, 16.2, 3.6, 1.0, 1.0, "O");
      fillEll(g, tf, 16.2, 4.6, 0.55, 1.1, "O");
      fillEll(g, tf, 15.85, 3.35, 0.30, 0.30, "W");
      return;
    }
    if (e === "blur") {
      // 运动残影：单像素、不描边、不参与整体倾斜
      fillRect(g, TF_ID, 0, 8.5, 3.0, 9.5, "M");
      fillRect(g, TF_ID, 0, 13.5, 2.0, 14.5, "M");
      fillRect(g, TF_ID, 0, 18.5, 3.5, 19.5, "M");
      fillRect(g, TF_ID, 21.0, 8.5, 24, 9.5, "M");
      fillRect(g, TF_ID, 22.0, 13.5, 24, 14.5, "M");
      fillRect(g, TF_ID, 20.5, 18.5, 24, 19.5, "M");
    }
  }

  function zGlyph(g, tf, x, y, s, ch) {
    strokePolyline(g, tf, [[x, y], [x + s, y]], ch, 0.5);
    strokePolyline(g, tf, [[x + s, y], [x, y + s]], ch, 0.5);
    strokePolyline(g, tf, [[x, y + s], [x + s, y + s]], ch, 0.5);
  }

  /* ---------------------------------------------------------------- 渲染 */

  function norm(p) {
    var out = {};
    Object.keys(BASE).forEach(function (k) {
      var v = p && p[k] !== undefined ? p[k] : BASE[k];
      var b = BOUNDS[k];
      if (b && typeof v === "number") v = clamp(v, b[0], b[1]);
      out[k] = v;
    });
    if (EXTRAS.indexOf(out.extra) < 0) out.extra = "none";
    return out;
  }

  function rasterize(input) {
    var p = typeof input === "string" ? norm(getState(input).params) : norm(input);
    var T = transformPair(p.tilt);
    var g = blank();

    if (p.extra === "unknown") {
      // 无法分类时返回剪影：不猜。
      drawEars(g, T.fwd, p);
      drawHead(g, T.fwd);
      silhouetteOnly(g);
      markUnknown(g);
      return g;
    }

    drawEars(g, T.fwd, p);
    drawHead(g, T.fwd);
    drawMouth(g, T.fwd, p);
    drawNose(g, T.fwd);
    drawEye(g, T.fwd, -1, p); drawEye(g, T.fwd, 1, p);
    drawBrow(g, T.fwd, -1, p); drawBrow(g, T.fwd, 1, p);
    drawBlush(g, T.fwd, p);
    drawExtra(g, T.fwd, p);
    outline(g);
    return g;
  }

  // 剪影模式：只保留外缘的那一圈。
  // 注意不能用「先填实、再腐蚀内部」的做法 —— 那样会留下大量孤立斑点，
  // 看上去像一台坏掉的传真机，而不像一只狗。
  function silhouetteOnly(g) {
    var src = [];
    for (var i = 0; i < N; i++) src.push(g[i].slice());
    var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var solid = { F: 1, D: 1, L: 1 };
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        if (!solid[src[y][x]]) { g[y][x] = "."; continue; }
        var edge = false;
        for (var k = 0; k < 4; k++) {
          var nx = x + nb[k][0], ny = y + nb[k][1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) { edge = true; break; }
          if (!solid[src[ny][nx]]) { edge = true; break; }
        }
        g[y][x] = edge ? "O" : ".";
      }
    }
  }

  // 问号画在颅顶正上方的空白区。两耳之间只有这一块干净的地方，
  // 挪到任一侧都会和耳廓的剪影叠在一起。
  function markUnknown(g) {
    strokePolyline(g, TF_ID,
      [[10.2, 1.9], [13.0, 1.9], [11.6, 3.5], [11.6, 4.4]], "O", 0.52);
    strokePolyline(g, TF_ID, [[11.6, 5.5], [11.6, 5.9]], "O", 0.52);
  }

  function toMatrix(input) {
    var g = Array.isArray(input) ? input : rasterize(input);
    return g.map(function (r) { return r.join(""); });
  }

  function toASCII(input) {
    var g = Array.isArray(input) ? input : rasterize(input);
    return g.map(function (row) {
      return row.map(function (c) { return ASCII[c] !== undefined ? ASCII[c] : "?"; }).join("");
    }).join("\n");
  }

  // 同一颜色按行合并为横向游程，每色只出一条 path —— 24×24 的精灵通常 < 2.5 KB。
  function toSVG(input, opts) {
    opts = opts || {};
    var g = Array.isArray(input) ? input : rasterize(input);
    var scale = opts.scale || 12;
    var byColor = {};
    for (var y = 0; y < N; y++) {
      var x = 0;
      while (x < N) {
        var c = g[y][x];
        if (!PALETTE[c]) { x++; continue; }
        var w = 1;
        while (x + w < N && g[y][x + w] === c) w++;
        (byColor[c] = byColor[c] || []).push([x, y, w]);
        x += w;
      }
    }
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + " " + N +
      '" width="' + (N * scale) + '" height="' + (N * scale) +
      '" shape-rendering="crispEdges" role="img"';

    var label = opts.label || "";
    if (!label && typeof input === "string" && STATES_BY_ID[input]) label = STATES_BY_ID[input].title;
    if (label) out += ' aria-label="' + esc(label) + '"';
    out += ' data-state="' + esc(opts.state || (typeof input === "string" ? input : "composed")) + '">';

    if (opts.background) {
      out += '<rect width="' + N + '" height="' + N + '" fill="' + esc(opts.background) + '"/>';
    }
    Object.keys(byColor).forEach(function (k) {
      var d = byColor[k].map(function (r) {
        return "M" + r[0] + " " + r[1] + "h" + r[2] + "v1h-" + r[2] + "z";
      }).join("");
      out += '<path fill="' + PALETTE[k] + '" d="' + d + '"/>';
    });
    return out + "</svg>";
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function toDataURI(input, opts) {
    var svg = toSVG(input, opts);
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
      .replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%3A/g, ":")
      .replace(/%2F/g, "/").replace(/%22/g, "'");
  }

  /* ------------------------------------------------------------ 状态定义 */

  // 每个状态 = 参数空间里的一个点 + 三组响应头 + 一条自评。
  // 参数之外的通道（尾巴、身体、发声）不进 body，见 §4.6 的说明。
  var STATES = [
    {
      id: "ATTENTIVE", title: "被叫到名字（且它决定理你）", class: "日常",
      params: { earPerk: 0.78, eyeOpen: 1.0, pupilX: 0.18, pupilY: -0.08, browInner: 0.38, browOuter: 0.10 },
      tail: "neutral", body: "up", vocal: "none", confidence: 0.94, suppressed: false,
      note: "「决定理你」这一步不可省略。同一个声学输入可稳定返回 204 NO CONTENT。"
    },
    {
      id: "GAZE", title: "对视超过两秒", class: "日常",
      params: { earPerk: 0.45, eyeOpen: 0.95, browInner: 0.60, browOuter: 0.18, mouthOpen: 0.08, blush: 0.30 },
      tail: "slow-right", body: "neutral", vocal: "none", confidence: 0.88, suppressed: false,
      note: "唯一被证实双向、闭环、可自我强化的通道。双方尿液中催产素浓度同时上升（Nagasawa 2015）。"
    },
    {
      id: "JOY", title: "你回家", class: "日常",
      params: { earPerk: 0.62, eyeOpen: 0.72, pupilX: 0.05, pupilY: 0.05, browInner: 0.30, browOuter: -0.05, mouthOpen: 0.60, tongue: 0.75, blush: 0.40 },
      tail: "right", body: "up", vocal: "pant", confidence: 0.96, suppressed: false,
      note: "尾向右偏是一个带符号的矢量，不是「摇得欢」的副词（Quaranta 2007）。本状态返回 right。"
    },
    {
      id: "APPEASEMENT", title: "被斥责 / 遇到强势个体", class: "日常",
      params: { earPerk: 0, earBack: 0.82, eyeOpen: 0.62, pupilX: -0.12, pupilY: 0.06, browInner: 0.22, browOuter: -0.15, mouthOpen: 0.18, tongue: 0.55 },
      tail: "left", body: "lowered", vocal: "whine", confidence: 0.81, suppressed: false,
      note: "尾向左偏。同类能读懂这个方向，并在观察到左偏时心率升高（Siniscalchi 2013）。"
    },
    {
      id: "BEG", title: "你在吃东西", class: "日常",
      params: { earPerk: 0.45, eyeOpen: 1.08, browInner: 0.95, browOuter: 0.12, mouthOpen: 0.12, blush: 0.15 },
      tail: "slow-right", body: "neutral", vocal: "none", confidence: 0.71, suppressed: false,
      note: "内侧眉肌被拉到接近满量程。这是 AU101 唯一被高频调用的场景，也是它被演化出来的原因。"
    },
    {
      id: "ALERT", title: "门外有声音", class: "日常",
      params: { earPerk: 1, eyeOpen: 0.78, pupilY: -0.12, browInner: 0.05, browOuter: 0.05 },
      tail: "stiff", body: "up", vocal: "none", confidence: 0.90, suppressed: false,
      note: "耳廓前倾拉满。此时睑裂反而收窄 —— 聚焦与惊讶是两回事。"
    },
    {
      id: "CURIOUS", title: "歪头", class: "日常",
      params: { earPerk: 0.85, tilt: 11, eyeOpen: 1.0, pupilX: 0.12, pupilY: -0.06, browInner: 0.28, browOuter: 0.08, mouthOpen: 0.04, blush: 0.08 },
      tail: "neutral", body: "up", vocal: "none", confidence: 0.83, suppressed: false,
      note: "偏航 11° 用于绕过自己的口鼻遮挡声源。人类把这个姿态统一读作可爱，本引擎不纠正这一误读。"
    },
    {
      id: "STRESS", title: "兽医院候诊室", class: "医疗",
      params: { earPerk: 0, earBack: 0.60, eyeOpen: 1.02, pupilX: -0.22, pupilY: -0.10, whaleEye: 1, browInner: 0.15, browOuter: 0.35, mouthOpen: 0.45, tongue: 0.85, extra: "sweat" },
      tail: "tucked", body: "lowered", vocal: "pant", confidence: 0.74, suppressed: false,
      note: "鲸鱼眼拉满。低频舔鼻在这里既是安抚信号也是应激信号，单看参数无法区分方向。"
    },
    {
      id: "GUILTY", title: "「愧疚脸」", class: "日常",
      params: { earPerk: 0.10, earBack: 0.65, eyeOpen: 0.68, pupilX: 0.05, pupilY: 0.10, whaleEye: 0.15, browInner: 0.78, browOuter: 0.32, mouthOpen: 0.05, tongue: 0.15 },
      tail: "left", body: "lowered", vocal: "none", confidence: 0.22, suppressed: false,
      note: "此状态与内疚无关，它是安抚信号。被冤枉的狗会给出最夸张的版本（Horowitz 2009）。置信度标注为 0.22 是规范编写组有意为之。"
    },
    {
      id: "SLEEP", title: "睡着", class: "日常",
      params: { earPerk: 0, earBack: 0.45, tilt: 6, eyeOpen: 0.06, mouthOpen: 0.10, blush: 0.10, extra: "zzz" },
      tail: "neutral", body: "lowered", vocal: "none", confidence: 0.99, suppressed: false,
      note: "REM 期会出现面部抽动。此时引擎的输出不稳定，属预期行为。"
    },
    {
      id: "ZOOMIES", title: "配额溢出", class: "日常",
      params: { earPerk: 0.92, tilt: -7, eyeOpen: 1.15, pupilX: 0.15, pupilY: -0.05, whaleEye: 0.35, browInner: 0.40, browOuter: -0.20, mouthOpen: 0.75, tongue: 0.80, blush: 0.25, extra: "blur" },
      tail: "overflow", body: "airborne", vocal: "bark", confidence: 0.61, suppressed: false,
      note: "见 §2.9 性能与容量：未消费的运动配额在约 20:00 以本状态一次性溢出。面部在高速位移中不构成可靠信号。"
    },
    {
      id: "PAIN", title: "急性疼痛", class: "医疗",
      params: { earPerk: 0, earBack: 0.55, eyeOpen: 0.42, pupilY: 0.12, whaleEye: 0.25, browInner: -0.60, browOuter: -0.55, mouthOpen: 0.12, tongue: 0.10 },
      tail: "down", body: "lowered", vocal: "whine", confidence: 0.86, suppressed: false,
      note: "眉肌向下压（负值）。与「愧疚脸」用的是同一块肌肉、相反的方向 —— 这也是为什么人类经常把疼痛读成内疚。CMPS-SF 的面部单元包含眯眼与耳位。"
    },
    {
      id: "SICK", title: "生病（上报为正常）", class: "医疗",
      params: {}, // 与基线完全一致 —— 这是本状态的全部要点
      tail: "right", body: "neutral", vocal: "none", confidence: 0.97, suppressed: true,
      note: "本状态没有专属参数。参数向量与基线逐位相同，因为表情系统工作正常，只是内容与事实不符。它仍在摇尾巴。"
    },
    {
      id: "UNKNOWN", title: "无法分类", class: "系统",
      params: { extra: "unknown" },
      tail: "unknown", body: "unknown", vocal: "unknown", confidence: 0.0, suppressed: false,
      note: "返回剪影而不是猜测。本引擎宁可承认读不懂，也不生成一个看起来合理的错误答案。"
    }
  ];

  var STATES_BY_ID = {};
  STATES.forEach(function (s) { STATES_BY_ID[s.id] = s; });

  function getState(id) {
    var k = String(id || "").toUpperCase().replace(/[^A-Z]/g, "");
    return STATES_BY_ID[k] || STATES_BY_ID.UNKNOWN;
  }

  function stateParams(id) { return norm(getState(id).params); }

  /* ------------------------------------------------------------ 混合运算 */

  // 线性混合。extra 取权重最大的那一个（叠加层不可插值）。
  function blend(specs) {
    var list = (specs || []).map(function (s) {
      if (typeof s === "string") return { state: s, weight: 1 };
      return { state: String(s.state || "").toUpperCase(), weight: Number(s.weight) };
    }).filter(function (s) { return STATES_BY_ID[s.state] && isFinite(s.weight) && s.weight > 0; });

    if (!list.length) return { ok: false, status: 422, reason: "NO_USABLE_STATE" };

    var total = list.reduce(function (n, s) { return n + s.weight; }, 0);
    var acc = {}, extras = {}, stateW = {};
    PARAM_KEYS.forEach(function (k) { if (k !== "extra") acc[k] = 0; });

    list.forEach(function (s) {
      var w = s.weight / total;
      var p = stateParams(s.state);
      stateW[s.state] = (stateW[s.state] || 0) + w;
      PARAM_KEYS.forEach(function (k) {
        if (k === "extra") extras[p.extra] = (extras[p.extra] || 0) + w;
        else acc[k] += p[k] * w;
      });
    });

    var domExtra = "none", domW = -1;
    Object.keys(extras).forEach(function (k) { if (extras[k] > domW) { domW = extras[k]; domExtra = k; } });
    acc.extra = domExtra;

    var domState = Object.keys(stateW).sort(function (a, b) { return stateW[b] - stateW[a]; })[0];
    var stability = Math.round(stateW[domState] * 100) / 100;

    return {
      ok: true, status: 200, params: norm(acc),
      dominant: domState, stability: stability,
      headers: {
        "X-Expression-Dominant": domState,
        "X-Expression-Stability": stability.toFixed(2)
      }
    };
  }

  // 混合帧默认不可保持：系统会回到权重最大的那个状态。
  function compose(specs, opts) {
    opts = opts || {};
    var r = blend(specs);
    if (!r.ok) return r;
    if (opts.persist && r.stability < 0.6) {
      return {
        ok: false, status: 409, reason: "EXPRESSION_NOT_HOLDABLE",
        dominant: r.dominant, stability: r.stability,
        message: "混合表情无法保持。除非某一状态权重 ≥ 0.60 —— 那个状态就是它当前真正的状态。",
        params: r.params, headers: r.headers
      };
    }
    return r;
  }

  /* ------------------------------------------------------------ 端点清单 */

  var ENDPOINTS = [
    { method: "GET", path: "/api/v1/expression", status: 200, note: "状态清单与参数定义。系统无法新增表情，只能被观测到新的表情。" },
    { method: "GET", path: "/api/v1/expression/{state}", status: 200, note: "返回单帧。Accept 决定格式：image/svg+xml / text/plain（点阵） / application/json（参数向量）" },
    { method: "POST", path: "/api/v1/expression/{state}", status: 405, note: "表情是状态的上报，不是可调用的方法。本端点是全篇唯一一条真正的 MUST。" },
    { method: "POST", path: "/api/v1/expression/compose", status: 200, note: "混合多个状态为一帧。persist=true 且最高权重 < 0.60 时返回 409。" },
    { method: "GET", path: "/api/v1/expression/schema", status: 200, note: "13 维参数向量的 JSON Schema" },
    { method: "GET", path: "/api/v1/expression/{state}.svg", status: 200, note: "同上，显式索取 SVG。带 ETag。" },
    { method: "DELETE", path: "/api/v1/expression/{state}", status: 405, note: "同上。而且它不会理解你为什么想这么做。" }
  ];

  var STATUS_CODES = [
    { code: 200, name: "OK", note: "表情已送达。注意送达不等于被看懂。" },
    { code: 204, name: "NO CONTENT", note: "已接收请求，但当前没有可上报的状态。常见于它听见了但决定不理你。" },
    { code: 304, name: "NOT MODIFIED", note: "与上次观测一致。它一整个下午都保持着同一个表情。" },
    { code: 401, name: "UNAUTHORIZED", note: "高分辨率面部输出只对已建立关系的个体开放。陌生人得到的是低带宽近似版本。" },
    { code: 405, name: "METHOD NOT ALLOWED", note: "你不能命令它高兴。" },
    { code: 409, name: "CONFLICT", note: "请求的混合表情无法保持，详见 compose。" },
    { code: 422, name: "UNPROCESSABLE", note: "参数向量不成立（如引用了不存在的状态）。" },
    { code: 451, name: "VET VISIT REQUIRED", note: "PAIN 状态与 §4.4 分诊的 P0 / P1 同时命中时，所有评分端点短路到本码。" },
    { code: 503, name: "EXPRESSION SUPPRESSED", note: "见 §3.8：它不会主动上报自身故障。SICK 状态即此码的成因。" }
  ];

  /* ------------------------------------------------------------------ 导出 */

  return {
    N: N, PALETTE: PALETTE, ASCII: ASCII,
    BASE: BASE, BOUNDS: BOUNDS, PARAM_KEYS: PARAM_KEYS, PARAM_DEFS: PARAM_DEFS,
    STATES: STATES, STATE_IDS: STATES.map(function (s) { return s.id; }),
    ENDPOINTS: ENDPOINTS, STATUS_CODES: STATUS_CODES, EXTRAS: EXTRAS,
    getState: getState, stateParams: stateParams, norm: norm,
    rasterize: rasterize, render: toSVG, toSVG: toSVG,
    toASCII: toASCII, toMatrix: toMatrix, toDataURI: toDataURI,
    blend: blend, compose: compose
  };
});
