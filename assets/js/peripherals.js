/* ============================================================
   DOG API — DOG API 外设总线内核 (v1)
   ------------------------------------------------------------
   本文件是「§31 外设总线」的计算内核，与 assets/js/quantify.js 并列：
     - tools/peripherals.html   外设总线控制台
     - 校验脚本                 门槛与覆盖率断言

   三条硬约束（与 §31 对应）：

     1. 不另抄一份配额权重。DNS 五维权重一律从 DogQuant.DNS_DIMS 现读。
        因此「外设最多能承接 60%」这句话是算出来的，不是写死的；
        配额模型一旦改动，这句话会跟着变。

     2. 不发明没有公开来源的尺寸。气管内径查临床插管尺寸表；
        凡属本项目的代理关系与系数，一律标注 C 级并在来源行写明。

     3. 不把「过门槛」说成「合格」。气道门槛是必要条件，不是充分条件；
        §31 对此有专门一节，本内核的返回值也照此分开。
   ============================================================ */

(function (root, factory) {
  var api = factory(function () { return root && root.DogQuant; });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DogPeriph = api;
})(typeof window !== "undefined" ? window : null, function (resolve) {
  "use strict";

  var attached = null;
  function quant() { return attached || (resolve && resolve()) || null; }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round(v, d) { var m = Math.pow(10, d == null ? 1 : d); return Math.round(v * m) / m; }
  function pct(w) { return Math.round(w * 100); }

  /* ==========================================================
     1. 捕猎序列（predatory sequence）
     §31 的分类轴不是「材质」，也不是「用途」，而是这套序列。
     依据：行为学通行的捕猎序列分解；Merck 兽医手册把「激光笔
     综合征」明确归因于「目标挫折 —— 无法完成序列」。
     ========================================================== */
  var SEQ = [
    { key: "orient", label: "定向", note: "耳眼转向目标。几乎不消耗配额" },
    { key: "stalk", label: "潜行", note: "压低身体、凝视。低位移、高唤醒" },
    { key: "chase", label: "追逐", note: "高速位移。对应运动配额的主来源" },
    { key: "grab", label: "咬合", note: "口部闭合、甩动。序列的第一个终点" },
    { key: "dissect", label: "分解", note: "把目标拆开。序列的第二个终点" }
  ];

  // 觅食系统与捕猎序列并列，不是它的一个阶段。混淆这两者是市面上的常见错误。
  var FORAGE = {
    key: "forage", label: "觅食",
    note: "鼻主导的搜寻系统。食物本身就是它的终点，因此不存在「序列不可闭合」问题"
  };

  /* ==========================================================
     2. 角色：外设对配额做了什么
     ========================================================== */
  var ROLES = [
    { key: "transducer", label: "换能器", note: "把某一维配额从「需要你」转成「不需要你」" },
    { key: "coop", label: "协作型", note: "必须有你在另一端 —— 它承接的是社交本身，不是配额" },
    { key: "host", label: "宿主", note: "不产生分钟，只决定休息配额能否达成" },
    { key: "constraint", label: "约束器", note: "不承接配额，只限制爆发性能（§14 的超频）" },
    { key: "suppressor", label: "抑制器", note: "不承接配额，只降低某一项风险或唤醒指标" },
    { key: "deprecated", label: "已弃用", note: "序列不可闭合。规范组不建议部署，见 §31 弃用清单" }
  ];

  /* ==========================================================
     3. 门槛注册表
     kind：必要 = 达不到就必不合格；操作判据 = 没有可引用尺寸，只能现场判；
           规则 = 不是测量，是操作方式
     ========================================================== */
  var GATES = [
    { key: "airway", label: "气道门槛", kind: "必要", grade: "B/C",
      basis: "气管内径查临床插管尺寸表（B）；1.5× 系数为本项目推导（C）" },
    { key: "mouthfit", label: "口腔容纳门槛", kind: "操作判据", grade: "B",
      basis: "VCA／AKC：能整颗含进嘴里的球更易造成气道梗阻；尺寸应「明确大于狗的咽喉」" },
    { key: "vent", label: "通气孔放宽条款", kind: "规则", grade: "B",
      basis: "若玩具被卡住时空气仍能通过，风险显著下降（兽医检索工具的选购建议）" },
    { key: "hardness", label: "硬度门槛 · 指甲压痕", kind: "必要", grade: "B",
      basis: "兽医牙科：指甲压得出痕＝有缓冲；指甲打滑变弯＝太硬，会先把牙崩掉" },
    { key: "edge", label: "边缘门槛", kind: "必要", grade: "B",
      basis: "无尖点、无锯齿；硬尼龙被啃出尖点后即为肠管划伤源" },
    { key: "growth", label: "生长板门槛", kind: "必要", grade: "B",
      basis: "AKC：生长板至少 12 月龄才闭合，巨型／晚熟品种更晚；闭合前垂直跳跃可致永久损伤" },
    { key: "dentition", label: "乳齿门槛", kind: "必要", grade: "B",
      basis: "成牙约 6–7 月龄（另有来源称 8–9 月龄）。两说取保守值" },
    { key: "angle", label: "拔河角度门槛", kind: "规则", grade: "C",
      basis: "只允许水平牵引；上下方向牵拉同时加大脊柱与颞下颌关节载荷" },
    { key: "body", label: "体长背短品种门槛", kind: "必要", grade: "C",
      basis: "腊肠等软骨发育不全体征：多来源引用其 IVDD 风险约为均值 10–12 倍，19–24% 一生出现临床症状，高峰 3–7 岁" },
    { key: "linear", label: "线性异物门槛", kind: "必要", grade: "B",
      basis: "吞入的绳纤维形成 linear foreign body，会像锯一样切割肠管" },
    { key: "smallpart", label: "可分解件门槛", kind: "必要", grade: "B",
      basis: "发声器或填充物一旦外露立即退役；任何咬剩的残端（nub）立即退役" },
    { key: "material", label: "合规门槛", kind: "必要", grade: "B",
      basis: "美国对宠物玩具无强制联邦标准（CPSC 只监管儿童玩具；APPA：几乎没有仅适用于宠物玩具制造的联邦或州法律）。只能核验自愿声明" },
    { key: "retract", label: "伸缩绳条款", kind: "规则", grade: "C",
      basis: "伸缩绳在候诊区是一场可预见的意外（《就医随身包清单》已列同类约束）" }
  ];
  function gate(key) { for (var i = 0; i < GATES.length; i++) if (GATES[i].key === key) return GATES[i]; return null; }

  /* ==========================================================
     4. 磨损区间
     只有三类材质有可引用的观察区间，其余本项目不给数值。
     ========================================================== */
  var WEAR = {
    rope: { label: "棉／尼龙绳", lo: 14, hi: 42, unit: "天", grade: "C", src: "零售侧观察区间（2–6 周）" },
    rubber: { label: "天然橡胶", lo: 180, hi: 540, unit: "天", grade: "C", src: "零售侧观察区间（6–18 个月）" },
    engineered: { label: "工程材料", lo: 730, hi: 1825, unit: "天", grade: "C", src: "零售侧观察区间（2–5 年）" }
  };

  /* ==========================================================
     5. 设备类别注册表（14 类）
     play = 该类的分钟数落到 DogQuant 的哪个输入项；null = 不产生分钟
     ========================================================== */
  var CLASSES = [
    {
      code: "BL", id: "PER/BL", name: "球体", en: "Ball",
      role: "transducer", seq: ["chase", "grab"], forage: false, dns: ["exercise"],
      default: "cond", grade: "B", wear: "rubber", play: "playMin",
      driver: "投掷 → 追踪 → 拾回",
      intent: "承接「追逐 + 咬合」两相，是序列最容易闭合的一类外设 —— 因为它自带终点：球会被追上。",
      duty: "单次 15–20 分钟；高温天受硬停条款限制",
      gates: ["airway", "mouthfit", "vent", "growth", "material"],
      faults: [
        { mode: "舌后嵌顿（无孔球）", why: "球在口内被压扁、滑向舌根，软腭在其上闭合形成密封", fix: "改用带通气孔的球，或让球大到塞不进舌后" },
        { mode: "牙釉质磨耗 · 绒面球", why: "绒面 + 沙砾 = 砂纸。釉质磨掉不会长回来，X 光片上表现为齿冠被削平（blunting）", fix: "绒面球只用于投掷，绝不作为咀嚼物；换成光滑橡胶／硅胶球" },
        { mode: "咬裂后碎片吞入", why: "强力咬合可把球咬裂，半边能卡在咽喉；球类异物是急诊常见的外来体", fix: "出现裂纹立即退役；一次只给一颗" }
      ],
      src: "VCA / AKC 兽医牙科与急诊共识；ITF 竞赛用球规格"
    },
    {
      code: "DS", id: "PER/DS", name: "圆盘（飞盘）", en: "Disc",
      role: "transducer", seq: ["chase", "grab"], forage: false, dns: ["exercise"],
      default: "cond", grade: "B", wear: null, play: "playMin",
      driver: "抛掷 → 预判轨迹 → 空中拦截",
      intent: "追逐相的最高强度版本。它是唯一要求狗在落地前完成咬合的外设，因此对生长板与落地面的要求也最高。",
      duty: "按 §31 年龄分档执行；只在草地／沙地上进行",
      gates: ["growth", "body", "hardness", "material"],
      faults: [
        { mode: "落地冲击伤", why: "空中接取要求「全速起跳 + 空中扭转 + 硬地落地」，是关节载荷最集中的组合", fix: "换成沿地面滚动的低抛；场地换成草地或沙地" },
        { mode: "齿龈／齿冠撕裂", why: "人类竞赛盘是硬塑料，在高速撞击下会把齿冠崩掉", fix: "只用犬用软盘（橡胶或帆布）；软盘可折叠，牙齿不会被边缘切割" }
      ],
      src: "AKC《犬只跳跃安全》年龄分档；Dogster 兽医牙科意见"
    },
    {
      code: "TG", id: "PER/TG", name: "拔河绳", en: "Tug",
      role: "coop", seq: ["grab"], forage: false, dns: ["exercise", "social"],
      default: "cond", grade: "C", wear: "rope", play: "playMin",
      driver: "双方对抗牵引",
      intent: "本规范中唯一一类「必须有你在另一端」的外设。它同时计入运动与社交 —— 但计入社交的那部分不可由外设独立完成，这就是 60% 天花板存在的原因。",
      duty: "单次 5–10 分钟",
      gates: ["dentition", "angle", "body", "hardness", "linear", "material"],
      faults: [
        { mode: "犬齿松动或失活", why: "一侧兽医牙科意见：粗暴牵拉可超越牙周膜的承受极限，牙髓血供中断后牙齿变色、失活。多数变色牙在研究中被证实已坏死", fix: "降低力度；不在犬齿上做持续对抗；有牙科病史者不做" },
        { mode: "误咬维护者手部", why: "短绳在重新咬合时会把你的手纳入攻击面", fix: "用长绳，让狗始终有远离你手部的咬合位" },
        { mode: "绳纤维吞入", why: "松散纤维被吞入后形成线性异物", fix: "出现松散纤维立即退役；绳具不是磨牙工具" }
      ],
      contraindications: ["乳齿期（成牙前）", "体长背短品种", "既往有牙科疾病", "关节炎", "资源护卫史"],
      dispute: "本条目存在专业分歧：行为与训练侧普遍认为拔河安全且有益（且无证据显示它会引发攻击行为），牙科侧则指出持续牵拉对犬齿的载荷风险。规范组不复述任一方为定论。",
      src: "犬类行为学期刊综述与兽医牙科意见（两方分歧已标注）"
    },
    {
      code: "SQ", id: "PER/SQ", name: "发声玩具", en: "Squeaker",
      role: "transducer", seq: ["grab", "dissect"], forage: false, dns: ["cognitive"],
      default: "cond", grade: "C", wear: null, play: "chewMin",
      driver: "咬合 → 声音反馈 → 再咬合",
      intent: "承接「咬合 + 分解」两相。它唯一确定的机制不是「像猎物惨叫」，而是即时反馈回路。",
      duty: "监督下使用；不留给独处中的狗",
      gates: ["smallpart", "material"],
      faults: [
        { mode: "发声器外露被吞", why: "发声器是硬塑料小件，一旦外露即为消化道异物", fix: "撕开即退役，不要「再玩两天」" },
        { mode: "填充物外露被吞", why: "填充物在肠道内结团，可致梗阻", fix: "同上；布绒类玩具的寿命以「第一次破口」为终点" },
        { mode: "过度唤醒与执念", why: "高玩具动机个体可能把目标从「玩」转为「取出那个发声器」", fix: "换带旋转的其他品类，分散单点执念" }
      ],
      src: "操作性条件反射（咬合→反馈）为行为学基本事实；「吱声＝猎物惨叫」为通行假说，无对照实验，标注 HEURISTIC"
    },
    {
      code: "PZ", id: "PER/PZ", name: "漏食器／益智板", en: "Puzzle Feeder",
      role: "transducer", seq: [], forage: true, dns: ["cognitive"],
      default: "ok", grade: "C", wear: "engineered", play: "chewMin",
      driver: "操作 → 出粮",
      intent: "承接觅食系统。它是唯一一类同时产出「你省下的分钟」与「狗多花的分钟」的外设，因此本规范对它评价最高、也最克制。",
      duty: "与正餐绑定，不额外加餐",
      gates: ["material"],
      faults: [
        { mode: "难度错配", why: "新手狗直接上多格板会得到困惑而不是自信；老手狗一分钟解开则只剩挫败", fix: "从慢食碗或滚动式起步；一分钟内解开就升级难度" },
        { mode: "被当成行为问题的处方", why: "厂商常宣称可治分离焦虑、攻击、强迫行为。公开证据不支持这类断言", fix: "行为问题找行为兽医。本类设备只减少「无事可做」的那一部分" }
      ],
      src: "福利与丰富化指南支持「物种适配的环境丰富化」；缺乏逐产品的对照试验，故断言必须保守（contrafreeloading 偏好「需要努力的食物」有实验支持）"
    },
    {
      code: "SN", id: "PER/SN", name: "嗅闻垫", en: "Snuffle Mat",
      role: "transducer", seq: [], forage: true, dns: ["sniff"],
      default: "cond", grade: "C", wear: null, play: "sniffMin",
      driver: "藏食 → 鼻主导搜寻",
      intent: "唯一直接承接嗅闻维度的外设。配合 §25 的 1:3 换算，它是把「运动时间」换成「嗅闻时间」的最低成本手段。",
      duty: "每日 10–20 分钟；湿食款用完即洗",
      gates: ["linear", "smallpart", "material"],
      faults: [
        { mode: "吞入布条", why: "布条被撕下吞入后同样是线性异物", fix: "有撕布或吞线的狗不使用本类；改撒食（scatter feeding）" },
        { mode: "残渣霉变", why: "湿食残留在织物褶缝里", fix: "按洗涤标签执行；不给无法机洗的款式" }
      ],
      src: "嗅闻为独立动机系统（见 §03 嗅觉阵列、§25 嗅闻—奔跑当量比）"
    },
    {
      code: "LT", id: "PER/LT", name: "舔食垫", en: "Lick Mat",
      role: "suppressor", seq: [], forage: false, dns: [],
      default: "ok", grade: "C", wear: null, play: null,
      driver: "铺食 → 舔舐节律",
      intent: "本类不承接任何配额。它的用途是降低唤醒水平 —— 例如在剪指甲、洗脚、独处开始时提供一个可执行的替代行为。",
      duty: "单次 10–15 分钟；不用于替代脱敏训练",
      gates: ["material"],
      faults: [
        { mode: "被当作脱敏训练", why: "舔食垫可能让一次操作更顺利，但它不是脱敏，不降低下一次的恐惧强度", fix: "脱敏训练另有其路径；舔食垫只是让这一次更顺利一点" }
      ],
      src: "唤醒管理与替代行为的通行做法；跨个体的效应强度未量化"
    },
    {
      code: "CH", id: "PER/CH", name: "耐咬物（橡胶类）", en: "Chew",
      role: "transducer", seq: ["dissect"], forage: false, dns: ["cognitive"],
      default: "ok", grade: "B", wear: "rubber", play: "chewMin",
      driver: "持续啃咬",
      intent: "承接「分解」相，也是唯一一类会被本规范要求「必须比牙齿软」的外设 —— 因为它唯一的严重故障模式，是让狗把自己的牙咬断。",
      duty: "随食物填装，冷冻可延长占用时间",
      gates: ["hardness", "edge", "smallpart", "material"],
      faults: [
        { mode: "齿冠板状断裂（slab fracture）", why: "上第四前臼齿在外、下第一臼齿在内，形成剪切力。物体不被压扁时，断的是牙。断在牙髓腔则疼痛、感染、可致根尖脓肿", fix: "指甲压痕测试：压不出痕的，一律不给" },
        { mode: "啃成尖点划伤肠管", why: "硬尼龙被啃出尖点", fix: "每次给之前检查边缘；出现尖点即退役" }
      ],
      src: "兽医牙科：指甲压痕测试；板状断裂的发生机制与好发牙位"
    },
    {
      code: "FP", id: "PER/FP", name: "拉力杆（逗狗杆）", en: "Flirt Pole",
      role: "transducer", seq: ["chase", "grab"], forage: false, dns: ["exercise"],
      default: "ok", grade: "C", wear: "rope", play: "playMin",
      driver: "牵引摆动 → 追逐 → 咬住",
      intent: "通用解，也是激光笔的指定替代品：它提供与激光笔相同的追逐强度，但保留了可咬住的终点。",
      duty: "短时高强度（单次 5–10 分钟）；中间穿插停顿降温",
      gates: ["growth", "body", "linear", "smallpart", "material"],
      faults: [
        { mode: "急停与扭转伤", why: "高强度变向在硬地上对十字韧带与腕关节不利", fix: "在草地／防滑地面上使用；控制幅度，不做急停" },
        { mode: "过度唤醒", why: "极高速的追逐目标会把唤醒推得很高，收尾困难", fix: "以咬住 + 短拔河作为终止动作，再给嗅闻或舔食垫收尾" }
      ],
      src: "行为兽医与训练侧通行替代方案（针对激光笔综合征）"
    },
    {
      code: "BN", id: "PER/BN", name: "硬骨／鹿角／蹄", en: "Bone / Antler / Hoof",
      role: "transducer", seq: ["dissect"], forage: false, dns: [],
      default: "ban", grade: "B", wear: null, play: null,
      driver: "—",
      intent: "本类不是「需要小心使用」的设备，而是「规范组不建议部署」的设备。它存在的理由是：把最常见的伤害集中到一条可记住的规则上。",
      duty: "—",
      gates: ["hardness", "edge", "smallpart", "material"],
      faults: [
        { mode: "板状断裂（高发）", why: "鹿角、蹄、硬骨是本类最常见致伤物，失效方式是「把牙崩掉」而不是「被啃掉」", fix: "不提供。这不是使用方式问题，是材质问题" },
        { mode: "熟骨碎片穿孔", why: "熟骨易碎成尖锐碎片，可刺穿或划伤消化道", fix: "任何熟骨都不给" },
        { mode: "环状骨卡住下颌", why: "中空骨髓骨可套住下颌，通常需麻醉才能取下", fix: "不提供" }
      ],
      src: "FDA 关于骨类零食的公开提示；兽医牙科关于鹿角／蹄／骨的断裂统计"
    },
    {
      code: "LS", id: "PER/LS", name: "牵引与胸背", en: "Leash / Harness",
      role: "constraint", seq: [], forage: false, dns: [],
      default: "cond", grade: "C", wear: null, play: null,
      driver: "约束爆发性能（§15 的 +300% 松鼠超频）",
      intent: "本类不承接配额，它约束的是 §14 里那条超频。它同时是本规范中唯一一类「默认由你承担全部事故责任」的外设。",
      duty: "全时段；候诊区必须用固定长度牵引",
      gates: ["retract", "material"],
      faults: [
        { mode: "伸缩绳切断或缠绕", why: "细绳在意外缠绕时会造成切割伤；在候诊区是可预见的意外", fix: "改用固定长度牵引绳" },
        { mode: "压制式器械无教学", why: "以疼痛压制拉扯，不教狗「该做什么」；拉力被压下去了，行为没有改变", fix: "前扣式胸背 + 奖励式训练" },
        { mode: "颈部载荷", why: "颈圈把牵引载荷加在气管上；气管内径随体重减小（见本内核 airway 模型），短鼻与小型个体余量更少", fix: "本项目建议改为胸背（C 级推导，非临床结论）" }
      ],
      src: "Fear Free 立场的兽医机构关于器械选择的公开说明；《就医随身包清单》"
    },
    {
      code: "CL", id: "PER/CL", name: "冷却垫", en: "Cooling Mat",
      role: "suppressor", seq: [], forage: false, dns: [],
      default: "ok", grade: "C", wear: null, play: null,
      driver: "降温 → 降低环境风险指数（HRI）",
      intent: "本类不产生分钟，但它能改变 HRI 的输出，从而改变「今天还能不能出门」。它是唯一被允许参与硬停判定的外设。",
      duty: "按产品说明；不得替代遮阴、饮水与时段安排",
      gates: ["material"],
      faults: [
        { mode: "占据决策位置", why: "冷却垫会让人以为「有垫子就能出门」。热射病的处置窗口是分钟级（§28 SCN-E2）", fix: "垫子是缓解，不是许可。硬停条款优先" },
        { mode: "被啃食（凝胶款）", why: "凝胶垫一旦被咬破，内容物即为外来体风险", fix: "只在不被啃咬的场景下使用，或选不可啃穿的硬壳款" }
      ],
      src: "本项目 HRI 模型（§29 C 级复合指标）与散热架构（§03 外泌汗腺仅爪垫）"
    },
    {
      code: "BD", id: "PER/BD", name: "窝垫与笼箱", en: "Bed / Crate",
      role: "host", seq: [], forage: false, dns: ["rest"],
      default: "ok", grade: "C", wear: null, play: null,
      driver: "承载休息配额",
      intent: "本类不产生分钟，它决定的是休息配额「能不能达成」。它与换能器类的外设方向相反：换能器把配额从你手上拿走，宿主把配额还给狗。",
      duty: "全时段可用；不要变换位置",
      gates: ["smallpart", "material"],
      faults: [
        { mode: "被改作惩罚区", why: "作为隔离／惩罚场所使用后，笼箱会失去作为安全区的人工属性，此后再关就变成应激源", fix: "笼箱只用于休息与安全，冲突现场不在里面收尾" },
        { mode: "填充物外露被吞", why: "布绒窝垫破口后即为梗阻源", fix: "破口即补或即换" }
      ],
      src: "动物福利机构关于「安全基地」与惩罚性使用后果的公开立场"
    },
    {
      code: "LP", id: "PER/LP", name: "激光笔", en: "Laser Pointer",
      role: "deprecated", seq: ["chase"], forage: false, dns: [],
      default: "ban", grade: "B", wear: null, play: null,
      driver: "—",
      intent: "本类只服务「追逐」相，不提供任何终点。序列在追逐相卡住 —— 这就是它全部的问题，也是它被整类弃用的唯一理由。",
      duty: "—",
      gates: [],
      faults: [
        { mode: "追逐相不可闭合", why: "猎物序列缺少咬合相，光点永远抓不到。Merck 兽医手册把「追光／追影」明确归因于目标挫折，并列为需先排除医学原因的行为问题", fix: "换 PER/FP：同样的追逐强度，但狗能咬住" },
        { mode: "光与影的泛化", why: "得不到结果的行为会被强化成跨情境的搜寻：反光手表、墙面光斑、移动的影子都成了新目标", fix: "已出现泛化时按强迫行为处理，转行为兽医" },
        { mode: "唤醒积聚与转移攻击", why: "持续高唤醒无处释放，可能转向同住的其它个体", fix: "同上；并检查该个体是否存在医学原因" }
      ],
      src: "Merck 兽医手册·行为医学篇（目标挫折）；PDSA 与兽医行为学界的公开警示"
    }
  ];

  function cls(code) { for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].code === code) return CLASSES[i]; return null; }

  /* ==========================================================
     6. 弃用与迁移
     ========================================================== */
  var DEPRECATED = [
    {
      code: "LP", since: "v0.12", kind: "整类弃用",
      reason: "序列不可闭合：只服务追逐相，不提供咬合相",
      migrateTo: "FP",
      note: "与 DEPRECATED: dog_age × 7 不同，这一条不是被更好的算法取代，而是被承认：这个接口从第一版起就不应该存在。"
    }
  ];

  /* ==========================================================
     7. 气道模型
     气管内径取临床插管尺寸表（麻醉学教材的按体重推荐值）。
     它给出的是「气道堵塞」门槛，不是「消化道梗阻」门槛 ——
     后者取决于咽部与口腔，没有可引用的公开表，本项目不给数值。
     ========================================================== */
  var AIRWAY_TABLE = [
    { kg: 2, mm: 5.0 }, { kg: 4, mm: 6.0 }, { kg: 7, mm: 7.0 }, { kg: 9, mm: 7.5 },
    { kg: 12, mm: 8.0 }, { kg: 16, mm: 9.0 }, { kg: 20, mm: 10.0 }, { kg: 30, mm: 12.0 },
    { kg: 40, mm: 14.0 }, { kg: 60, mm: 16.0 }
  ];
  var AIRWAY_FACTOR = 1.5;   // 本项目推导：最小外径须大于气管内径的 1.5 倍
  var BRACHY_FACTOR = 0.85;  // 短鼻品种气管偏细，取 0.85（C 级修正）

  function airwayMm(kg, brachy) {
    var t = AIRWAY_TABLE, v = clamp(kg || 10, t[0].kg, t[t.length - 1].kg), i = 0;
    while (i < t.length - 2 && v > t[i + 1].kg) i++;
    var a = t[i], b = t[i + 1];
    var mm = a.mm + (b.mm - a.mm) * (v - a.kg) / (b.kg - a.kg);
    if (brachy) mm *= BRACHY_FACTOR;
    return round(mm, 1);
  }
  function airwayGateMm(kg, brachy) { return round(airwayMm(kg, brachy) * AIRWAY_FACTOR, 1); }

  /* ==========================================================
     8. 单个设备的门槛检查
     spec: { cls, material, diameterMm, vent, nailDent, edges, declared:[] }
     dev : { cls, minutes, sessions }
     ========================================================== */
  function checkDevice(dev, spec, profile) {
    spec = spec || {};
    var c = cls(dev.cls);
    if (!c) return { error: "404 DEVICE CLASS UNKNOWN", cls: dev.cls };

    var p = profile || {};
    var kg = p.weightKg || 10;
    var ageM = p.ageMonths != null ? p.ageMonths : 36;
    var rows = [];

    function row(key, status, detail) {
      var g = gate(key);
      rows.push({ key: key, label: g ? g.label : key, kind: g ? g.kind : "", status: status, detail: detail, basis: g ? g.basis : "", grade: g ? g.grade : "" });
    }

    c.gates.forEach(function (k) {
      if (k === "airway") {
        var need = airwayGateMm(kg, p.brachycephalic);
        if (spec.diameterMm == null) { row(k, "warn", "未提供最小外径，无法验证（门槛 " + need + " mm）"); return; }
        row(k, spec.diameterMm >= need ? "pass" : "fail",
          "最小外径 " + spec.diameterMm + " mm / 门槛 " + need + " mm（气管 " + airwayMm(kg, p.brachycephalic) + " mm × " + AIRWAY_FACTOR + "）");
      } else if (k === "mouthfit") {
        row(k, spec.vent ? "pass" : "manual",
          spec.vent
            ? "带通气孔：即使被卡住空气仍可通过，本条不再作为否决项"
            : "无通气孔 → 必须「无法整颗含进嘴里」。这一条没有可引用的尺寸，只能现场判：塞进嘴里后能否整个没入口腔");
      } else if (k === "vent") {
        row(k, spec.vent ? "pass" : "warn", spec.vent ? "已声明通气孔" : "无通气孔：嵌顿后形成密封的门槛更低");
      } else if (k === "hardness") {
        if (spec.nailDent == null) { row(k, "warn", "未做指甲压痕测试"); return; }
        row(k, spec.nailDent ? "pass" : "fail", spec.nailDent ? "指甲压得出痕：有缓冲" : "指甲打滑／变弯：太硬，会先把牙崩掉");
      } else if (k === "edge") {
        row(k, spec.edges === "pointed" ? "fail" : "pass", spec.edges === "pointed" ? "已出现尖点／锯齿：立即退役" : "边缘光滑");
      } else if (k === "growth") {
        var need2 = kg >= 30 ? 18 : 12;
        row(k, ageM >= need2 ? "pass" : "fail",
          ageM + " 月龄 / 本体重档门槛 " + need2 + " 月龄（生长板闭合前禁垂直跳跃与空中接取）");
      } else if (k === "dentition") {
        row(k, ageM >= 9 ? "pass" : "fail", ageM + " 月龄 / 门槛 9 月龄（成牙时间两说，取保守值）");
      } else if (k === "angle") {
        row(k, "rule", "操作规则：只做水平牵引。上下方向牵拉同时加大脊柱与颞下颌关节载荷");
      } else if (k === "body") {
        row(k, p.longBacked ? "fail" : "pass", p.longBacked ? "体长背短个体：本类中的跳跃与对抗动作已列入禁忌" : "非体长背短个体");
      } else if (k === "linear") {
        if (!spec.hasRope) { row(k, "n/a", "本款式不含绳状结构"); return; }
        row(k, spec.frayed ? "fail" : "pass", spec.frayed ? "已出现松散纤维：立即退役" : "绳体完好；出现松散纤维即退役");
      } else if (k === "smallpart") {
        row(k, spec.exposed ? "fail" : "pass", spec.exposed ? "发声器／填充物已外露：立即退役" : "可分解件未外露");
      } else if (k === "material") {
        var d = spec.declared || [];
        // 空白记为警告，不记为不合格。理由是：本类外设没有强制标准，
        // 把「没有声明」直接判成「不安全」既不诚实也没有信息量。
        // 它该待的位置是来源行与合规空白计数，而不是否决项。
        row(k, d.length ? "pass" : "warn",
          d.length ? "已声明：" + d.join("、")
                   : "无任何可核验声明 —— 本类外设没有强制合规标准，因此这一格空白本身就是结论，而不是一次不合格");
      } else if (k === "retract") {
        row(k, "rule", "伸缩绳不在推荐配置内。候诊区必须用固定长度牵引（§26）");
      }
    });

    var fail = rows.filter(function (r) { return r.status === "fail"; }).length;
    var complianceBlank = rows.some(function (r) { return r.key === "material" && r.status === "warn"; });
    var verdict = c.default === "ban" ? "ban" : fail ? "fail" : c.default === "cond" ? "cond" : "ok";

    return {
      cls: c.code, id: c.id, name: c.name, role: c.role, default: c.default,
      minutes: dev.minutes || 0, sessions: dev.sessions || 1,
      contributes: c.play, contributesSocial: c.role === "coop",
      verdict: verdict, fails: fail, complianceBlank: complianceBlank, rows: rows
    };
  }

  /* ==========================================================
     9. 序列闭合检查
     规则：若部署的设备里存在服务「早期相」的，却不含任何服务
     「终点相」（咬合或分解）的，则本次配置不合格。激光笔是这条
     规则唯一需要存在的理由。
     ========================================================== */
  function sequenceCheck(checked) {
    var has = {}, byStage = {}, covered = [], missing = [];
    // 注意：这里不做「合格筛选」。闭合与否看的是「这份配置服务了哪些相」，
    // 而不是「这些设备是否合格」—— 被禁用的设备恰恰是最需要暴露这一点的。
    checked.forEach(function (d) {
      var c = cls(d.cls);
      if (!c) return;
      c.seq.forEach(function (s) {
        has[s] = true;
        (byStage[s] = byStage[s] || []).push(d.id || c.id);
      });
    });
    SEQ.forEach(function (s) { if (has[s.key]) covered.push(s.key); else missing.push(s.key); });

    var early = !!(has.orient || has.stalk || has.chase);
    var terminal = !!(has.grab || has.dissect);
    var empty = covered.length === 0;
    var closed = empty || !early || terminal;
    return {
      covered: covered, missing: missing, byStage: byStage, empty: empty,
      early: early, terminal: terminal, closed: closed,
      verdict: empty ? "无外设" : (closed ? "闭合" : "未闭合"),
      rule: empty
        ? "本次没有部署任何服务捕猎序列的外设。空配置不存在序列问题，也不承接任何运动配额"
        : (closed
          ? "猎物序列含终点相（咬合或分解）。可部署"
          : "只部署了服务早期相的外设，没有任何提供咬合或分解相的外设 —— 序列会停在追逐相。这是激光笔整类被弃用的机制，也是本条规则存在的唯一理由")
    };
  }

  /* ==========================================================
     10. 配额覆盖率（不写死，从 DogQuant.DNS_DIMS 现算）
     ========================================================== */
  function coverage() {
    var Q = quant();
    if (!Q || !Q.DNS_DIMS) return { error: "422 QUANT KERNEL ABSENT" };
    var kind = { exercise: "transducer", sniff: "transducer", cognitive: "transducer", social: "none", rest: "host" };
    var out = { addressable: 0, structural: 0, host: 0, rows: [] };
    Q.DNS_DIMS.forEach(function (d) {
      var k = kind[d.key] || "none";
      var row = { key: d.key, label: d.label, weight: d.weight, pct: pct(d.weight), kind: k };
      if (k === "transducer") out.addressable += d.weight;
      else if (k === "host") out.host += d.weight;
      else out.structural += d.weight;
      out.rows.push(row);
    });
    out.addressablePct = pct(out.addressable);
    out.structuralPct = pct(out.structural);
    out.hostPct = pct(out.host);
    out.sum = round(out.addressable + out.structural + out.host, 4);
    out.note = "权重复算自 DogQuant.DNS_DIMS；本内核不含第二份配额数据";
    return out;
  }

  /* ==========================================================
     11. 磨损预测
     ========================================================== */
  function wearForecast(materialKey, chewClass, perDay) {
    var w = WEAR[materialKey];
    if (!w) {
      return {
        band: null, material: materialKey,
        note: "本材质没有可引用的观察区间。本项目不给数值 —— 退役判据不看日历，看外观",
        inspect: "每次使用前检查：破口、尖点、松散纤维、外露部件"
      };
    }
    var dom = clamp(chewClass || 3, 1, 5), pd = clamp(perDay || 1, 0.5, 6);
    var intensity = clamp(1 + (dom - 1) * 0.35 + (pd - 1) * 0.22, 0.5, 3.6);
    return {
      band: w, material: materialKey,
      chewClass: dom, perDay: round(pd, 1), intensity: round(intensity, 2),
      lo: Math.max(1, Math.round(w.lo / intensity)), hi: Math.max(2, Math.round(w.hi / intensity)),
      note: "区间取自" + w.src + "（C 级）。按啃咬强度 " + dom + "/5、每日 " + round(pd, 1) + " 次折算后得出上表，仅作预算参考",
      inspect: "退役判据不看日历，看外观。每次使用前检查：破口、尖点、松散纤维、外露部件"
    };
  }

  /* ==========================================================
     12. 整份配置：配额增量 + 环境抑制 + 短路
     ========================================================== */
  function lineup(devices, profile, env, act, flags) {
    var Q = quant();
    if (!Q) return { error: "422 QUANT KERNEL ABSENT", note: "本内核不复制配额权重，必须先加载 assets/js/quantify.js" };

    devices = devices || [];
    act = act || {}; env = env || {};
    var checked = devices.map(function (d) { return checkDevice(d, d.spec, profile); });
    var seqR = sequenceCheck(checked);

    // 分诊短路优先于一切（§29 的规则在这里同样适用）
    var tri = flags ? Q.triage(flags) : null;
    var shortCircuit = !!(tri && tri.priority <= 1);

    var base = {
      walkMin: act.walkMin || 0, playMin: act.playMin || 0, sniffMin: act.sniffMin || 0,
      socialMin: act.socialMin || 0, chewMin: act.chewMin || 0,
      sleepHours: act.sleepHours != null ? act.sleepHours : 13
    };
    var withDev = {
      walkMin: base.walkMin, playMin: base.playMin, sniffMin: base.sniffMin,
      socialMin: base.socialMin, chewMin: base.chewMin, sleepHours: base.sleepHours
    };

    var applied = [], blocked = [];
    checked.forEach(function (d, i) {
      if (d.error || d.verdict === "fail" || d.verdict === "ban") { blocked.push(d); return; }
      var c = cls(d.cls);
      var m = (d.minutes || 0) * (d.sessions || 1);
      if (!c.play || !m) { applied.push({ id: d.id, name: d.name, added: 0, target: null, role: c.role }); return; }
      withDev[c.play] += m;
      if (d.contributesSocial) withDev.socialMin += m;
      applied.push({ id: d.id, name: d.name, added: m, target: c.play, role: c.role, coop: d.contributesSocial });
    });

    var dnsBefore = Q.dns(profile || {}, base);
    var dnsAfter = Q.dns(profile || {}, withDev);
    var dims = dnsAfter.dims.map(function (d, i) {
      var b = dnsBefore.dims[i];
      return {
        key: d.key, label: d.label, weight: d.weight,
        before: b.actual, after: d.actual, target: d.target, unit: d.unit,
        scoreBefore: b.score, scoreAfter: d.score
      };
    });

    // 环境抑制：抑制器不产生分钟，只改 HRI 的输入
    var hriBefore = Q.hri(profile || {}, env);
    var suppressors = checked.filter(function (d) { return cls(d.cls).role === "suppressor" && d.verdict !== "fail"; });
    var dT = 0;
    devices.forEach(function (dev) {
      var c = cls(dev.cls);
      if (c && c.role === "suppressor" && dev.deltaC != null) dT += Math.abs(dev.deltaC);
    });
    var hriAfter = dT > 0
      ? Q.hri(profile || {}, { tempC: (env.tempC != null ? env.tempC : 22) - dT, humidityPct: env.humidityPct, sun: env.sun, acclimatedDays: env.acclimatedDays })
      : hriBefore;

    var cov = coverage();

    return {
      schema: "dog-periph/v1",
      coverage: cov,
      sequence: seqR,
      devices: checked,
      applied: applied,
      blocked: blocked.map(function (d) { return { id: d.id, name: d.name, verdict: d.verdict, fails: d.fails }; }),
      dns: {
        before: dnsBefore, after: dnsAfter,
        delta: dnsAfter.score - dnsBefore.score, dims: dims,
        cappedNow: dnsAfter.capped, gap: dnsAfter.gap
      },
      env: {
        hriBefore: hriBefore.score, hriAfter: hriAfter.score,
        bandBefore: hriBefore.band, bandAfter: hriAfter.band,
        deltaTempC: round(dT, 1),
        outdoorAllowedBefore: hriBefore.outdoorAllowed, outdoorAllowedAfter: hriAfter.outdoorAllowed,
        suppressors: suppressors.length,
        note: hriAfter.score < 0
          ? "HRI 出现负值属引擎的原有行为：气温低于 22 °C 时 (T−22)×0.6 为负，再叠加「已热适应 −2」。负值读作「无热风险因子」，不是差错"
          : ""
      },
      compliance: {
        blank: checked.filter(function (d) { return d.complianceBlank; }).length,
        total: checked.length,
        note: "本类外设没有强制合规标准。因此「已声明」是自愿行为，而「空白」不是不合格 —— 它是缺省状态"
      },
      triage: tri ? { code: tri.code, priority: tri.priority } : null,
      shortCircuit: shortCircuit,
      shortCircuitNote: shortCircuit
        ? "分诊结论为 " + tri.code + "。按 §29，其余接口在此状态下不再有意义 —— 外设清单同样不例外。先开车。"
        : (hriBefore.outdoorAllowed === false
          ? "HRI 硬停生效：户外类外设（球／盘／杆）本次不计入。外设不能覆盖硬停，这与分诊短路是同一条规则的两个位置。"
          : ""),
      disclaimer: "全部结论为部署建议，不是诊断。外设不能把 100% 的配额补齐 —— 见 coverage 那三个数。"
    };
  }

  /* ==========================================================
     13. 公开来源
     ========================================================== */
  var SOURCES = [
    { topic: "气管内径按体重推荐值（气道门槛的基础表）", grade: "B", src: "小动物麻醉学教材的插管尺寸表（McKelvey & Hollingshead；另见兽医麻醉学表 12.2 / 20-1）" },
    { topic: "宠物玩具无强制安全标准", grade: "B", src: "CPSC 仅监管儿童玩具（ASTM F963）；APPA：几乎没有仅适用于宠物玩具制造的联邦或州法律" },
    { topic: "可自愿核验的合规路径", grade: "B", src: "FDA 食品接触（21 CFR 177.2600）、EN 71-3、ASTM F963 / CPSIA、OEKO-TEX Standard 100" },
    { topic: "绒面球磨耗牙釉质", grade: "B", src: "AKC 引述兽医牙科专家意见（Thomas Chamberlain）；VCA 关于磨耗与 blunting 的提示" },
    { topic: "球体嵌顿与气道梗阻", grade: "B", src: "AKC 与 VCA：强力咬合可咬裂球体，半边可卡在咽喉；「能整颗含进嘴里」的玩具更危险" },
    { topic: "网球竞赛规格（尺寸不由狗决定）", grade: "B", src: "ITF Rules of Tennis 附录一：TYPE 2 直径 6.54–6.86 cm、质量 56.0–59.4 g；球面须为织物覆盖" },
    { topic: "指甲压痕测试与板状断裂", grade: "B", src: "兽医牙科（Veterinary Dentistry of Missouri 等）：上第四前臼齿／下第一臼齿的剪切机制" },
    { topic: "鹿角／蹄／骨的致伤性", grade: "B", src: "FDA 关于骨类零食的公开提示；兽医牙科关于高发致伤物的统计" },
    { topic: "绳类线性异物", grade: "B", src: "兽医外科与急诊：吞入绳纤维形成 linear foreign body" },
    { topic: "生长板闭合与跳跃年龄分档", grade: "B", src: "AKC《幼犬跳跃安全》：生长板至少 12 月龄闭合，巨型／晚熟品种更晚" },
    { topic: "体长背短品种的椎间盘风险", grade: "C", src: "多来源引用的腊肠 IVDD 风险区间（约均值 10–12 倍；19–24% 一生出现临床症状；高峰 3–7 岁）" },
    { topic: "激光笔综合征", grade: "B", src: "Merck 兽医手册·行为医学篇（追光／追影归因于目标挫折，需先排除局灶性癫痫等医学原因）；PDSA 公开警示" },
    { topic: "拔河的两方意见", grade: "C", src: "训练与行为侧：无证据显示引发攻击行为；牙科侧：持续牵拉对犬齿的载荷风险。本规范并列记录，不取定论" },
    { topic: "丰富化与漏食器的证据边界", grade: "C", src: "福利指南支持物种适配的环境丰富化；逐产品对照试验有限，故本项目对厂商宣称一律保守" },
    { topic: "压制式器械与器械选择", grade: "C", src: "Fear Free 立场的兽医机构关于颈圈／压制器械的公开说明" }
  ];

  /* ==========================================================
     14. 自检：本内核与自己的一致性
     ========================================================== */
  function selfTest() {
    var errs = [];
    var Q = quant();
    if (!Q) errs.push("DogQuant 未接入：覆盖率与配额增量无法计算");

    var cov = coverage();
    if (!cov.error) {
      if (Math.abs(cov.sum - 1) > 1e-6) errs.push("覆盖率三部分之和 ≠ 1（" + cov.sum + "）");
      if (cov.rows.length !== (Q ? Q.DNS_DIMS.length : cov.rows.length)) errs.push("覆盖率的维度数与引擎不一致");
    }

    for (var i = 0; i < CLASSES.length; i++) {
      var c = CLASSES[i];
      if (!c.role || !ROLES.some(function (r) { return r.key === c.role; })) errs.push(c.code + " 的角色未注册：" + c.role);
      if (!c.default) errs.push(c.code + " 缺少 default 判定");
      if (!c.intent) errs.push(c.code + " 缺少 intent");
      if (!c.src) errs.push(c.code + " 缺少来源");
      c.seq.forEach(function (s) {
        if (!SEQ.some(function (x) { return x.key === s; })) errs.push(c.code + " 引用了未定义的序列相：" + s);
      });
      c.gates.forEach(function (g) { if (!gate(g)) errs.push(c.code + " 引用了未定义的门槛：" + g); });
      c.dns.forEach(function (d) {
        if (Q && !Q.DNS_DIMS.some(function (x) { return x.key === d; })) errs.push(c.code + " 引用了未定义的配额维度：" + d);
      });
      if (c.play && Q) {
        var ok = ["walkMin", "playMin", "sniffMin", "socialMin", "chewMin"].indexOf(c.play) >= 0;
        if (!ok) errs.push(c.code + " 的 play 目标不是引擎的输入项：" + c.play);
      }
    }

    // 序列闭合规则必须真的会失败：拿激光笔当反例
    var lpSeq = sequenceCheck([checkDevice({ cls: "LP", minutes: 10 }, {}, { weightKg: 12, ageMonths: 36 })]);
    if (lpSeq.closed) errs.push("闭合规则失效：只服务追逐相的配置被判为闭合");
    if (lpSeq.verdict !== "未闭合") errs.push("闭合规则的判定文案异常：" + lpSeq.verdict);

    // 气道表必须单调不减
    for (var j = 1; j < AIRWAY_TABLE.length; j++) {
      if (AIRWAY_TABLE[j].mm < AIRWAY_TABLE[j - 1].mm) errs.push("气道表非单调：第 " + j + " 项");
      if (AIRWAY_TABLE[j].kg <= AIRWAY_TABLE[j - 1].kg) errs.push("气道表体重未递增：第 " + j + " 项");
    }

    if (DEPRECATED.some(function (d) { return !cls(d.migrateTo); })) errs.push("弃用项的迁移目标未注册");

    var banned = CLASSES.filter(function (c) { return c.default === "ban"; }).map(function (c) { return c.code; });
    return {
      ok: errs.length === 0, errors: errs,
      stats: {
        classes: CLASSES.length, gates: GATES.length, roles: ROLES.length,
        stages: SEQ.length, banned: banned, deprecated: DEPRECATED.length,
        addressable: cov.error ? null : cov.addressablePct
      }
    };
  }

  return {
    version: "dog-periph/v1",
    SEQ: SEQ, FORAGE: FORAGE, ROLES: ROLES, GATES: GATES, CLASSES: CLASSES,
    WEAR: WEAR, DEPRECATED: DEPRECATED, SOURCES: SOURCES,
    AIRWAY_TABLE: AIRWAY_TABLE, AIRWAY_FACTOR: AIRWAY_FACTOR,
    attachQuant: function (q) { attached = q; return this; },
    cls: cls,
    airwayMm: airwayMm,
    airwayGateMm: airwayGateMm,
    checkDevice: checkDevice,
    sequenceCheck: sequenceCheck,
    coverage: coverage,
    wearForecast: wearForecast,
    lineup: lineup,
    selfTest: selfTest
  };
});
