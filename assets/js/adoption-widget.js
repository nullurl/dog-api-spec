/* ============================================================
   DOG API — 领养组件（首页）
   「领养」在这里只有一种形态：装技能。组件做三件事 ——
     1. 给你一条命令（里面的元组就是你填的那四行，粘上去装完，结果与本页逐字节相同）
     2. 说清授权三态：未安装 / 已安装 / 已卸载
     3. 把装完会拿到的东西先摆出来：领养 KEY + 领养名（狗名）

   名字和 KEY 都由元组派生，取名规则见 §5.3《领养名》。
   组件不检测本机装没装技能 —— 页面既没有这个权限，也没有这个必要：
   授权发生在安装那一刻，这一页只把规则和结果摆在一起。

   与 tools/adoption.html 同源，都调 assets/js/adoption-key.js。
   规范定义见 §5.3《领养与授权》（规范 ID：DOG-adoption）。

   零网络 · 零存储 · 零外链。挂载点 #adoption-widget（自动），
   或手动 DogAdoptionWidget.mount(el, { root: "../" })。
   ============================================================ */

(function (global) {
  "use strict";

  var CSS_ID = "dog-adoption-widget-css";

  /* 安装包地址。组件只把这一行印给你，它自己不取任何东西。 */
  var BASE = "https://nullurl.github.io/dog-api-spec";

  /* 与 §5.3 的默认值一致 —— 命令里只写「不是默认」的那几项，免得多余参数掩盖元组 */
  var DEFAULT_HABITAT = "~/.workbuddy/skills/dog-api-adoption";
  var DEFAULT_INTENT = "非商业个人使用";

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
    ".adw-warn{font-size:12px;color:var(--warn);line-height:1.8;margin-top:9px;}",
    ".adw-fields{display:grid;gap:9px;margin-bottom:12px;}",
    ".adw-f{display:grid;gap:3px;}",
    ".adw-f label{font-size:11.5px;color:var(--muted);}",
    ".adw-f label span{color:var(--faint);}",
    ".adw-f input{width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:6px;background:#fff;",
    "  font-family:inherit;font-size:13px;color:var(--ink);}",
    ".adw-out{background:var(--code-bg);border:1px solid var(--line);border-radius:9px;padding:13px 15px;}",
    ".adw-key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;font-weight:700;",
    "  color:var(--accent);letter-spacing:.03em;line-height:1.6;word-break:break-all;}",
    ".adw-name{font-size:21px;font-weight:700;color:var(--ink);letter-spacing:.02em;line-height:1.5;margin-top:12px;}",
    ".adw-name small{font-size:11.5px;font-weight:400;color:var(--faint);letter-spacing:.06em;margin-right:8px;}",
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
     组件的默认状态就是这一组，所以页面一打开就能看到「元组相同 → KEY 与名字相同」被实测一次。
     领养时刻是出厂值，不是此刻：要给自己领养，先按「用当前时刻」（组件会提醒）。 */
  var DEFAULTS = {
    adopter: "example@dog-api-spec",
    cohort: "2026-09-16T12:00:00Z",
    habitat: DEFAULT_HABITAT,
    intent: DEFAULT_INTENT
  };

  var PROTO_KEY = "DOG-05NA-N160-E6XJ-1TP1-54ZA-N3XS";
  var PROTO_NAME = "薄荷·边牧";

  /* 授权三态 —— 借用技能商店模型。三态之间没有过渡状态，因为系统没有一处会返回 401。 */
  var STATES = [
    {
      k: "absent", label: "未安装", tag: "未授权",
      note: "未安装即未授权。本系统不返回 <code>401</code>，所以不装也不损失什么 —— " +
            "右边那张牌与那个名字照样算得出来。授权发生在安装那一刻，不发生在这一页上。"
    },
    {
      k: "installed", label: "已安装", tag: "已授权",
      note: "安装这个动作本身就是同意，而安装就是上面那一条命令。证书由安装包写到 " +
            "<code>~/.workbuddy/dog-api/adoption.json</code> —— 位置在技能目录<strong>之外</strong>。" +
            "要卸载：把同一条命令的 <code>--uninstall</code> 给它。"
    },
    {
      k: "removed", label: "已卸载", tag: "已撤回",
      note: "卸载即撤回，中间没有第三种状态。牌删了，狗还在：撤回的是你的登记，" +
            "不是这份文档的可用性 —— 它从来没有被谁锁上过。证书也不删，卸载不撤销任何东西。"
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

  /* shell 单引号转义：值里若有单引号，写成 '\'' —— 不给命令注入留缝 */
  function shq(s) {
    return "'" + String(s == null ? "" : s).replace(/'/g, "'\\''") + "'";
  }

  function val(id) {
    var el = document.getElementById(id);
    return el && el.value != null ? String(el.value) : "";
  }

  function line(k, v) {
    return "<b>" + esc(k) + "</b>  " + esc(v) + "\n";
  }

  /* 安装命令 —— 元组直接写进参数里。粘上去装完，装出来的元组与本页预览的就是同一组，
     所以 KEY 与名字也逐字节相同：可核验不是承诺，是复制粘贴的结果。 */
  function installCmd(f, inspectable) {
    var args = [];
    if (f.adopter) args.push("--adopter " + shq(f.adopter));
    if (f.cohort) args.push("--cohort " + shq(f.cohort));
    if (f.habitat && f.habitat !== DEFAULT_HABITAT) args.push("--habitat " + shq(f.habitat));
    if (f.intent && f.intent !== DEFAULT_INTENT) args.push("--intent " + shq(f.intent));
    var tail = args.length ? " -- " + args.join(" ") : "";
    if (!inspectable) return "curl -fsSL " + BASE + "/skill/install.sh | sh -s" + tail;
    return [
      "curl -fsSL -o /tmp/dog-install.sh " + BASE + "/skill/install.sh",
      "less /tmp/dog-install.sh   # 它只有几十行，全部动作都在这里",
      "sh /tmp/dog-install.sh" + tail
    ].join("\n");
  }

  function skeleton(root) {
    return [
      '<div class="adw">',
      '  <div class="adw-panel">',
      '    <div class="adw-h"><span class="n">步骤 1</span><span class="t">安装技能 —— 这一步就是领养</span></div>',
      '    <div class="adw-tabs" id="adw-tabs"></div>',
      '    <div class="adw-cmd" id="adw-cmd"></div>',
      '    <div class="adw-warn" id="adw-warn"></div>',
      '    <div class="adw-row">',
      '      <button class="btn" type="button" id="adw-btn-cmd">复制安装命令</button>',
      '      <button class="btn ghost" type="button" id="adw-btn-inspect">复制「先看一遍」的版本</button>',
      '    </div>',
      '    <div class="adw-note" id="adw-note"></div>',
      '  </div>',
      '  <div class="adw-panel">',
      '    <div class="adw-h"><span class="n">步骤 2</span><span class="t">装完你会拿到什么</span></div>',
      '    <div class="adw-fields">',
      '      <div class="adw-f"><label for="adw-adopter">领养人 <span>adopter · 可填写</span></label>',
      '        <input id="adw-adopter" type="text" spellcheck="false"></div>',
      '      <div class="adw-f"><label for="adw-cohort">领养时刻 <span>cohort · UTC 秒精度</span></label>',
      '        <input id="adw-cohort" type="text" spellcheck="false"></div>',
      '      <div class="adw-f"><label for="adw-habitat">栖息地 <span>habitat · 技能安装目录</span></label>',
      '        <input id="adw-habitat" type="text" spellcheck="false"></div>',
      '      <div class="adw-f"><label for="adw-intent">声明用途 <span>intent · 只进摘要</span></label>',
      '        <input id="adw-intent" type="text" spellcheck="false"></div>',
      '    </div>',
      '    <div class="adw-out">',
      '      <div class="adw-lines" id="adw-lines"></div>',
      '      <div class="adw-key" id="adw-key"></div>',
      '      <div class="adw-name" id="adw-name"></div>',
      '    </div>',
      '    <div class="adw-row">',
      '      <button class="btn ghost" type="button" id="adw-btn-now">用当前时刻</button>',
      '      <button class="btn" type="button" id="adw-btn-copy">复制 KEY</button>',
      '      <button class="btn ghost" type="button" id="adw-btn-name">复制狗名</button>',
      '      <button class="btn ghost" type="button" id="adw-btn-tuple">复制元组</button>',
      '    </div>',
      '    <div class="adw-check" id="adw-check"></div>',
      '  </div>',
      '  <div class="adw-foot">',
      '    领养在这里只有一种形态：装技能。命令里已经带上你填的元组，所以装完算出来的 KEY 与名字' +
        '与本页逐字节相同 —— 可核验不是承诺，是复制粘贴的结果。组件不检测你的机器：' +
        '上面那一栏是技能商店模型，不是状态探针。KEY 不是发放的，是派生的：元组相同就逐字节相同，' +
        '没有发号中心，所以也没有「找回」与「挂失」。它不授予任何权限，也不是秘密 —— ' +
        '领养时刻本来就写在载荷里。名字同源派生、不进载荷：光凭一张牌算不出名字。',
      '    <br>定义见 <a href="' + root + 'spec/dog.html#adoption">§5.3《领养与授权》（规范 ID <code>DOG-adoption</code>）</a>，',
      '    完整工具在 <a href="' + root + 'tools/adoption.html">领养入口</a>，',
      '    安装包是 <code>skill/install.sh</code>，命令行实现是 <code>skill/dog_adopt.py</code> ——',
      '    三处同源，判据是 §5.3 的固定测试向量。',
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
    var nameEl = document.getElementById("adw-name");
    var checkEl = document.getElementById("adw-check");
    var cmdEl = document.getElementById("adw-cmd");
    var warnEl = document.getElementById("adw-warn");
    if (!A || !keyEl) return;
    var f = fields(), r;
    try {
      r = A.derive(f);
    } catch (e) {
      keyEl.innerHTML = '<span class="adw-bad">' + esc(e.message) + "</span>";
      if (linesEl) linesEl.innerHTML = "";
      if (nameEl) nameEl.innerHTML = "";
      if (checkEl) checkEl.innerHTML = "";
      return;
    }
    if (cmdEl) cmdEl.textContent = installCmd(f, false);
    if (warnEl) {
      warnEl.innerHTML = f.cohort === DEFAULTS.cohort
        ? "⚠ 领养时刻还是出厂值 —— 这一组是用来与 §5.3 测试向量对照的。" +
          "要给自己领养，先按「用当前时刻」。"
        : "";
    }
    if (linesEl) {
      linesEl.innerHTML =
        line("领养人", f.adopter) +
        line("领养时刻", r.cohort) +
        line("栖息地", f.habitat) +
        line("声明用途", f.intent);
    }
    keyEl.textContent = r.key;
    if (nameEl) {
      nameEl.innerHTML = '<small>领养名</small>' + esc(r.name) +
        '<small style="margin-left:10px;">名表 #' + r.givenIndex + " · 犬种表 #" + r.breedIndex + "</small>";
    }
    if (checkEl) {
      var same = r.key === PROTO_KEY && r.name === PROTO_NAME;
      checkEl.innerHTML = same
        ? '<span class="adw-ok">✓ 与 §5.3 测试向量 1 逐字节一致（KEY 与名字）。</span>' +
          '<span class="adw-mut"> 出厂元组算出的就是这一张、这一个名字 —— 同一个元组，两台机器，' +
          '两个实现，同一个数。</span>'
        : '<span class="adw-mut">与 §5.3 测试向量 1 不同 —— 那一组用的是出厂元组，你改过了。' +
          '这不是错误：改动任何一项，KEY 与名字都会变；同一秒内改一个字也一样。</span>';
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
    on("adw-btn-name", "click", function () {
      var r; try { r = global.DogAdoption.derive(fields()); } catch (e) { return; }
      copy(r.name, document.getElementById("adw-btn-name"));
    });
    on("adw-btn-tuple", "click", function () {
      var t; try { t = global.DogAdoption.canonical(fields()); } catch (e) { return; }
      copy(t, document.getElementById("adw-btn-tuple"));
    });
    on("adw-btn-cmd", "click", function () {
      copy(installCmd(fields(), false), document.getElementById("adw-btn-cmd"));
    });
    on("adw-btn-inspect", "click", function () {
      copy(installCmd(fields(), true), document.getElementById("adw-btn-inspect"));
    });

    refresh();
    return { refresh: refresh, state: fillState, cmd: installCmd };
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

  var API = {
    mount: mount, STATES: STATES, DEFAULTS: DEFAULTS,
    PROTO_KEY: PROTO_KEY, PROTO_NAME: PROTO_NAME,
    BASE: BASE, installCmd: installCmd
  };

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
