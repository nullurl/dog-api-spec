/* ============================================================
   DOG API — 领养组件（首页）
   把「安装即授权」做成一个自包含组件：安装命令、授权三态、KEY 派生同框。

   它不检测本机装没装技能 —— 页面既没有这个权限，也没有这个必要：
   授权发生在安装那一刻，这一页只把规则和结果摆在一起。

   与 tools/adoption.html 同源，都调 assets/js/adoption-key.js；
   规范定义见 §5.3《领养与授权》（规范 ID：DOG-adoption）。

   零网络 · 零存储 · 零外链。挂载点 #adoption-widget（自动），
   或手动 DogAdoptionWidget.mount(el, { root: "../" })。
   ============================================================ */

(function (global) {
  "use strict";

  var CSS_ID = "dog-adoption-widget-css";

  var CSS = [
    ".adw{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);gap:16px;align-items:start;}",
    "@media (max-width:880px){.adw{grid-template-columns:1fr;}}",
    ".adw-panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;}",
    ".adw-h{display:flex;align-items:baseline;gap:9px;margin-bottom:14px;}",
    ".adw-h .n{font-size:11px;letter-spacing:.1em;font-weight:700;color:var(--accent);text-transform:uppercase;}",
    ".adw-h .t{font-size:15px;font-weight:600;}",
    ".adw-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:13px;}",
    ".adw-tab{font:inherit;font-size:12.5px;padding:5px 12px;border:1px solid var(--line);background:#fff;",
    "  border-radius:999px;cursor:pointer;color:var(--muted);}",
    ".adw-tab:hover{border-color:var(--accent);color:var(--accent);}",
    ".adw-tab[aria-pressed='true']{background:var(--accent-soft);border-color:var(--accent);color:#7c4a08;font-weight:600;}",
    ".adw-cmd{background:var(--code-bg);border:1px solid var(--line);border-radius:9px;padding:13px 15px;",
    "  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.85;",
    "  white-space:pre-wrap;word-break:break-all;color:var(--code-ink);}",
    ".adw-note{font-size:12.5px;color:var(--muted);line-height:1.85;margin-top:12px;}",
    ".adw-tag{display:inline-block;font-size:11px;padding:1px 8px;border-radius:999px;margin-right:7px;",
    "  border:1px solid var(--line);background:#fff;}",
    ".adw-tag.t-absent{color:var(--muted);}",
    ".adw-tag.t-installed{color:var(--ok);border-color:#bbf7d0;}",
    ".adw-tag.t-removed{color:var(--warn);border-color:#f3d5ac;}",
    ".adw-fields{display:grid;gap:9px;margin-bottom:12px;}",
    ".adw-f{display:grid;gap:3px;}",
    ".adw-f label{font-size:11.5px;color:var(--muted);}",
    ".adw-f label span{color:var(--faint);}",
    ".adw-f input{width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:6px;background:#fff;",
    "  font-family:inherit;font-size:13px;color:var(--ink);}",
    ".adw-out{background:var(--code-bg);border:1px solid var(--line);border-radius:9px;padding:13px 15px;}",
    ".adw-key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;font-weight:700;",
    "  color:var(--accent);letter-spacing:.03em;line-height:1.6;word-break:break-all;}",
    ".adw-lines{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.85;",
    "  color:var(--code-ink);white-space:pre-wrap;word-break:break-all;margin-top:10px;}",
    ".adw-lines b{font-weight:400;color:#8a8579;}",
    ".adw-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;}",
    ".adw-check{font-size:12px;line-height:1.85;margin-top:11px;}",
    ".adw-ok{color:var(--ok);font-weight:600;}",
    ".adw-bad{color:#b91c1c;font-weight:600;}",
    ".adw-mut{color:var(--faint);}",
    ".adw-foot{grid-column:1/-1;border-top:1px solid var(--line);padding-top:14px;margin-top:2px;",
    "  font-size:12.5px;color:var(--faint);line-height:1.9;}",
    ".adw-foot a{color:var(--accent);}",
    ".adw-foot code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;}",
  ].join("\n");

  /* 出厂原型元组 —— 与 §5.3 公布的测试向量 1 逐字一致。
     组件的默认状态就是这一组，所以页面一打开就能看到「元组相同 → KEY 相同」被实测一次。 */
  var DEFAULTS = {
    adopter: "example@dog-api-spec",
    cohort: "2026-09-16T12:00:00Z",
    habitat: "~/.workbuddy/skills/dog-api-adoption",
    intent: "非商业个人使用"
  };

  var PROTO_KEY = "DOG-05NA-N160-E6XJ-1TP1-54ZA-N3XS";

  /* 安装命令 —— 与 skill/SKILL.md 里那一段逐字一致 */
  var CMD = [
    "mkdir -p ~/.workbuddy/skills/dog-api-adoption",
    "curl -fsSL -o ~/.workbuddy/skills/dog-api-adoption/SKILL.md \\",
    "  https://nullurl.github.io/dog-api-spec/skill/SKILL.md",
    "curl -fsSL -o ~/.workbuddy/skills/dog-api-adoption/dog_adopt.py \\",
    "  https://nullurl.github.io/dog-api-spec/skill/dog_adopt.py",
    "python3 ~/.workbuddy/skills/dog-api-adoption/dog_adopt.py"
  ].join("\n");

  /* 授权三态 —— 借用技能商店模型。三态之间没有过渡状态，因为系统没有一处会返回 401。 */
  var STATES = [
    {
      k: "absent", label: "未安装", tag: "未授权",
      note: "未安装即未授权。本系统不返回 <code>401</code>，所以不装也不损失什么 —— " +
            "右边的 KEY 照样算得出来。授权发生在安装那一刻，不发生在这一页上。"
    },
    {
      k: "installed", label: "已安装", tag: "已授权",
      note: "安装这个动作本身就是同意。证书由技能写到 <code>~/.workbuddy/dog-api/adoption.json</code> —— " +
            "位置在技能目录<strong>之外</strong>。没有账号、没有登录、没有同意书要签。"
    },
    {
      k: "removed", label: "已卸载", tag: "已撤回",
      note: "卸载即撤回，中间没有第三种状态。牌删了，狗还在：撤回的是你的登记，" +
            "不是这份文档的可用性 —— 它从来没有被谁锁上过。"
    }
  ];

  function injectCss() {
    if (typeof document === "undefined" || !document.head) return;
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function val(id) {
    var el = document.getElementById(id);
    return el && el.value != null ? String(el.value) : "";
  }

  function line(k, v) {
    return "<b>" + esc(k) + "</b>  " + esc(v) + "\n";
  }

  function skeleton(root) {
    return [
      '<div class="adw">',
      '  <div class="adw-panel">',
      '    <div class="adw-h"><span class="n">步骤 1</span><span class="t">安装技能 —— 这一步就是授权</span></div>',
      '    <div class="adw-tabs" id="adw-tabs"></div>',
      '    <div class="adw-cmd" id="adw-cmd"></div>',
      '    <div class="adw-row"><button class="btn" type="button" id="adw-btn-cmd">复制安装命令</button></div>',
      '    <div class="adw-note" id="adw-note"></div>',
      '  </div>',
      '  <div class="adw-panel">',
      '    <div class="adw-h"><span class="n">步骤 2</span><span class="t">你的牌 —— KEY 由元组派生</span></div>',
      '    <div class="adw-fields">',
      '      <div class="adw-f"><label for="adw-adopter">领养人 <span>adopter</span></label>',
      '        <input id="adw-adopter" type="text" spellcheck="false"></div>',
      '      <div class="adw-f"><label for="adw-cohort">领养时刻 <span>cohort · UTC 秒精度</span></label>',
      '        <input id="adw-cohort" type="text" spellcheck="false"></div>',
      '      <div class="adw-f"><label for="adw-habitat">栖息地 <span>habitat · 技能安装目录</span></label>',
      '        <input id="adw-habitat" type="text" spellcheck="false"></div>',
      '      <div class="adw-f"><label for="adw-intent">声明用途 <span>intent · 只进摘要</span></label>',
      '        <input id="adw-intent" type="text" spellcheck="false"></div>',
      '    </div>',
      '    <div class="adw-out">',
      '      <div class="adw-key" id="adw-key"></div>',
      '      <div class="adw-lines" id="adw-lines"></div>',
      '    </div>',
      '    <div class="adw-row">',
      '      <button class="btn ghost" type="button" id="adw-btn-now">用当前时刻</button>',
      '      <button class="btn" type="button" id="adw-btn-copy">复制 KEY</button>',
      '      <button class="btn ghost" type="button" id="adw-btn-tuple">复制元组</button>',
      '    </div>',
      '    <div class="adw-check" id="adw-check"></div>',
      '  </div>',
      '  <div class="adw-foot">',
      '    本组件不检测你的机器 —— 上面那一栏是技能商店模型，不是状态探针。KEY 不是发放的，是派生的：' +
        '元组相同就逐字节相同，没有发号中心，所以也没有「找回」与「挂失」。它不授予任何权限，也不是秘密 —— ' +
        '领养时刻本来就写在载荷里。',
      '    <br>定义见 <a href="' + root + 'spec/dog.html#adoption">§5.3《领养与授权》（规范 ID <code>DOG-adoption</code>）</a>，',
      '    完整工具在 <a href="' + root + 'tools/adoption.html">领养入口</a>，',
      '    命令行实现是 <code>skill/dog_adopt.py</code> —— 两份实现互为裁判，判据是 §5.3 的固定测试向量。',
      '  </div>',
      '</div>'
    ].join("\n");
  }

  function fields() {
    return {
      adopter: val("adw-adopter"),
      cohort: val("adw-cohort").trim(),
      habitat: val("adw-habitat"),
      intent: val("adw-intent")
    };
  }

  function fillState(k) {
    STATES.forEach(function (s) {
      var b = document.getElementById("adw-tab-" + s.k);
      if (b && b.setAttribute) b.setAttribute("aria-pressed", s.k === k ? "true" : "false");
      if (b && b.classList && b.classList.toggle) b.classList.toggle("on", s.k === k);
    });
    var st = STATES.filter(function (s) { return s.k === k; })[0] || STATES[0];
    var note = document.getElementById("adw-note");
    if (note) {
      note.innerHTML = '<span class="adw-tag t-' + st.k + '">' + esc(st.tag) + "</span>" + st.note;
    }
  }

  function refresh() {
    var A = global.DogAdoption;
    var keyEl = document.getElementById("adw-key");
    var linesEl = document.getElementById("adw-lines");
    var checkEl = document.getElementById("adw-check");
    if (!A || !keyEl) return;
    var f = fields(), r;
    try {
      r = A.derive(f);
    } catch (e) {
      keyEl.innerHTML = '<span class="adw-bad">' + esc(e.message) + "</span>";
      if (linesEl) linesEl.innerHTML = "";
      if (checkEl) checkEl.innerHTML = "";
      return;
    }
    keyEl.textContent = r.key;
    linesEl.innerHTML =
      line("领养时刻", r.cohort) +
      line("栖息地", f.habitat) +
      line("声明用途", f.intent) +
      line("元组版本", A.TUPLE_VERSION);
    if (checkEl) {
      checkEl.innerHTML = r.key === PROTO_KEY
        ? '<span class="adw-ok">✓ 与 §5.3 测试向量 1 逐字节一致。</span>' +
          '<span class="adw-mut"> 出厂元组算出的就是这一张 —— 同一个元组，两台机器，两个实现，同一个数。</span>'
        : '<span class="adw-mut">与 §5.3 测试向量 1 不同 —— 那一组用的是出厂元组，你改过了。这不是错误：' +
          '改动任何一项，KEY 都会变；同一秒内改一个字也一样。</span>';
    }
  }

  function copy(text, btn) {
    var done = function (msg) {
      var old = btn.textContent;
      btn.textContent = msg;
      setTimeout(function () { btn.textContent = old; }, 1400);
    };
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done("已复制"); },
                                              function () { done("复制失败"); });
    } else {
      done("浏览器不支持");
    }
  }

  function isoNow() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function on(id, ev, fn) {
    var el = document.getElementById(id);
    if (el && el.addEventListener) el.addEventListener(ev, fn);
  }

  function mount(el, opts) {
    if (!el) return null;
    injectCss();
    var root = (opts && opts.root) || "";

    el.innerHTML = skeleton(root);

    var tabs = document.getElementById("adw-tabs");
    if (tabs) {
      tabs.innerHTML = STATES.map(function (s) {
        return '<button class="adw-tab" type="button" id="adw-tab-' + s.k +
               '" aria-pressed="false">' + esc(s.label) + "</button>";
      }).join("");
    }
    var cmdEl = document.getElementById("adw-cmd");
    if (cmdEl) cmdEl.textContent = CMD;

    STATES.forEach(function (s) {
      on("adw-tab-" + s.k, "click", function () { fillState(s.k); });
    });
    fillState("absent");

    var A = global.DogAdoption;
    var seq = A ? A.FIELDS : ["adopter", "cohort", "habitat", "intent"];
    seq.forEach(function (k) {
      var input = document.getElementById("adw-" + k);
      /* 真实 <input> 的 value 默认是空串、桩里是 undefined，两种都当作「未填」 */
      if (input && !input.value) input.value = DEFAULTS[k];
      on("adw-" + k, "input", refresh);
    });

    on("adw-btn-now", "click", function () {
      var c = document.getElementById("adw-cohort");
      if (c) c.value = isoNow();
      refresh();
    });
    on("adw-btn-copy", "click", function () {
      var r; try { r = global.DogAdoption.derive(fields()); } catch (e) { return; }
      copy(r.key, document.getElementById("adw-btn-copy"));
    });
    on("adw-btn-tuple", "click", function () {
      var t; try { t = global.DogAdoption.canonical(fields()); } catch (e) { return; }
      copy(t, document.getElementById("adw-btn-tuple"));
    });
    on("adw-btn-cmd", "click", function () {
      copy(CMD, document.getElementById("adw-btn-cmd"));
    });

    refresh();
    return { refresh: refresh, state: fillState };
  }

  function autoMount() {
    if (typeof document === "undefined") return;
    var el = document.getElementById("adoption-widget");
    if (!el) return;
    if (el.getAttribute && el.getAttribute("data-mounted")) return;
    if (el.setAttribute) el.setAttribute("data-mounted", "1");
    var root = (el.getAttribute && el.getAttribute("data-root")) || "";
    mount(el, { root: root });
  }

  var API = { mount: mount, STATES: STATES, DEFAULTS: DEFAULTS, PROTO_KEY: PROTO_KEY };

  global.DogAdoptionWidget = API;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading" && document.addEventListener) {
      document.addEventListener("DOMContentLoaded", autoMount);
    } else {
      autoMount();
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
