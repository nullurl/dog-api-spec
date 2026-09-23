/*!
 * crosspet-local.js — CrossPet Protocol 的本地客户端（零依赖）
 *
 * 本站的「零构建」铁律里，页面不引 CDN、不发请求。别人的 crosspet.js 靠
 * cdn.jsdelivr.net 上的 supabase-js 联网，那份依赖本站不接。
 *
 * 本文件只用浏览器原生的 WebSocket 直连 Supabase Realtime（Phoenix 协议），
 * 不引任何第三方脚本、不发 REST 请求。协议细节见正文《跨站接口》§3.10。
 * 代价是本站从此多了一个会出网的页面（另一个是 tools/astraflow.html），
 * 这条例外记在 docs/CONTRIBUTING.md。
 *
 * 对外：window.CrossPetLocal（纯函数与控制器都挂在这里，便于自检与断言）
 */
(function (root) {
  "use strict";

  var VERSION = "0.26";

  /* 公共频道。零认证 —— 谁都能进，所以进来的东西一律按不可信处理。 */
  var DEFAULTS = {
    url: "https://mpkcvkqiimxhrlsvjasr.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wa2N2a3FpaW14aHJsc3ZqYXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMjM0NDUsImV4cCI6MjEwNTY5OTQ0NX0.hlBwvAf2np3UXOE8PiKJ7OLeIXUMu-r0f2V9wWYPOkA",
    channel: "crosspet-global",
    vsn: "1.0.0"
  };

  /* 本页自选的常数。没有一处来自实测协议 —— 全部标 HEURISTIC。 */
  var HEURISTIC = {
    heartbeatMs: 25000,      // 心跳间隔
    backoffSec: [1, 2, 4, 8, 16, 30],  // 重连退避
    maxRetry: 6,             // 连续失败到这个数就回落到演示模式
    maxSvgBytes: 12000,      // 单只宠物造型的上限
    maxNameLen: 24,
    maxSiteLen: 80,
    visitTtlMs: 90000        // 接待一位客人多久后请它走
  };

  /* ------------------------------------------------------------------ *
   * 一、纯函数：不碰 DOM、不碰网络，可以单独断言
   * ------------------------------------------------------------------ */

  /** 由项目地址拼出 Realtime 的 WebSocket 端点。http→ws，https→wss。 */
  function wsEndpoint(url, key, vsn) {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) return null;
    if (typeof key !== "string" || !key) return null;
    var base = url.replace(/^http/, "ws").replace(/\/+$/, "");
    return base + "/realtime/v1/websocket?apikey=" + encodeURIComponent(key) +
           "&vsn=" + (vsn || "1.0.0");
  }

  function frame(topic, event, payload, ref) {
    return JSON.stringify({ topic: topic, event: event, payload: payload, ref: String(ref) });
  }

  function joinFrame(channel, ref) {
    return frame("realtime:" + channel, "phx_join", {
      config: {
        broadcast: { ack: false, self: true },  // self:true 才能收到自己发的，便于回环自检
        presence: { key: "" },
        postgres_changes: []
      }
    }, ref);
  }

  function broadcastFrame(channel, event, payload, ref) {
    return frame("realtime:" + channel, "broadcast", {
      type: "broadcast", event: event, payload: payload
    }, ref);
  }

  function heartbeatFrame(ref) {
    return frame("phoenix", "heartbeat", {}, ref);
  }

  function parseFrame(text) {
    if (typeof text !== "string" || !text) return null;
    try {
      var o = JSON.parse(text);
      return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
  }

  /** 把收到的一帧归类。返回 {kind} —— kind 取 reply / heartbeat / broadcast / system / ignore。 */
  function routeFrame(msg) {
    if (!msg || typeof msg !== "object") return { kind: "ignore" };
    var ev = msg.event, p = msg.payload || {};
    if (ev === "phx_reply") {
      if (msg.topic === "phoenix") return { kind: "heartbeat", ok: p.status === "ok" };
      return { kind: "reply", ok: p.status === "ok", topic: msg.topic };
    }
    if (ev === "broadcast") {
      return { kind: "broadcast", event: p.event, payload: p.payload || {} };
    }
    if (ev === "system" || ev === "phx_error" || ev === "phx_close") {
      return { kind: "system", event: ev };
    }
    return { kind: "ignore" };
  }

  /*
   * 净化别站送来的造型。频道是公共的，进来的 SVG 一律当不可信：
   * 去掉可执行元素、事件属性、一切链接属性。只留形状。
   */
  var DANGER_TAGS = "script|foreignObject|iframe|object|embed|use|animate|animateMotion|animateTransform|set|handler";
  function sanitizeSvg(svg) {
    if (typeof svg !== "string") return "";
    var s = svg.slice(0, HEURISTIC.maxSvgBytes);
    // 成对元素：连内容一起删
    s = s.replace(new RegExp("<\\s*(" + DANGER_TAGS + ")\\b[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>", "gi"), "");
    // 自闭合或未闭合的：删开标签
    s = s.replace(new RegExp("<\\s*(" + DANGER_TAGS + ")\\b[^>]*\\/?>", "gi"), "");
    // 残留的闭标签
    s = s.replace(new RegExp("<\\s*\\/\\s*(" + DANGER_TAGS + ")\\s*>", "gi"), "");
    // 事件属性
    s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // 链接属性（href / xlink:href）
    s = s.replace(/\s(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // 协议
    s = s.replace(/javascript\s*:/gi, "");
    return s.trim();
  }

  /**
   * 审查一位来客。返回 {accept, reason, visitor}。
   * 规则只有三条：不是自己发的、带了 petType、名字与造型能过净化。
   */
  function inspectVisitor(payload, selfSiteId) {
    if (!payload || typeof payload !== "object") return { accept: false, reason: "载荷为空" };
    if (typeof payload.fromSiteId === "string" && selfSiteId &&
        payload.fromSiteId === selfSiteId) {
      return { accept: false, reason: "本站自己发出的" };
    }
    if (typeof payload.petType !== "string" || !payload.petType) {
      return { accept: false, reason: "缺 petType" };
    }
    var rawName = (typeof payload.petName === "string") ? payload.petName.trim() : "";
    var visitor = {
      petType: payload.petType.slice(0, 16),
      petName: (rawName || "一只没有署名的动物").slice(0, HEURISTIC.maxNameLen),
      // 先净化再定框：进来的造型一律按不可信处理，且必须带外框，否则嵌进 <g> 会撑满舞台
      petSVG: fitSvg(sanitizeSvg(payload.petSVG)),
      fromSite: (typeof payload.fromSite === "string" ? payload.fromSite : "").slice(0, HEURISTIC.maxSiteLen),
      direction: (typeof payload.direction === "string" ? payload.direction : "right"),
      ts: (typeof payload.ts === "number" && isFinite(payload.ts)) ? payload.ts : 0
    };
    return { accept: true, reason: "ok", visitor: visitor };
  }

  /** 重连退避。attempt 从 1 开始；rnd 用来在测试里固定抖动。 */
  function backoffDelay(attempt, rnd) {
    var tbl = HEURISTIC.backoffSec;
    var i = Math.max(0, Math.min(tbl.length - 1, (attempt | 0) - 1));
    var f = (typeof rnd === "number") ? rnd : Math.random();
    f = Math.max(0, Math.min(1, f));
    return Math.round(tbl[i] * 1000 * (0.5 + f * 0.5));
  }

  /** FNV-1a 32 位。用来把站点 ID 确定性地折成一只狗。 */
  function hash32(s) {
    var h = 2166136261 >>> 0;
    var str = String(s);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* 出厂造型：同一个种子永远得到同一只。没有种子就只能随机。 */
  var COATS = ["#b45309", "#8b5e34", "#a16207", "#7c2d12", "#57534e"];
  var BUILDS = ["lean", "stout", "tall"];
  var TAILS = ["curl", "straight", "flag"];
  function dogSvg(seed) {
    var h = hash32(seed == null ? "dog" : seed);
    var coat = COATS[(h >>> 0) % COATS.length];
    var build = BUILDS[(h >>> 5) % BUILDS.length];
    var tail = TAILS[(h >>> 11) % TAILS.length];
    var bodyY = build === "tall" ? 30 : (build === "stout" ? 40 : 35);
    var bodyH = build === "stout" ? 26 : 21;
    var tailPath = tail === "curl"
      ? "M32 40 q-12 -2 -12 -10 q0 -6 6 -6"
      : (tail === "flag" ? "M32 40 q-14 -8 -18 -2" : "M32 40 l-14 -4");
    // width/height 必须写死：嵌进别人的 <g> 里时，没有这两个属性的 <svg> 会撑满整个视口
    return '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="84" viewBox="0 0 120 84">' +
      '<g fill="' + coat + '">' +
      '<rect x="30" y="' + bodyY + '" width="54" height="' + bodyH + '" rx="11"/>' +
      '<rect x="74" y="' + (bodyY - 14) + '" width="27" height="23" rx="10"/>' +
      '<rect x="38" y="' + (bodyY + bodyH - 4) + '" width="8" height="20" rx="3"/>' +
      '<rect x="68" y="' + (bodyY + bodyH - 4) + '" width="8" height="20" rx="3"/>' +
      '</g>' +
      '<path d="' + tailPath + '" fill="none" stroke="' + coat + '" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="95" cy="' + (bodyY - 4) + '" r="2.2" fill="#1a1a1a"/>' +
      '</svg>';
  }

  /**
   * 给 SVG 定死外框尺寸，按 viewBox 等比缩到 boxW×boxH 之内。
   * 别站的造型多半只写了 viewBox，直接嵌进 <g> 会撑满舞台 —— 所以进来的一律先过这一步。
   */
  function fitSvg(svg, boxW, boxH) {
    if (typeof svg !== "string" || !svg) return "";
    boxW = boxW || 120; boxH = boxH || 84;
    var head = svg.match(/<svg\b[^>]*>/i);
    if (!head) return "";
    var vb = head[0].match(/viewBox\s*=\s*["']\s*([-0-9.]+)[\s,]+([-0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i);
    var w = boxW, h = boxH;
    if (vb) {
      var vw = parseFloat(vb[3]), vh = parseFloat(vb[4]);
      if (vw > 0 && vh > 0) {
        var s = Math.min(boxW / vw, boxH / vh);
        w = Math.round(vw * s * 100) / 100;
        h = Math.round(vh * s * 100) / 100;
      }
    }
    var clean = head[0].replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    clean = clean.replace(/<svg/i, '<svg width="' + w + '" height="' + h + '"');
    return svg.replace(head[0], clean);
  }

  /* ------------------------------------------------------------------ *
   * 二、控制器：状态机 idle → connecting → live，失败退到 demo
   * ------------------------------------------------------------------ */

  /**
   * create({url,key,channel,petType,petName,petSVG,siteId,on})
   * on 可用：state(状态名, 说明) / live() / arrive(visitor) / meet(payload) /
   *          depart(direction) / gone(visitor) / log(text)
   */
  function create(opts) {
    opts = opts || {};
    var cfg = {
      url: opts.url || DEFAULTS.url,
      key: opts.key || DEFAULTS.key,
      channel: opts.channel || DEFAULTS.channel,
      vsn: opts.vsn || DEFAULTS.vsn,
      petType: opts.petType || "dog",
      petName: opts.petName || "一只狗",
      petSVG: opts.petSVG || "",
      // fromSite 要随 cfg 一起留住：depart() 的载荷从 cfg 里取，漏在这儿就等于本站宠物没有来处
      fromSite: opts.fromSite || "",
      siteId: opts.siteId || ("site-" + hash32(String(Math.random())).toString(36))
    };
    var on = opts.on || {};
    function emit(k, a, b) {
      if (typeof on[k] === "function") { try { on[k](a, b); } catch (e) {} }
    }

    var ws = null;
    var ref = 0;
    var hbTimer = null;
    var retryTimer = null;
    var running = false;
    var attempt = 0;
    var joined = false;
    var state = "idle";

    function nextRef() { return ++ref; }

    function setState(s, note) {
      state = s;
      emit("state", s, note || "");
    }

    function stopHeartbeat() {
      if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    }
    function startHeartbeat() {
      stopHeartbeat();
      hbTimer = setInterval(function () {
        if (ws && joined) {
          try { ws.send(heartbeatFrame(nextRef())); } catch (e) {}
        }
      }, HEURISTIC.heartbeatMs);
    }

    function handleMessage(raw) {
      var routed = routeFrame(parseFrame(raw));
      if (routed.kind === "heartbeat") return;
      if (routed.kind === "reply") {
        if (routed.ok) {
          joined = true;
          attempt = 0;
          setState("live", "已接入 " + cfg.channel);
          startHeartbeat();
          emit("live");
        } else {
          emit("log", "加入频道被拒：" + (routed.topic || ""));
        }
        return;
      }
      if (routed.kind === "broadcast") {
        if (routed.event === "pet_depart") {
          var verdict = inspectVisitor(routed.payload, cfg.siteId);
          if (verdict.accept) emit("arrive", verdict.visitor);
          else emit("log", "略过一条广播：" + verdict.reason);
        } else if (routed.event === "pet_meet") {
          emit("meet", routed.payload);
        } else {
          emit("log", "未知事件：" + routed.event);
        }
        return;
      }
      if (routed.kind === "system") emit("log", "频道事件：" + routed.event);
    }

    function scheduleRetry() {
      if (!running) return;
      attempt++;
      if (attempt > HEURISTIC.maxRetry) {
        setState("demo", "连不上，改用演示模式");
        return;
      }
      var wait = backoffDelay(attempt);
      emit("log", "第 " + attempt + " 次重连，等 " + Math.round(wait / 1000) + " 秒");
      retryTimer = setTimeout(function () { open(); }, wait);
    }

    function open() {
      if (!running) return;
      var ep = wsEndpoint(cfg.url, cfg.key, cfg.vsn);
      if (!ep || typeof root.WebSocket !== "function") {
        setState("demo", ep ? "这台机器没有 WebSocket" : "端点不合法");
        return;
      }
      setState("connecting");
      try { ws = new root.WebSocket(ep); }
      catch (e) { setState("demo", "建连失败"); return; }

      ws.onopen = function () {
        emit("log", "WebSocket 已连上");
        try { ws.send(joinFrame(cfg.channel, nextRef())); } catch (e) {}
      };
      ws.onmessage = function (ev) { handleMessage(ev && ev.data); };
      ws.onerror = function () { emit("log", "连接出错"); };
      ws.onclose = function () {
        joined = false;
        stopHeartbeat();
        if (running) scheduleRetry();
      };
    }

    return {
      cfg: cfg,
      getState: function () { return state; },
      isLive: function () { return state === "live"; },
      connect: function () {
        if (running) return;
        running = true;
        attempt = 0;
        open();
      },
      /** 送自己的宠物出门 */
      depart: function (direction) {
        var dir = direction || (Math.random() < 0.5 ? "left" : "right");
        emit("depart", dir);
        if (!joined || !ws) {
          emit("log", state === "demo" ? "演示模式：没有真的送出去" : "还没接上，没送出去");
          return false;
        }
        var payload = {
          petType: cfg.petType,
          petName: cfg.petName,
          petSVG: cfg.petSVG,
          fromSite: cfg.fromSite || "",
          fromSiteId: cfg.siteId,
          direction: dir,
          ts: Date.now()
        };
        try { ws.send(broadcastFrame(cfg.channel, "pet_depart", payload, nextRef())); }
        catch (e) { emit("log", "发送失败"); return false; }
        return true;
      },
      close: function () {
        running = false;
        joined = false;
        stopHeartbeat();
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        try { if (ws) ws.close(); } catch (e) {}
        ws = null;
        setState("closed");
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 三、自检：页面把结果挂到标题上，夹具也直接调它
   * ------------------------------------------------------------------ */
  function selftest() {
    var items = [];
    function t(name, actual, expect) {
      var ok = JSON.stringify(actual) === JSON.stringify(expect);
      items.push({ name: name, ok: ok, actual: actual, expect: expect });
    }

    var ep = wsEndpoint("https://abc.supabase.co", "K1", "1.0.0");
    t("端点 http→ws", wsEndpoint("http://x.io", "k", "1.0.0").indexOf("ws://x.io") === 0, true);
    t("端点 https→wss", ep.indexOf("wss://abc.supabase.co/realtime/v1/websocket?") === 0, true);
    t("端点带 apikey 与 vsn", /apikey=K1&vsn=1\.0\.0$/.test(ep), true);
    t("端点拒绝非法地址", wsEndpoint("abc", "k", "1"), null);
    t("端点拒绝空 KEY", wsEndpoint("https://a.co", "", "1"), null);

    var jf = JSON.parse(joinFrame("crosspet-global", 1));
    t("join 帧主题", jf.topic, "realtime:crosspet-global");
    t("join 帧事件", jf.event, "phx_join");
    t("join 帧 self 为真", jf.payload.config.broadcast.self, true);

    var bf = JSON.parse(broadcastFrame("crosspet-global", "pet_depart", { a: 1 }, 2));
    t("广播帧类型", bf.payload.type, "broadcast");
    t("广播帧事件", bf.payload.event, "pet_depart");
    t("广播帧载荷透传", bf.payload.payload, { a: 1 });

    t("心跳帧主题", JSON.parse(heartbeatFrame(3)).topic, "phoenix");
    t("解析坏 JSON 返回空", parseFrame("{oops"), null);
    t("解析非字符串返回空", parseFrame(42), null);
    t("归类心跳回执", routeFrame({ event: "phx_reply", topic: "phoenix", payload: { status: "ok" } }).kind, "heartbeat");
    t("归类加入回执", routeFrame({ event: "phx_reply", topic: "realtime:x", payload: { status: "ok" } }).ok, true);
    t("归类广播", routeFrame({ event: "broadcast", payload: { event: "pet_meet", payload: {} } }).event, "pet_meet");
    t("归类系统消息", routeFrame({ event: "phx_error", payload: {} }).kind, "system");
    t("归类垃圾帧", routeFrame(null).kind, "ignore");

    t("净化去 script", sanitizeSvg('<svg><script>alert(1)</script><circle r="1"/></svg>').indexOf("script") < 0, true);
    t("净化去事件属性", sanitizeSvg('<svg><circle onload="x=1" r="1"/></svg>').indexOf("onload") < 0, true);
    t("净化去 href", sanitizeSvg('<svg><a href="javascript:x">a</a></svg>').indexOf("href") < 0, true);
    t("净化保留形状", sanitizeSvg('<svg><circle r="1"/></svg>').indexOf('<circle r="1"/>') > 0, true);

    t("回绝自己发的", inspectVisitor({ petType: "dog", fromSiteId: "me" }, "me").accept, false);
    t("回绝无 petType", inspectVisitor({ petName: "x" }, "me").accept, false);
    t("接待正常的", inspectVisitor({ petType: "dog", petName: "阿黄", fromSiteId: "other" }, "me").accept, true);
    t("匿名来客有兜底名", inspectVisitor({ petType: "dog" }, "me").visitor.petName.length > 0, true);
    t("名字截断", inspectVisitor({ petType: "dog", petName: "一二三四五六七八九十一二三四五六七八九十一二三四五六" }, "me").visitor.petName.length, HEURISTIC.maxNameLen);

    t("退避第一档", backoffDelay(1, 1), 1000);
    t("退避封顶", backoffDelay(99, 1), 30000);
    t("退避有抖动", backoffDelay(1, 0), 500);

    // 配置透传：depart() 的载荷全从 cfg 取，构造时漏抄任何一个字段都会静默丢数据
    t("配置留住来源站（没给就是空串）",
      [create({ fromSite: "本站" }).cfg.fromSite, create({}).cfg.fromSite], ["本站", ""]);

    t("造型同种子一致", dogSvg("a") === dogSvg("a"), true);
    t("造型异种子有别", dogSvg("a") !== dogSvg("b"), true);
    t("造型是合法 svg", dogSvg("a").indexOf("<svg ") === 0, true);
    t("造型自带外框", /\swidth="120"\sheight="84"/.test(dogSvg("a")), true);

    t("补框：无宽高时按 viewBox 等比", fitSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 84"></svg>'),
      '<svg width="120" height="42" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 84"></svg>');
    t("补框：方图取小边", fitSvg('<svg viewBox="0 0 100 100"></svg>'),
      '<svg width="84" height="84" viewBox="0 0 100 100"></svg>');
    t("补框：不叠加原有宽高", fitSvg('<svg width="9" height="9" viewBox="0 0 120 84"></svg>'),
      '<svg width="120" height="84" viewBox="0 0 120 84"></svg>');
    t("补框：非 svg 返回空", fitSvg("hello"), "");
    t("补框：空输入返回空", fitSvg(null), "");

    var pass = 0;
    for (var i = 0; i < items.length; i++) if (items[i].ok) pass++;
    return { total: items.length, pass: pass, items: items };
  }

  root.CrossPetLocal = {
    VERSION: VERSION,
    DEFAULTS: DEFAULTS,
    HEURISTIC: HEURISTIC,
    wsEndpoint: wsEndpoint,
    joinFrame: joinFrame,
    broadcastFrame: broadcastFrame,
    heartbeatFrame: heartbeatFrame,
    parseFrame: parseFrame,
    routeFrame: routeFrame,
    sanitizeSvg: sanitizeSvg,
    fitSvg: fitSvg,
    inspectVisitor: inspectVisitor,
    backoffDelay: backoffDelay,
    hash32: hash32,
    dogSvg: dogSvg,
    create: create,
    selftest: selftest
  };
})(typeof window !== "undefined" ? window : this);
