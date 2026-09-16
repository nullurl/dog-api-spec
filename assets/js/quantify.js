/* ============================================================
   DOG API — DOG API 量化引擎 (v1)
   ------------------------------------------------------------
   本文件是「可量化方案」的计算内核，被以下三处共用：
     - tools/quantifier.html   交互式评估器
     - sdk/dog-api-client.js   模拟 SDK 的 assess.* 端点
     - 校验脚本                公式一致性断言

   设计约束（与 §4.5 量化接口定义 对应）：
     1. 每个参数必须有 单位 / 取值范围 / 来源等级 / 采样频率 / 报警阈值
     2. 来源等级：
        A = 同行评议文献或大规模实测数据
        B = 临床指南或专业机构共识
        C = 社区经验 (heuristic) 或本项目定义的复合指标
     3. 复合指标（DNS / HRI / VSI）一律标记 C 级并注明「偏差提示，非诊断」
     4. 任何 P0/P1 分诊结果使所有评分接口短路（见 evaluate() 的 shortCircuit）
   ============================================================ */

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DogQuant = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  /* ==========================================================
     0. 通用工具
     ========================================================== */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round(v, d) {
    var m = Math.pow(10, d == null ? 1 : d);
    return Math.round(v * m) / m;
  }
  function band(value, table) {
    // table: [[上限, 标签, 说明], ...]，最后一项上限用 Infinity
    for (var i = 0; i < table.length; i++) {
      if (value < table[i][0]) return { label: table[i][1], note: table[i][2], index: i };
    }
    var last = table[table.length - 1];
    return { label: last[1], note: last[2], index: table.length - 1 };
  }
  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function monthsBetween(a, b) {
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
  }
  function yearsBetween(a, b) { return monthsBetween(a, b) / 12; }

  /* ==========================================================
     1. 参数注册表（单一事实来源）
     每条：key / label / unit / range / grade / sample / alarm / src
     ========================================================== */
  var PARAMS = [
    { key: "tempC", label: "核心体温（直肠）", unit: "°C", range: "38.0–39.2", grade: "B", sample: "每月 1 次 / 疑似时", alarm: "≥39.5 发热；≥41 热射病高危；<37 失温", src: "TPR 临床常规参考" },
    { key: "hrBpmLarge", label: "静息心率（大/巨型犬）", unit: "bpm", range: "60–100", grade: "B", sample: "每月 1 次", alarm: "持续 >140 或 <50", src: "TPR 临床常规参考" },
    { key: "hrBpmSmall", label: "静息心率（小型犬）", unit: "bpm", range: "100–140", grade: "B", sample: "每月 1 次", alarm: "持续 >180 或 <70", src: "TPR 临床常规参考" },
    { key: "rrResting", label: "静息呼吸频率", unit: "次/分", range: "10–30", grade: "A", sample: "每日（睡眠时）", alarm: ">30 连续 3 日；>40 立即就医", src: "犬心脏病家庭监测通行阈值" },
    { key: "crt", label: "毛细血管再充盈时间", unit: "秒", range: "<2", grade: "B", sample: "疑似时", alarm: ">2 提示灌注不良", src: "临床常规参考" },
    { key: "skinTurgor", label: "皮肤回弹时间", unit: "秒", range: "1–2", grade: "B", sample: "疑似时", alarm: ">2 或呈「帐篷状」提示脱水", src: "临床常规参考" },
    { key: "bpSystolic", label: "收缩压（诊室）", unit: "mmHg", range: "80–150", grade: "B", sample: "每次就诊", alarm: ">160 或 <90", src: "兽医血压共识区间" },
    { key: "bcs", label: "体况评分", unit: "9 分制", range: "4–5（理想）", grade: "B", sample: "每 2 周触诊", alarm: "≤3 偏瘦；≥7 肥胖", src: "BCS 9 分制临床标准" },
    { key: "weightKg", label: "体重", unit: "kg", range: "个体基线 ±5%", grade: "A", sample: "每 2 周", alarm: "30 日内下降 >5%（非减重计划）", src: "趋势优于单点" },
    { key: "waterMl", label: "饮水", unit: "mL/kg/日", range: "50–60", grade: "B", sample: "每日", alarm: "持续 >100 提示多饮", src: "临床通行参考" },
    { key: "rer", label: "静息能量需求 RER", unit: "kcal/日", range: "70 × BW^0.75", grade: "B", sample: "每月", alarm: "—", src: "兽医营养学通用公式" },
    { key: "der", label: "维持能量需求 DER", unit: "kcal/日", range: "k × RER", grade: "B", sample: "每月", alarm: "体重趋势", src: "T/CVMA 121—2023 系数表" },
    { key: "exerciseMin", label: "运动配额", unit: "min/日", range: "25–90（品种类分档）", grade: "C", sample: "每日", alarm: "见 DNS 短板", src: "环境丰富化通行建议" },
    { key: "rrSleepPct", label: "睡眠占比（成犬）", unit: "%/日", range: "50–58（12–14 h）", grade: "A", sample: "每周目测", alarm: "骤增或骤减 >3 h/日", src: "犬睡眠时间预算研究" },
    { key: "sleepPuppy", label: "睡眠时长（幼犬）", unit: "小时/日", range: "18–20", grade: "A", sample: "每周", alarm: "低于 16 h 需查原因", src: "幼犬发育期睡眠研究" },
    { key: "sniffEquiv", label: "嗅闻—奔跑当量比", unit: "比值", range: "1 : 3（15 min ≈ 45 min）", grade: "C", sample: "—", alarm: "—", src: "犬行为学界通行换算，无对照实验" },
    { key: "puppyWalkRule", label: "幼犬单次运动上限", unit: "分钟", range: "月龄 × 5", grade: "C", sample: "每次出门", alarm: "超过后出现僵硬/跛行", src: "兽医实践通行的经验法则" },
    { key: "socialMin", label: "每日人际互动配额", unit: "分钟", range: "30–60", grade: "C", sample: "每日", alarm: "连续 <15 min 记一条", src: "家庭犬行为时间分配观察" },
    { key: "chewMin", label: "每日认知 / 咀嚼配额", unit: "分钟", range: "≥15", grade: "C", sample: "每日", alarm: "连续 3 日 <5 min", src: "环境丰富化通行建议" },
    { key: "humanYears", label: "人类年龄换算", unit: "人年", range: "16·ln(a)+31", grade: "A", sample: "每年", alarm: "—", src: "犬表观遗传钟（唾液甲基化）" },
    { key: "lifeExpectancy", label: "预期寿命", unit: "年", range: "16.7 − 2.17·ln(BW)", grade: "A", sample: "每年", alarm: "—", src: "体重—寿命中位数拟合" },
    { key: "seniorAt", label: "老年期起点", unit: "年", range: "预期寿命 × 0.75", grade: "B", sample: "每年", alarm: "进入老年期 → 体检频次翻倍", src: "AAHA 生命阶段指南" },
    { key: "cmpsSf", label: "急性疼痛评分（Glasgow CMPS-SF）", unit: "0–24 分", range: "0（无痛）", grade: "A", sample: "术后每 4 h", alarm: "≥6/24（无移动项 ≥5/20）需镇痛干预", src: "Reid 等，2007；IWAP 疼痛专题" },
    { key: "hri", label: "热风险指数（HRI）", unit: "指数点", range: "本项目定义，见 §4.5", grade: "C", sample: "出门前", alarm: "≥10 取消户外运动；≥15 仅排泄", src: "本项目复合指标，非临床量表" },
    { key: "vsi", label: "就诊应激指数（VSI）", unit: "0–10", range: "本项目定义，见 §4.5", grade: "C", sample: "每次就诊前", alarm: "≥7 建议与兽医讨论就诊前用药", src: "本项目复合指标，非临床量表" },
    { key: "dns", label: "日常需求达成度（DNS）", unit: "0–100", range: "≥85 达标", grade: "C", sample: "每日", alarm: "<70 或任一维度 <60", src: "本项目复合指标，用于短期趋势" }
  ];

  /* ==========================================================
     2. DER 系数表
     ========================================================== */
  var K_FACTORS = {
    weightLoss: { lo: 0.8, hi: 1.0, label: "减重期" },
    senior: { lo: 1.2, hi: 1.4, label: "老年期（7 岁以上）" },
    neuteredAdult: { lo: 1.4, hi: 1.6, label: "绝育成犬" },
    intactAdult: { lo: 1.6, hi: 1.8, label: "未绝育成犬" },
    weightGain: { lo: 1.2, hi: 1.4, label: "增重期" },
    puppyUnder4m: { lo: 2.5, hi: 3.0, label: "幼犬 <4 月龄" },
    puppyOver4m: { lo: 2.0, hi: 2.5, label: "幼犬 4 月–1 岁" },
    working: { lo: 5.0, hi: 11.0, label: "高强度工作犬（雪橇等）" }
  };

  function kFactor(p) {
    var ageM = p.ageMonths != null ? p.ageMonths : 999;
    if (ageM < 4) return K_FACTORS.puppyUnder4m;
    if (ageM < 12) return K_FACTORS.puppyOver4m;
    if (p.working) return K_FACTORS.working;
    if (p.goal === "lose") return K_FACTORS.weightLoss;
    if (p.goal === "gain") return K_FACTORS.weightGain;
    if (p.isSenior) return K_FACTORS.senior;
    return p.neutered ? K_FACTORS.neuteredAdult : K_FACTORS.intactAdult;
  }

  /* ==========================================================
     3. 派生指标：能量 / 饮水 / 配额 / 老化
     ========================================================== */
  function rer(bw) { return 70 * Math.pow(bw, 0.75); }          // kcal/day
  function der(bw, p) { var k = kFactor(p); return { lo: k.lo * rer(bw), hi: k.hi * rer(bw), k: k }; }

  function sniffTarget(p) {
    var t = 20;
    var bc = p.breedClass || "mixed";
    if (["herding", "sporting", "working", "hound"].indexOf(bc) >= 0) t += 10;
    if (["toy", "nonsporting"].indexOf(bc) >= 0) t -= 5;
    if (p.ageMonths != null && p.ageMonths < 12) t += 5;
    if (p.isSenior) t -= 5;
    return clamp(t, 10, 40);
  }

  function exerciseTarget(p) {
    // 每日户外运动目标（分钟），分档后按体况与疾病修正
    var base;
    var bc = p.breedClass || "mixed";
    if (p.isSenior) base = 25;
    else if (["herding", "sporting", "working"].indexOf(bc) >= 0) base = 90;
    else if (bc === "hound" || bc === "terrier") base = 60;
    else if (bc === "toy") base = 30;
    else base = 45;
    if (p.condition === "arthritis" || p.condition === "heart") base *= 0.6;
    if (p.condition === "obesity") base *= 1.15;
    return Math.round(base);
  }

  function puppyWalkCap(p) {
    if (p.ageMonths == null || p.ageMonths >= 18) return null;
    // 生长板闭合前的高冲击运动限制：小型 6–8 月，中型 ~12 月，大型/巨型 12–24 月
    return { minutes: 5 * p.ageMonths, note: "单次上限，每日 1–2 次；避免跳跃、楼梯、硬地长距离" };
  }

  function humanYears(ageY) {
    if (ageY <= 0) return 0;
    if (ageY < 1) return round(31 * Math.pow(ageY, 0.62), 1); // 本项目插值，C 级
    return round(16 * Math.log(ageY) + 31, 1);
  }

  function lifeExpectancy(bw) { return clamp(16.7 - 2.17 * Math.log(bw), 5, 18); }

  function lifeStage(p) {
    var le = lifeExpectancy(p.weightKg);
    var seniorAt = 0.75 * le, geriatricAt = 0.9 * le;
    var a = p.ageYears;
    var stage = "adult";
    if (a < 1) stage = "puppy";
    else if (a >= geriatricAt) stage = "geriatric";
    else if (a >= seniorAt) stage = "senior";
    else if (a < 2) stage = "junior";
    return { stage: stage, lifeExpectancy: round(le, 1), seniorAt: round(seniorAt, 1), geriatricAt: round(geriatricAt, 1) };
  }

  function examPerYear(stage, condition) {
    if (condition) return 4;                                  // 慢病：季度复诊
    if (stage === "puppy") return 0;                          // 由免疫序列决定，见 vaccineSchedule
    if (stage === "senior" || stage === "geriatric") return 2; // AAHA：至少每半年一次
    return 1;
  }

  /* ==========================================================
     4. DNS — 日常需求达成度（C 级复合指标）
     五维加权 + 短板封顶规则
     ========================================================== */
  var DNS_DIMS = [
    { key: "exercise", label: "运动", weight: 0.25 },
    { key: "sniff", label: "嗅闻", weight: 0.20 },
    { key: "social", label: "社交 / 陪伴", weight: 0.20 },
    { key: "rest", label: "休息", weight: 0.20 },
    { key: "cognitive", label: "认知 / 咀嚼", weight: 0.15 }
  ];

  function dns(p, act) {
    act = act || {};
    var targets = {
      exercise: exerciseTarget(p),
      sniff: sniffTarget(p),
      social: 60,
      rest: p.ageMonths != null && p.ageMonths < 12 ? 18 * 60 : p.isSenior ? 16 * 60 : 13 * 60, // 分钟表达
      cognitive: 15
    };
    var actuals = {
      exercise: (act.walkMin || 0) + (act.playMin || 0),
      sniff: act.sniffMin || 0,
      social: act.socialMin || 0,
      rest: (act.sleepHours != null ? act.sleepHours : 13) * 60,
      cognitive: act.chewMin || 0
    };
    var dims = [], weighted = 0, floor = 100;
    DNS_DIMS.forEach(function (d) {
      var ratio = clamp(actuals[d.key] / targets[d.key], 0, 1);
      var score = Math.round(ratio * 100);
      if (score < floor) floor = score;
      weighted += score * d.weight;
      dims.push({
        key: d.key, label: d.label, weight: d.weight,
        target: round(targets[d.key], 1),
        actual: round(actuals[d.key], 1),
        unit: d.key === "rest" ? "分钟" : "分钟",
        score: score,
        deficit: round(Math.max(0, targets[d.key] - actuals[d.key]), 1)
      });
    });
    var raw = Math.round(weighted);
    var capped = false, score = raw;
    if (floor < 60) { score = Math.min(raw, 79); capped = true; }
    var b = band(score, [
      [70, "明显不足", "存在结构性缺口，优先补最低维度"],
      [85, "轻度不足", "接近达标，按短板项微调"],
      [Infinity, "达标", "维持当前排程"]
    ]);
    return {
      score: score, raw: raw, capped: capped, floor: floor,
      band: b.label, note: b.note,
      rule: capped ? "短板封顶规则生效：最低维度 <60，总分封顶 79" : "无封顶",
      dims: dims,
      gap: dims.slice().sort(function (a, c) { return a.score - c.score; })[0]
    };
  }

  /* ==========================================================
     5. HRI — 热风险指数（C 级复合指标）
     ========================================================== */
  function hri(p, env) {
    env = env || {};
    var t = env.tempC != null ? env.tempC : 22;
    var rh = env.humidityPct != null ? env.humidityPct : 50;
    var factors = [], pts = 0;
    function add(label, v) { if (v) { pts += v; factors.push({ label: label, points: round(v, 2) }); } }

    add("气温 (" + t + "°C − 22) × 0.6", Math.max(0, t - 22) * 0.6);
    add("湿度 (" + rh + "% − 40) × 0.15", Math.max(0, rh - 40) * 0.15);
    if (env.sun) add("日光直射", 3);
    if (p.brachycephalic) add("短鼻结构（散热通道受限）", 4);
    if (p.coat === "double" || p.coat === "thick") add("双层 / 厚被毛", 1.5);
    if (p.darkCoat) add("深色被毛（吸热）", 0.5);
    if (p.weightKg > 25) add("体重 >25 kg", 1);
    if ((p.ageMonths != null && p.ageMonths < 6) || p.isSenior) add("年龄极端（<6 月 或 老年）", 1);
    if (env.acclimatedDays != null && env.acclimatedDays >= 7) add("已热适应（近 7 日户外充分）", -2);
    else add("未热适应", 2);

    pts = round(pts, 1);
    var b = band(pts, [
      [0, "安全", "按计划执行"],
      [5, "注意", "运动时长 ×0.7，增加补水"],
      [10, "警告", "运动时长 ≤50%，改为清晨 / 夜间，缩短嗅闻"],
      [15, "危险", "取消户外运动，仅室内任务 + 排泄"],
      [Infinity, "极端", "仅排泄，5 分钟内返回；地面温度优先于气温"]
    ]);
    var cap = clamp(1 - Math.max(0, pts) / 20, 0, 1);
    var hardStop = t >= 32 || pts >= 10;
    return {
      score: pts, band: b.label, note: b.note, factors: factors,
      walkFactor: round(cap, 2),
      outdoorAllowed: !hardStop,
      rule: hardStop ? "硬性规则生效：气温 ≥32 °C 或 HRI ≥10 → 取消户外运动" : "无硬停",
      pavementTest: "手背贴地 5 秒：无法舒适忍受 → 爪垫同样无法忍受"
    };
  }

  /* ==========================================================
     6. VSI — 就诊应激指数（C 级复合指标）
     ========================================================== */
  function vsi(p, vi) {
    vi = vi || {};
    var factors = [], pts = 0;
    function add(label, v) { if (v) { pts += v; factors.push({ label: label, points: round(v, 2) }); } }

    var ride = vi.rideMinutes != null ? vi.rideMinutes : 15;
    add("车程 " + ride + " 分钟", ride > 40 ? 2 : ride > 20 ? 1 : 0);
    if (vi.priorNegative) add("既往就诊有负性经历", 2);
    if (vi.baselineAnxiety) add("基线焦虑（分离 / 噪音恐惧史）", 2);
    if (!vi.happyVisits) add("从未做过「快乐到访」", 1.5);
    if (!vi.muzzleTrained) add("未做过嘴套预适应", 1);
    if (!vi.pheromone) add("未使用信息素干预", 1);
    if (vi.ownerTense) add("维护者自评紧张", 1);
    if (vi.pvp) add("已使用就诊前药物（兽医处方）", -1.5);
    if (vi.fastedForTreats) add("空腹到院（以零食换取强化）", -0.5);
    if (vi.carWait) add("车内等待，避开候诊区", -1);

    pts = round(clamp(pts, 0, 10), 1);
    var b = band(pts, [
      [4, "常规", "标准流程即可"],
      [7, "偏高", "提前 3 天做快乐到访；信息素 + 车内等待；候诊用撒食降低唤醒"],
      [9, "高", "与兽医讨论就诊前用药；提前做嘴套预适应；要求地板检查"],
      [Infinity, "极高", "必须走就诊前用药方案，并考虑将本次就诊拆成两次"]
    ]);
    return { score: pts, band: b.label, note: b.note, factors: factors, band10: pts };
  }

  /* ==========================================================
     7. 分诊（急诊优先级矩阵）
     ========================================================== */
  var TRIAGE_DEFS = [
    { key: "collapse", p: 0, label: "虚脱 / 无法站立 / 意识丧失" },
    { key: "seizure", p: 0, label: "抽搐，或抽搐持续 >2 分钟 / 反复发作" },
    { key: "gdv", p: 0, label: "腹部膨隆 + 反复干呕无物（胃扭转征象）" },
    { key: "heatstroke", p: 0, label: "高温暴露后体温 ≥41 °C、大量流涎、步态不稳" },
    { key: "dyspnea", p: 0, label: "张口呼吸伴腹式用力 / 静息呼吸 >40 次/分" },
    { key: "paleGums", p: 0, label: "牙龈苍白、发白或发绀" },
    { key: "bleeding", p: 0, label: "无法止住的出血" },
    { key: "poison", p: 0, label: "误食巧克力 / 葡萄 / 木糖醇 / 鼠药 / 洋葱" },
    { key: "urineBlock", p: 0, label: "公犬反复做出排尿姿势但无尿（尿路梗阻）" },
    { key: "eyeInjury", p: 0, label: "眼球外伤 / 突然失明" },
    { key: "trauma", p: 0, label: "车祸、坠落等钝性创伤" },
    { key: "tempHigh", p: 0, label: "体温 ≥41 °C" },

    { key: "rrElevated", p: 1, label: "静息呼吸 30–40 次/分，持续 ≥5 分钟" },
    { key: "anorexia24", p: 1, label: "完全拒食 >24 小时" },
    { key: "vomitRepeat", p: 1, label: "呕吐 >2 次/日，或呕吐伴虚弱" },
    { key: "diarrheaRepeat", p: 1, label: "腹泻 >2 次/日，或带血 / 黑便" },
    { key: "tempMid", p: 1, label: "体温 39.5–41 °C" },
    { key: "nonWeightBearing", p: 1, label: "单肢完全不敢负重" },
    { key: "pain6", p: 1, label: "CMPS-SF 疼痛评分 ≥6/24" },
    { key: "behaviorSudden", p: 1, label: "突然变安静 / 突然回避触碰（本系统最不报错的那种故障）" },

    { key: "lamenessMild", p: 2, label: "轻度跛行，仍可负重" },
    { key: "earOdor", p: 2, label: "耳道异味、频繁甩头" },
    { key: "itching", p: 2, label: "持续瘙痒、局部脱毛" },
    { key: "weightLoss", p: 2, label: "30 日内体重下降 >5%（非减重计划）" },
    { key: "polydipsia", p: 2, label: "饮水量持续 >100 mL/kg/日" },
    { key: "badBreath", p: 2, label: "口腔异味、进食时偏头" },

    { key: "routine", p: 3, label: "疫苗 / 驱虫到期、年度或半年度体检、指甲过长" }
  ];

  function triage(flags) {
    flags = flags || {};
    var hits = TRIAGE_DEFS.filter(function (d) { return !!flags[d.key]; });
    if (!hits.length) return { priority: 3, code: "P3", label: "常规", note: "按预防性排程处理", hits: [] };
    var worst = Math.min.apply(null, hits.map(function (h) { return h.p; }));
    var table = {
      0: { code: "P0", label: "立即（分钟级）", note: "不要先在家观察、不要先算分。直接转运，途中电话通知医院。" },
      1: { code: "P1", label: "当日（小时级）", note: "当日就诊。期间记录呼吸、体温、饮水与排泄，带上记录。" },
      2: { code: "P2", label: "72 小时内", note: "预约就诊；期间做家庭监测记录，出现 P0/P1 条目立即升级。" },
      3: { code: "P3", label: "常规", note: "按预防性排程处理。" }
    };
    var t = table[worst];
    return {
      priority: worst, code: t.code, label: t.label, note: t.note,
      hits: hits.map(function (h) { return { key: h.key, label: h.label, priority: "P" + h.p }; })
    };
  }

  /* ==========================================================
     8. 免疫 / 驱虫 / 复诊日历（可计算排程）
     ========================================================== */
  function vaccineSchedule(birth, today) {
    today = today || new Date();
    var rows = [
      { w: [6, 8], name: "DHPP / DAPP 第 1 剂", must: false, note: "最早可在断奶后 6 周开始" },
      { w: [10, 12], name: "DHPP / DAPP 第 2 剂", must: false, note: "间隔 2–4 周" },
      { w: [12, 13], name: "钩端螺旋体 第 1 剂", must: false, note: "AAHA 2024 已列为核心疫苗；12 周起" },
      { w: [12, 16], name: "狂犬病 第 1 剂", must: true, note: "法定要求，具体时点依当地法规与产品标签" },
      { w: [16, 18], name: "DHPP / DAPP 第 3 剂（末剂）", must: true, note: "MUST 在 ≥16 周龄接种：这是整个序列唯一不可提前的一针" },
      { w: [16, 18], name: "钩端螺旋体 第 2 剂", must: false, note: "间隔 2–4 周" },
      { w: [52, 56], name: "DHPP 首年加强 + 狂犬加强", must: true, note: "建立成年后的间隔基准" },
      { w: [156, 160], name: "DHPP 三年度加强", must: false, note: "此后每 3 年" }
    ];
    return rows.map(function (r) {
      var s = addDays(birth, Math.round(r.w[0] * 7)), e = addDays(birth, Math.round(r.w[1] * 7));
      var status = today > e ? "窗口已过" : today >= s ? "在窗口内" : "未到期";
      return { name: r.name, must: r.must, note: r.note, windowStart: iso(s), windowEnd: iso(e), status: status, weeks: r.w[0] + "–" + r.w[1] + " 周" };
    });
  }

  function parasiteSchedule(p, today) {
    var a = p.ageMonths != null ? p.ageMonths : 36;
    var rows = [];
    if (a < 3) rows.push({ item: "体内驱虫（蛔虫 / 钩虫）", freq: "每 2 周一次", note: "自 2 周龄起，母犬可经胎盘与乳汁传播" });
    else if (a < 6) rows.push({ item: "体内驱虫", freq: "每月一次", note: "广谱产品，覆盖蛔虫 / 钩虫 / 鞭虫 / 绦虫" });
    else rows.push({ item: "体内驱虫", freq: p.highRisk ? "每月一次" : "每 3 个月一次", note: "成犬仍易感，全年不间断" });
    rows.push({ item: "体外驱虫（跳蚤 / 蜱虫）", freq: "每月一次（全年）", note: "8 周龄起，须用幼犬适用产品；按体重精确给药" });
    rows.push({ item: "心丝虫预防", freq: "每月一次（全年）", note: "不晚于 8 周龄起；只预防幼虫，不杀成虫" });
    rows.push({ item: "粪便检查", freq: a < 12 ? "首年数次" : "每年至少 1 次", note: "用于评估用药依从性与虫种" });
    if (a >= 7) rows.push({ item: "心丝虫 / 蜱媒病抗原抗体检测", freq: "每年一次", note: "自 7–12 月龄起可开始检测" });
    return rows;
  }

  /* ==========================================================
     9. 主入口：一次评估产出全部指标
     ========================================================== */
  function evaluate(profile, env, act, vetInput, flags) {
    var p = Object.assign({}, profile);
    if (p.birth && !p.ageYears) {
      var b = new Date(p.birth);
      p.ageYears = yearsBetween(b, new Date());
      p.ageMonths = monthsBetween(b, new Date());
    }
    var ls = lifeStage(p);
    p.isSenior = ls.stage === "senior" || ls.stage === "geriatric";
    var k = kFactor(p);
    var energy = der(p.weightKg, p);
    var dnsR = dns(p, act);
    var hriR = hri(p, env);
    var vsiR = vsi(p, vetInput);
    var tri = triage(flags);

    var report = {
      schema: "dog-quant/v1",
      generatedAt: new Date().toISOString(),
      profile: {
        name: p.name || "未命名实例", weightKg: p.weightKg, ageYears: round(p.ageYears, 2),
        breedClass: p.breedClass || "mixed", neutered: !!p.neutered, brachycephalic: !!p.brachycephalic,
        coat: p.coat || "unknown", bcs: p.bcs != null ? p.bcs : null
      },
      lifeStage: ls,
      metrics: {
        rerKcal: round(rer(p.weightKg), 0),
        derKcal: { lo: round(energy.lo, 0), hi: round(energy.hi, 0), k: k.lo + "–" + k.hi, kLabel: k.label },
        waterMl: { lo: round(50 * p.weightKg, 0), hi: round(60 * p.weightKg, 0), check: "≈ 1 mL = 1 kcal，用于与喂食量互相校验" },
        sniffTargetMin: sniffTarget(p),
        exerciseTargetMin: exerciseTarget(p),
        puppyWalkCap: puppyWalkCap(p),
        humanYears: humanYears(p.ageYears),
        lifeExpectancyYears: ls.lifeExpectancy,
        seniorAtYears: ls.seniorAt,
        geriatricAtYears: ls.geriatricAt,
        examPerYear: examPerYear(ls.stage, p.condition),
        painScale: { tool: "Glasgow CMPS-SF", max: 24, threshold: 6, unit: "分" }
      },
      assessments: {
        dns: dnsR,
        hri: hriR,
        vsi: vsiR,
        triage: tri
      },
      plan: {
        vaccine: p.birth ? vaccineSchedule(new Date(p.birth)) : [],
        parasite: parasiteSchedule(p),
        heatAdjustedWalkMin: Math.round(exerciseTarget(p) * hriR.walkFactor)
      },
      shortCircuit: tri.priority <= 1,
      disclaimer: "全部评分为偏差提示，不是诊断。分诊结果为 P0/P1 时，其余评分接口全部短路返回 451。"
    };
    return report;
  }

  return {
    version: "dog-quant/v1",
    PARAMS: PARAMS,
    K_FACTORS: K_FACTORS,
    DNS_DIMS: DNS_DIMS,
    TRIAGE_DEFS: TRIAGE_DEFS,
    util: { clamp: clamp, round: round, band: band, humanYears: humanYears, lifeExpectancy: lifeExpectancy, addDays: addDays, iso: iso },
    rer: rer,
    der: der,
    kFactor: kFactor,
    sniffTarget: sniffTarget,
    exerciseTarget: exerciseTarget,
    puppyWalkCap: puppyWalkCap,
    lifeStage: lifeStage,
    examPerYear: examPerYear,
    dns: dns,
    hri: hri,
    vsi: vsi,
    triage: triage,
    vaccineSchedule: vaccineSchedule,
    parasiteSchedule: parasiteSchedule,
    evaluate: evaluate
  };
});
