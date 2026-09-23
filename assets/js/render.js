/* ============================================================
   DOG API — 共享渲染器
   职责：注入顶部导航、侧栏目录、正文；处理章内定位与对照高亮
   用法见各页面底部 <script>SpecSite.render({...})</script>
   ============================================================ */

window.SpecSite = (function () {
  /* 文档修订号 —— 全站唯一事实源。
     它记录的是这份规范文本的编辑状态，与正文《生命周期》章描述的系统运行版本无关。
     改这里之前请先读 docs/CONTRIBUTING.md 的修订约定：版本号要与 CHANGELOG 的条目同时改。 */
  const VERSION = "0.27";

  const NAV = [
    { key: "home", label: "首页", href: "index.html" },
    { key: "versions", label: "历史版本", href: "versions.html" },
    { key: "dog", label: "DOG API", href: "spec/dog.html" },
    { key: "cheatsheet", label: "速查卡", href: "reference/cheatsheet.html" },
    { key: "vitals", label: "生理指标", href: "reference/vitals.html" },
    { key: "errors", label: "错误码", href: "reference/errors.html" },
    { key: "glossary", label: "术语表", href: "reference/glossary.html" },
    { key: "voice", label: "口吻与文体", href: "reference/voice.html" },
    { key: "opinions", label: "生活意见", href: "reference/opinions.html" },
    { key: "adoption", label: "领养", href: "tools/adoption.html" },
    { key: "quantifier", label: "量化评估器", href: "tools/quantifier.html" },
    { key: "expression", label: "表情渲染器", href: "tools/expression.html" },
    { key: "charts", label: "图表图鉴", href: "tools/charts.html" },
    { key: "peripherals", label: "外设总线", href: "tools/peripherals.html" },
    { key: "cyberwalk", label: "赛博遛狗", href: "tools/cyber-walk.html" },
    { key: "astraflow", label: "星图接入", href: "tools/astraflow.html" },
    { key: "crosspet", label: "跨站串门", href: "tools/crosspet.html" },
    { key: "sdk", label: "SDK 控制台", href: "sdk/demo.html" }
  ];

  function topbar(root, activeKey) {
    const links = NAV.map(function (n) {
      const on = n.key === activeKey ? ' class="on"' : "";
      return '<a href="' + root + n.href + '"' + on + ">" + n.label + "</a>";
    }).join("");
    return (
      '<div class="topbar"><div class="topbar-inner">' +
      '<a class="brand" href="' + root + 'index.html">DOG API<span> / 狗狗接口规范</span></a>' +
      '<nav class="topnav">' + links + "</nav>" +
      "</div></div>"
    );
  }

  /* 章节标号。数据里有 parts 时用 §X.Y（PART 序号 . 组内序号）；
     没有 parts 时退回两位全局编号 —— 旧布局的数据仍要能渲染。
     注意：标号是**派生**的，不是身份。跨版本引用请用章节的 id（规范 ID），不要用标号。 */
  function labels(chapters, parts) {
    if (!parts || !parts.length) {
      return chapters.map(function (_, i) {
        return String(i).padStart(2, "0");
      });
    }
    const seen = {};
    return chapters.map(function (s) {
      const p = typeof s.part === "number" ? s.part : 0;
      seen[p] = (seen[p] || 0) + 1;
      return p + 1 + "." + seen[p];
    });
  }

  function appendixLabels(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      // A..Z, 然后是 AA..
      let n = i, s = "";
      do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      out.push(s);
    }
    return out;
  }

  function render(cfg) {
    const root = cfg.root != null ? cfg.root : "";
    const doc = cfg.data;
    const appendix = cfg.appendices || [];
    const chapters = doc.sections || [];
    const parts = doc.parts || [];
    const chapterNo = labels(chapters, parts);
    const appendixNo = appendixLabels(appendix.length);
    const partOf = function (s) {
      return typeof s.part === "number" ? s.part : 0;
    };

    // 顶部导航
    const bar = document.createElement("div");
    bar.innerHTML = topbar(root, cfg.active);
    document.body.insertBefore(bar.firstChild, document.body.firstChild);

    // 侧栏
    const side = document.getElementById("sidebar");
    if (side) {
      let chLinks = "";
      let curPart = -1;
      chapters.forEach(function (s, i) {
        const p = partOf(s);
        if (parts.length && p !== curPart) {
          const pt = parts[p] || {};
          chLinks +=
            '<div class="nav-label">PART ' + (pt.roman || p + 1) +
            (pt.title ? " · " + pt.title : "") + "</div>";
          curPart = p;
        }
        chLinks +=
          '<a href="#' + s.id + '" data-sec="' + s.id + '">' + chapterNo[i] +
          "&nbsp; " + s.title + "</a>";
      });
      const apLinks = appendix.length
        ? '<div class="nav-label">Appendices</div>' +
          appendix
            .map(function (s, i) {
              return '<a href="#' + s.id + '" data-sec="' + s.id + '">附录 ' + appendixNo[i] + " · " + s.title + "</a>";
            })
            .join("")
        : "";
      side.innerHTML =
        '<div class="doc-name">' + doc.title + "</div>" +
        '<div class="doc-sub">' + (cfg.sideSubtitle || "接口规范") + "</div>" +
        '<nav>' + chLinks + apLinks + "</nav>";
    }

    // 正文
    const main = document.getElementById("content");
    const heading = cfg.heading || doc.heading || doc.title + " — 接口规范";

    // 每一章前面按其 PART 插一条分隔标题（同一 PART 只插一次）
    let chapterHtml = "";
    let lastPart = -1;
    chapters.forEach(function (s, i) {
      const p = partOf(s);
      if (parts.length && p !== lastPart) {
        const pt = parts[p] || {};
        chapterHtml +=
          '<div class="part-head"><span class="part-roman">PART ' + (pt.roman || p + 1) + "</span>" +
          '<span class="part-title">' + (pt.title || "") + "</span>" +
          (pt.note ? '<span class="part-note">' + pt.note + "</span>" : "") +
          "</div>";
        lastPart = p;
      }
      chapterHtml +=
        '<section id="' + s.id + '"><h2><span class="sec-no">§' + chapterNo[i] + "</span>" +
        s.title + "</h2>" + s.html + "</section>";
    });

    const body =
      '<span class="doc-tag">' + doc.tag + "</span>" +
      "<h1>" + heading + "</h1>" +
      '<div class="subtitle">' + doc.subtitle + "</div>" +
      (cfg.frontMatter || "") +
      chapterHtml +
      appendix
        .map(function (s, i) {
          return (
            '<section id="' + s.id + '"><h2><span class="sec-no">附录 ' + appendixNo[i] + "</span>" +
            s.title + "</h2>" + s.html + "</section>"
          );
        })
        .join("") +
      '<hr class="divider"><div class="end-note">' + (cfg.endNote || "") + "</div>";
    main.innerHTML = body;

    // 侧栏高亮（滚动定位）
    const links = Array.prototype.slice.call(document.querySelectorAll("aside nav a[data-sec]"));
    const sections = Array.prototype.slice.call(document.querySelectorAll("section[id]"));
    if (sections.length) {
      const obs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            links.forEach(function (l) {
              l.classList.toggle("active", l.getAttribute("data-sec") === e.target.id);
            });
          });
        },
        { rootMargin: "-64px 0px -72% 0px", threshold: 0 }
      );
      sections.forEach(function (s) { obs.observe(s); });
    }

    // hash 定位
    if (location.hash.length > 1) {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) el.scrollIntoView();
    }
  }

  function mountChrome(cfg) {
    const root = cfg && cfg.root != null ? cfg.root : "";
    const bar = document.createElement("div");
    bar.innerHTML = topbar(root, cfg && cfg.active);
    document.body.insertBefore(bar.firstChild, document.body.firstChild);
  }

  return { render: render, mountChrome: mountChrome, NAV: NAV, VERSION: VERSION };
})();
