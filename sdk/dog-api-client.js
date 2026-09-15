/* ============================================================
   dog-api-client.js — DOG API 参考客户端（纯模拟实现）
   特点：
     · 不发起任何网络请求，不收集任何数据
     · 忠实还原各接口的状态码与话术，包括 Bathe 的必败语义
   兼容：浏览器（window.DogClient）与 Node（module.exports）
   ============================================================ */

(function (global) {
  "use strict";

  var DOG_RESPONSES = {
    "GET /api/walk": {
      status: 200,
      latency: 40,
      body: [
        "Expectation: RISING (no decay detected)",
        "Calls today: 7        Rate limit: none",
        "Pre-fetch triggered before request was sent.",
        "Response: 立刻站起，尾巴进入高频模式"
      ],
      note: "重复调用不衰减。历史调用越多，响应越激烈。"
    },
    "POST /api/treat": {
      status: 200,
      latency: 25,
      body: [
        "Accepted. Serving immediately.",
        "Record written to cache.",
        "Cache eviction scheduled: T+5s",
        "Response: 咀嚼中（无法回复）"
      ],
      note: "无状态零食架构：5 秒后调用记录清空，因此可无限重复且每次同样热情。"
    },
    "GET /api/who-is-a-good-boy": {
      status: 200,
      latency: 10,
      body: ["true", "", "idempotent: yes", "rate limit: none", "degradation: never observed"],
      note: "本规范中唯一恒为 true、永不降级的接口。建议高频调用，无已知副作用。"
    },
    "GET /api/comfort": {
      status: 200,
      latency: 60,
      body: [
        "Server-push. No auth required.",
        "Trigger: keeper.sadness > 0.2",
        "SLA: 100%   Failures on record: 0",
        "Response: 它已经走过来了，且没有问为什么"
      ],
      note: "唯一保证 SLA 的接口。它不追问原因，这正是它能生效的原因。"
    },
    "POST /api/bath": {
      status: 405,
      latency: 15,
      body: [
        "Method not allowed.",
        "Retried with GET    → 405",
        "Retried with PUT    → 405",
        "Retried with DELETE → 405",
        "Routing request to: 家中最小且最不可达的物理区域"
      ],
      note: "所有 method 均为 Not Allowed。此结果稳定复现，不属于偶发故障。"
    },
    "POST /api/vet": {
      status: 200,
      latency: 30,
      body: [
        "Stage 1 (本地环境): 200 OK — 愉快上车",
        "Stage 2 (目标机房): 500 Internal Server Error",
        "  tremor: full-body",
        "  tail: 低位高频（与友好无关）",
        "Archived issue: #1994"
      ],
      note: "两阶段返回不一致，属已归档问题。无修复计划。"
    },
    "GET /api/who-left": {
      status: 200,
      latency: 12,
      body: [
        "Duration parsing requested.",
        "Result: 5 minutes and 9 hours render identically.",
        "Timestamp sync precision: 0s",
        "Response: 门口那一段全速加速"
      ],
      note: "它不存在「你只离开了五分钟」这个数据结构。这是本系统最著名的能力。"
    },
    "GET /api/guilt": {
      status: 200,
      latency: 20,
      body: [
        "Appeasement protocol engaged.",
        "Trigger: keeper.tone != neutral",
        "Correlation with actual misbehavior: none",
        "Note: 被冤枉的实例，表情往往更夸张"
      ],
      note: "所谓「愧疚脸」响应的是你的语气，不是它的行为。参见 §16。"
    },
    "DELETE /api/peace": {
      status: 409,
      latency: 8,
      body: [
        "Conflict: resource (ball) requested by 2 instances.",
        "Physical middleware deployed.",
        "Resolution: 更用力地叹气",
        "Won't Fix: 叹气是本系统唯一支持的推送式消极信号"
      ],
      note: "多实例环境下的资源竞争。不升级为攻击行为。"
    }
  };

  /* ==========================================================
     量化端点（/api/v1/*）—— 不返回话术，返回真实计算结果。
     计算内核：assets/js/quantify.js（浏览器需先加载，Node 侧自动 require）
     ========================================================== */
  var QUANT = null;
  if (typeof window !== "undefined" && window.DogQuant) {
    QUANT = window.DogQuant;
  } else if (typeof require === "function") {
    try { QUANT = require("../assets/js/quantify.js"); } catch (e) { QUANT = null; }
  }

  // 控制台默认档案：一只 4 岁、12.5 kg 的绝育边牧，夏日午后
  var DEMO = {
    profile: {
      name: "示例实例", weightKg: 12.5, ageYears: 4, ageMonths: 48, birth: "2022-05-01",
      breedClass: "herding", neutered: true, coat: "double", bcs: 5, condition: "none", goal: "maintain"
    },
    env: { tempC: 34, humidityPct: 70, sun: true, acclimatedDays: 3 },
    activity: { walkMin: 40, sniffMin: 10, socialMin: 30, chewMin: 5, sleepHours: 12 },
    vet: {
      rideMinutes: 35, priorNegative: true, baselineAnxiety: false, happyVisits: false,
      muzzleTrained: false, pheromone: false, ownerTense: true, pvp: false,
      fastedForTreats: false, carWait: false
    },
    flags: {}
  };

  function runReport(client, input) {
    if (!QUANT) return null;
    input = input || {};
    var p = input.profile || DEMO.profile;
    return QUANT.evaluate(
      p,
      input.env || DEMO.env,
      input.activity || DEMO.activity,
      input.vet || DEMO.vet,
      input.flags || (client && client._triageFlags) || DEMO.flags
    );
  }

  function deriveLines(r) {
    var m = r.metrics;
    return [
      "RER        " + m.rerKcal + " kcal/日        70 × BW^0.75",
      "DER        " + m.derKcal.lo + "–" + m.derKcal.hi + " kcal/日   k = " + m.derKcal.k + "（" + m.derKcal.kLabel + "）",
      "饮水       " + m.waterMl.lo + "–" + m.waterMl.hi + " mL/日      校验式 1 mL ≈ 1 kcal",
      "运动配额   " + m.exerciseTargetMin + " min/日",
      "嗅闻配额   " + m.sniffTargetMin + " min/日       SEE 1:3（15 min 嗅闻 ≈ 45 min 奔跑）",
      "人类年龄   " + m.humanYears + " 人年           16·ln(a)+31",
      "预期寿命   " + m.lifeExpectancyYears + " 年             16.7 − 2.17·ln(BW)",
      "老年期起点 " + m.seniorAtYears + " 岁             预期寿命 × 0.75",
      "生命阶段   " + r.lifeStage.stage,
      "年体检次数 " + m.examPerYear + " 次/年"
    ];
  }

  var QUANT_RESPONSES = {
    "POST /api/v1/metrics/derive": {
      latency: 30, guarded: false,
      note: "由 profile 派生全部基础指标。体重是唯一必需输入 —— 它不可选，也不接受「大概是十几斤吧」。",
      run: function (client, input) {
        var r = runReport(client, input), m = r.metrics;
        return { status: 200, body: deriveLines(r), note: QUANT_RESPONSES["POST /api/v1/metrics/derive"].note, report: r, extra: m };
      }
    },
    "POST /api/v1/assess/daily-needs": {
      latency: 25, guarded: true,
      note: "五维加权 + 短板封顶：任一维度 <60 时总分封顶 79。",
      run: function (client, input) {
        var r = runReport(client, input), d = r.assessments.dns;
        return {
          status: 200,
          body: [
            "DNS = " + d.score + " / 100        band: " + d.band,
            "原始分 " + d.raw + "   最低维度 " + d.floor + "   capped: " + d.capped
          ].concat(d.dims.map(function (x) {
            return "  " + x.label + "  " + x.score + "/100   " + x.actual + " / " + x.target + " " + x.unit +
              "   缺口 " + x.deficit;
          })).concat([
            "规则：" + d.rule,
            "优先补齐：" + d.gap.label + "（缺口 " + d.gap.deficit + " " + d.gap.unit + "）"
          ]),
          note: QUANT_RESPONSES["POST /api/v1/assess/daily-needs"].note, report: r
        };
      }
    },
    "POST /api/v1/assess/heat-risk": {
      latency: 20, guarded: true,
      note: "HRI 为本项目定义的复合指标，不是临床量表。硬性规则：气温 ≥32 °C 或 HRI ≥10 取消户外运动。",
      run: function (client, input) {
        var r = runReport(client, input), h = r.assessments.hri;
        return {
          status: 200,
          body: [
            "HRI = " + h.score + "       band: " + h.band,
            "热调整后步行 " + r.plan.heatAdjustedWalkMin + " min/日（配额 " + r.metrics.exerciseTargetMin + " × " + h.walkFactor + "）",
            "户外可否 " + (h.outdoorAllowed ? "可以" : "禁止") + "        " + h.rule
          ].concat(h.factors.map(function (f) {
            return "  " + (f.points > 0 ? "+" : "") + f.points + "  " + f.label;
          })).concat(["地面判定：" + h.pavementTest]),
          note: QUANT_RESPONSES["POST /api/v1/assess/heat-risk"].note, report: r
        };
      }
    },
    "POST /api/v1/assess/vet-stress": {
      latency: 20, guarded: true,
      note: "分数只决定流程强度，不决定去不去。它不会因为紧张而不用看病。",
      run: function (client, input) {
        var r = runReport(client, input), v = r.assessments.vsi;
        return {
          status: 200,
          body: ["VSI = " + v.score + " / 10       band: " + v.band, "流程：" + v.note]
            .concat(v.factors.map(function (f) {
              return "  " + (f.points > 0 ? "+" : "") + f.points + "  " + f.label;
            })),
          note: QUANT_RESPONSES["POST /api/v1/assess/vet-stress"].note, report: r
        };
      }
    },
    "POST /api/v1/triage": {
      latency: 12, guarded: false,
      note: "取最高优先级，不平均。分诊错误的方向应当单调。",
      run: function (client, input) {
        var r = runReport(client, input), t = r.assessments.triage;
        return {
          status: 200,
          body: [t.code + " " + t.label, "处置：" + t.note].concat(
            t.hits.length
              ? t.hits.map(function (h) { return "  命中 " + h.priority + "  " + h.label; })
              : ["  无命中条目，按预防性排程处理"]
          ),
          note: QUANT_RESPONSES["POST /api/v1/triage"].note, report: r
        };
      }
    },
    "GET /api/v1/plan/vaccination": {
      latency: 28, guarded: false,
      note: "免疫序列由出生日期生成。MUST：末剂 DHPP 必须在 ≥16 周龄接种。",
      run: function (client, input) {
        var r = runReport(client, input);
        return {
          status: 200,
          body: r.plan.vaccine.map(function (v) {
            return (v.must ? "[MUST] " : "       ") + v.name + "  " + v.weeks + "  " + v.windowStart + " ~ " +
              v.windowEnd + "  (" + v.status + ")";
          }),
          note: QUANT_RESPONSES["GET /api/v1/plan/vaccination"].note, report: r
        };
      }
    },
    "GET /api/v1/plan/parasite": {
      latency: 22, guarded: false,
      note: "驱虫与预防排程。按体重给药这句话里，「体重」是当下体重。",
      run: function (client, input) {
        var r = runReport(client, input);
        return {
          status: 200,
          body: r.plan.parasite.map(function (p) { return p.item + "  |  " + p.freq + "  |  " + p.note; }),
          note: QUANT_RESPONSES["GET /api/v1/plan/parasite"].note, report: r
        };
      }
    }
  };

  function delay(res, ms) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (res instanceof Error) reject(res); else resolve(res);
      }, ms || 15);
    });
  }

  function quantCall(path, client, input) {
    var h = QUANT_RESPONSES[path];
    if (!h) return null;
    if (!QUANT) {
      return {
        status: 503,
        body: [
          "Quantify engine not loaded.",
          "Load assets/js/quantify.js before dog-api-client.js."
        ],
        note: "计算内核未加载。本服务不提供降级估算 —— 估算出来的数字，比没有数字更危险。"
      };
    }
    var tri = (client && client._triage) || null;
    if (tri && tri.priority <= 1 && h.guarded) {
      return {
        status: 451,
        body: [
          "VET VISIT REQUIRED",
          "Triage: " + tri.code + " " + tri.label,
          "Scoring suppressed by design.",
          "命中：" + tri.hits.map(function (x) { return x.label; }).join("；")
        ],
        note: "分诊为 P0 / P1 时所有评分端点短路。量化的第一原则，是知道什么情况下应该停止量化。"
      };
    }
    return h.run(client, input);
  }

  function makeCall(table) {
    return function (path) {
      var key = Object.keys(table).filter(function (k) {
        return k === path;
      })[0];
      if (!key) {
        return Promise.resolve({
          status: 404,
          body: ["No such endpoint in this specification."],
          note: "本规范不含该接口。若你确信应当存在，请先确认你抄的不是另一份文档。"
        });
      }
      var r = table[key];
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ status: r.status, body: r.body.slice(), note: r.note });
        }, r.latency);
      });
    };
  }

  /* ---------- 量化评分的程序化入口 ---------- */
  var ASSESS_PATHS = {
    derive: "POST /api/v1/metrics/derive",
    dailyNeeds: "POST /api/v1/assess/daily-needs",
    heatRisk: "POST /api/v1/assess/heat-risk",
    vetStress: "POST /api/v1/assess/vet-stress",
    triage: "POST /api/v1/triage",
    vaccination: "GET /api/v1/plan/vaccination",
    parasite: "GET /api/v1/plan/parasite"
  };

  function DogClient(options) {
    options = options || {};
    this.name = options.name || "你的狗";
    this._call = makeCall(DOG_RESPONSES);
    this._triage = null;
    this._triageFlags = {};
  }
  DogClient.ENDPOINTS = Object.keys(DOG_RESPONSES).map(function (k) {
    var p = k.split(" ");
    return { method: p[0], path: p[1], key: k, note: DOG_RESPONSES[k].note };
  }).concat(Object.keys(QUANT_RESPONSES).map(function (k) {
    var p = k.split(" ");
    return { method: p[0], path: p[1], key: k, note: QUANT_RESPONSES[k].note, quant: true };
  }));
  DogClient.prototype.call = function (method, path) {
    var q = quantCall(method + " " + path, this);
    if (q) return delay(q, (QUANT_RESPONSES[method + " " + path] || {}).latency);
    return this._call(method + " " + path);
  };
  DogClient.prototype.walk = function () { return this.call("GET", "/api/walk"); };
  DogClient.prototype.treat = function () { return this.call("POST", "/api/treat"); };
  DogClient.prototype.whoIsAGoodBoy = function () { return this.call("GET", "/api/who-is-a-good-boy"); };
  DogClient.prototype.comfort = function () { return this.call("GET", "/api/comfort"); };
  DogClient.prototype.bath = function () { return this.call("POST", "/api/bath"); };
  DogClient.prototype.vet = function () { return this.call("POST", "/api/vet"); };

  /**
   * 设置当前分诊状态。此后所有评分端点（guarded）都会检查它，
   * 命中 P0 / P1 时短路返回 451。
   */
  DogClient.prototype.setTriage = function (flags) {
    this._triageFlags = flags || {};
    this._triage = QUANT ? QUANT.triage(this._triageFlags) : null;
    return this._triage;
  };
  /** 程序化调用任一量化评分。input 省略时使用控制台默认档案。 */
  DogClient.prototype.assess = function (kind, input) {
    var path = ASSESS_PATHS[kind];
    if (!path) {
      return delay(new Error("Unknown assessment: " + kind + "。可用：" + Object.keys(ASSESS_PATHS).join(", ")), 0);
    }
    var q = quantCall(path, this, input);
    return delay(q, 10);
  };
  DogClient.QUANT_ENDPOINTS = Object.keys(QUANT_RESPONSES);
  DogClient.DEMO_PROFILE = DEMO;

  var api = { DogClient: DogClient };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.DogClient = DogClient; }
})(typeof window !== "undefined" ? window : this);
