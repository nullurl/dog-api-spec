# DOG API — 狗狗接口规范

> 受《HUMAN API — 人类接口规范》启发，用同一套工程文体处理另一种已经大规模部署、却始终没有官方说明书的系统：**狗**。
> 区别在于：这次把实测数据、运维手册和公开信源一起写了进去。

## 这是什么

一套静态站点 + 参考客户端，内容是一份"伪技术规范"。文体是故意的：把生物写成系统之后，那些我们习以为常的事会显出原来的形状。

- **DOG API** —— 35 章 + 附录 A–R。嗅觉阵列全双工、摇尾的方向性编码、地磁对齐、全天行为预算、生理基线、就医标准场景、量化接口定义、表情接口定义、外设总线、与人类的互操作。
- **参考页** —— 速查卡、生理指标、错误码对照、术语表。
- **量化方案** —— 计算内核 + 14 个标准场景 + 交互式评估器。每个参数带单位、取值范围、采样频率、报警阈值与来源等级。
- **表情引擎** —— 13 维参数向量 + 14 个可观测状态，离线渲染成 24×24 像素 SVG。零依赖、零网络、逐像素确定性。
- **外设总线** —— 14 类外设（球 / 飞盘 / 拔河绳 / 嗅闻垫 / 漏食器 / 啃咬物 / 逗猫棒式竿 …）＋ 13 道安全门槛＋ 33 种失效模式。含一条硬性序列闭合规则，与一条明确的整类弃用。
- **SDK** —— 参考客户端 + 可点击的接口控制台。量化端点由内核实算，零依赖、零网络请求。

## 快速开始

无构建步骤，无依赖，无服务器要求。

```bash
# 方式一：直接打开
open index.html

# 方式二：如果浏览器限制本地文件（一般不会），起个静态服务
python3 -m http.server 8000
# 然后访问 http://localhost:8000/
```

入口是 `index.html`；只想看规范就直接去 `spec/dog.html`。

## 目录结构

```
.
├── index.html                    项目首页
├── versions.html                 历史版本（修订序列 / 版本轴 / 存档入口）
├── spec/                         规范正文与机器可读定义
│   ├── dog.html                  DOG API（35 章 + 附录 A–R）
│   ├── norm-ids.json             规范 ID 注册表（由 scripts/sync-norm-ids.js 生成）
│   ├── openapi.yaml              OpenAPI 3.1 结构描述
│   └── quantified-api.yaml       量化接口描述（§4.5 的 10 个端点）
├── reference/                    速查页（可打印）
│   ├── cheatsheet.html           速查卡
│   ├── errors.html               错误码对照（13 个状态码）
│   ├── glossary.html             术语表与公共约定
│   ├── norm-ids.html             规范 ID 登记表（由脚本生成）
│   ├── opinions.html             一只狗的生活意见（第二声部 · 31 条意见）
│   ├── voice.html                口吻与文体（双声部定义 · 正反示例 · 回退清单）
│   └── vitals.html               生理指标速查
├── tools/                        交互页面（用浏览器打开）
│   ├── quantifier.html           量化评估器（调用引擎算真数）
│   ├── expression.html           表情画廊 + 参数台 + 混合台
│   ├── expression-sheet.html     表情联系表（由 scripts/expression.js --sheet 生成）
│   ├── charts.html               图表图鉴（19 张手写 SVG）
│   ├── peripherals.html          外设控制台
│   └── adoption.html             领养 KEY（按 §5.3 派生 / 核验 / 查测试向量）
├── sdk/                          参考客户端
│   ├── dog-api-client.js         DogClient（含量化端点）
│   ├── demo.html                 交互式接口控制台
│   ├── curl.md                   curl 示例
│   └── README.md                 接入说明
├── archive/                      冻结的历史形态 —— 只增不改
│   ├── README.md                 存档说明、版本轴、偏离记录
│   └── single-file-v0.7.html     0.8.0 之前的单文件版（27 章，自包含可离线打开）
├── skill/                        DOG API 领养技能 —— 安装即授权，卸载即撤回
│   ├── SKILL.md                  技能说明与安装命令
│   └── dog_adopt.py              派生 / 核验领养 KEY（纯标准库，不联网）
├── assets/                       运行时资源 —— 页面加载的就是这些
│   ├── css/spec.css              共享样式（浅色主题，支持打印）
│   ├── data/                     内容数据（内联在 JS 里，不用 fetch）
│   │   ├── dog.js                规范正文 35 章
│   │   └── appendices.js         附录 A–R
│   └── js/                       运行时内核（纯计算 / 纯渲染，零依赖）
│       ├── render.js             共享渲染器（导航 / 目录 / 正文 / 协议约定）
│       ├── quantify.js           量化引擎（参数注册表 / 公式 / 评分模型 / 分诊）
│       ├── scenarios.js          标准场景库（D 日常 / M 医疗 / E 应急，14 个）
│       ├── expression.js         表情渲染引擎（13 维向量 → 24×24 像素 SVG）
│       ├── charts.js             图表渲染引擎（19 个图型 → 手写 SVG，内联 Mono 令牌）
│       ├── peripherals.js        外设内核（14 类 / 13 门槛 / 序列闭合 / 磨损预测）
│       ├── adoption-key.js       领养 KEY 派生内核（零依赖 SHA-256 + Crockford Base32）
│       └── adoption-widget.js    领养组件（首页用：安装命令 / 授权三态 / KEY 派生同框）
├── scripts/                      开发脚本 —— 页面不加载
│   ├── expression.js             表情命令行（svg / ascii / json / snippet / sheet）
│   ├── sync-params.js            由引擎注册表反向同步附录 P 与各文档计数
│   └── sync-norm-ids.js          由数据模块生成规范 ID 登记表与注册表
└── docs/                         人读文档
    ├── CHANGELOG.md              修订历史
    ├── CONTRIBUTING.md           贡献指南
    ├── quantification.md         量化模型说明（来源等级 / 公式 / 评分）
    ├── expression.md             像素表情渲染说明（几何 / 体积 / 混合语义）
    └── expression-geometry.md    表情几何踩坑记录（改几何前先读）
```

四层的职责边界是硬的：**`assets/` 是页面运行时要加载的，`scripts/` 只有开发时跑，
`docs/` 是给人读的，其余目录是给人看的页面。** 加文件之前先问一句它属于哪一层。

`archive/` 不属于这四层里的任何一层：它是**冻结**的历史产物，只增不改。规则见 `archive/README.md`。

`reference/` 里的 `voice.html` 与 `opinions.html` 是一对：前者**定义**这套文档怎么说话，
后者**使用**它。正文里以「本机：」开头的引用块属于后者的声部 —— 它没有出处，也不给建议。

首页上的 `#adoption-widget` 是把「安装即授权」做成的一个**自包含组件**：安装命令、授权三态、
KEY 派生同框。它不检测本机装没装技能（页面既没有这个权限，也没有这个必要），
逻辑全在 `assets/js/adoption-widget.js` 里，命令与三态文案都只在那里定义一次。
组件默认停在出厂元组上，所以首页一打开就实测了一次「元组相同 → KEY 相同」，
并与 §5.3 的测试向量 1 逐字节比对。

同一个模块在不同目录里用**同一个词干**，由目录区分角色：

| 角色 | 文件 |
| --- | --- |
| 运行时内核 | `assets/js/expression.js` |
| 交互页面 | `tools/expression.html` |
| 生成物（由脚本写出） | `tools/expression-sheet.html` |
| 开发脚本 | `scripts/expression.js` |
| 说明文档 | `docs/expression.md` · `docs/expression-geometry.md` |

本仓库里**不会**再有 `charts-dog.js`、`data-dog.js` 这类文件名 —— 整个站点只服务 DOG 一个系统，
在文件名里重复系统名是多余的。看到 `charts.js`、`dog.js` 就是了。

## 内容架构

项目刻意把**正文**与**附录**拆成两个模块：

- `assets/data/dog.js` —— 规范正文，由最早的单一 HTML 文件提取而来。改动正文等于改规范。
- `assets/data/appendices.js` —— 附录：术语表、品种档案、SLA、错误码全表、迁移指南、值班手册、隐私审计、问题清单、SDK 指引、支持渠道。新增附录只需在数组里追加一个对象，**导航与编号会自动生成**。

`render.js` 负责注入顶部导航、侧栏目录（编号自动生成，附录用 A/B/C 标号）、正文与滚动高亮。

## 量化方案

这是 0.9 起新增的部分。目标很朴素：**让文档里那些数字可以被算出来，而不是被引用。**

- `assets/js/quantify.js` —— 计算内核。26 项参数注册表（含单位 / 范围 / 采样 / 报警阈值 / 来源等级）、11 条派生公式、3 个评分模型、分诊矩阵、免疫与驱虫排程生成。
- `assets/js/scenarios.js` —— 14 个标准场景（日常 4 · 医疗 6 · 应急 4），共 69 个时序步骤与 38 条量化门槛。
- `tools/quantifier.html` —— 交互式评估器。页面上的每个数字都来自内核，无一处硬编码。
- `scripts/sync-params.js` —— 单一事实源脚本。由注册表反向生成附录 P 的表格与各文档里的参数计数。
- `spec/quantified-api.yaml` —— 端点与数据结构的机器可读描述。

三个评分模型：

| 模型 | 量程 | 做什么 | 等级 |
| --- | --- | --- | --- |
| `DNS` 日常需求达成度 | 0–100 | 运动 / 嗅闻 / 社交 / 休息 / 认知 五维加权，任一维度 <60 则总分封顶 79 | C |
| `HRI` 热风险指数 | 无量纲 | 气温、湿度、日照、短鼻结构、被毛、体重、年龄、热适应逐项累加 | C |
| `VSI` 就诊应激指数 | 0–10 | 决定就诊流程强度，**不决定去不去** | C |

**来源等级**：`A` = 同行评议或大规模实测（7 项）· `B` = 临床指南共识（11 项）· `C` = 社区经验或本项目定义（8 项），共 26 项。

**唯一强制性的设计**是短路规则：分诊结果为 `P0` / `P1` 时，所有评分端点返回 `451 VET VISIT REQUIRED`。
量化的第一原则，是知道什么情况下应该停止量化。

```bash
# 验证公式没算错
node -e '
const Q = require("./assets/js/quantify.js");
console.log(Q.rer(12.5));                  // 70 × 12.5^0.75
console.log(Q.util.humanYears(4));         // 16·ln4 + 31
console.log(Q.triage({gdv:true}).code);    // P0
'
```

## 表情引擎

这是 0.10 起新增的部分。目标同样朴素：**让"表情"这件事变成一份可复现的接口，而不是一组插画。**

- `assets/js/expression.js` —— 渲染内核。13 维参数向量、14 个可观测状态、24×24 栅格 → 像素 SVG。纯函数，浏览器与 Node 通用，零依赖、零网络。
- `tools/expression.html` —— 交互画廊 + 参数台 + 混合台。页面上的图形全部由内核实算。
- `scripts/expression.js` —— 命令行，见下。
- `docs/expression-geometry.md` —— 几何踩坑记录。**改 `expression.js` 里的坐标之前先读它。**

设计前提只有一句：**接口不生成表情，只编码表情。** 输入相同则输出逐像素相同。

```bash
node scripts/expression.js --selftest            # 引擎断言（含 SICK=基线、UNKNOWN=剪影、compose 200/409/422）
node scripts/expression.js --list                # 14 个状态
node scripts/expression.js --ascii JOY           # 点阵，终端里最快看清一帧
node scripts/expression.js --all --out ./expr    # 导出全部帧
node scripts/expression.js --sheet ./expr/sheet.html
node scripts/expression.js --snippet "JOY,GAZE"   # 可直接粘贴的 HTML 片段（内联 data URI）
node scripts/expression.js --compose "JOY:0.75,BEG:0.25" --persist   # 最高权重 <0.60 时返回 409
```

它同时也是**这条规范与人类耦合最具体的一处**：`browInner` 就是内侧眉肌 AU101
（犬有、狼无，Kaminski 等 2019 PNAS），渲染器渲染的正是这条为人类演化出来的通道；
而尾巴、体态与发声不在画面里，它们是响应头 `X-Dog-Tail` / `X-Dog-Body` / `X-Dog-Vocal`。

14 帧实测体积 **757 B – 2 372 B（均值约 1 785 B）**，每色合并为一条 `path`。详见 `docs/expression.md`。
一次性看完全部 14 帧的静态版本在 `tools/expression-sheet.html`（由 `--sheet` 生成，可重新生成）。

## 图表图鉴

这是 0.11 起新增的部分。目标还是同一句：**让数字被画出来，而不是被做成插图。**

图形语言借自 [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts) 的 **Mono**：
纸灰底（`#F0EFEB`）、炭黑墨（`#1C1C1A`）、七级灰阶、不透明不发光不留阴影。规矩只有两条，但都是硬的：

1. **明度即数据。** 不用颜色、不用渐变、不用阴影来区分系列；同一张图里只有一层色彩系统。
2. **柱的契约是长度 ∝ 数值。** 所以柱状图**不断轴**；遇到会把其余数据压扁的极值，宁可**不画**那一行并说明原因，也不截断坐标轴。

- `assets/js/charts.js` —— 渲染内核。19 个图型（柱 / 折线 / 面积 / 环形 / 横条 / 瀑布 / 热力 / 量表 / 哑铃 / 箱线 / K 线 / 点阵 / 双极量表 / 径向叠加 / 漏斗 / 百人场 / 百人队列 / 日历热力 / 平行坐标），手写 SVG，零依赖、零网络。
- `tools/charts.html` —— 图鉴页。19 张卡片 + 一张「图型索引」表（标明每一张对应 Lieflat 目录里的哪个图型、参考实现是哪个模板文件、数据来自内核还是合成示意、来源等级是 A / B / C）。
- 数据层**不另抄一份常量**：能量、饮水、配额、热风险 HRI、就诊应激 VSI、分诊优先级、生命阶段、DNS 权重全部实时问 `DogQuant`；表情四维取自 `DogExpression.stateParams()` 的真实向量。合成示意数据一律在来源行标注为 **C 级**。

确定性渲染：抖动取自 `rnd(i,k) = |((i·73856093) ^ (k·19349663)) % 1000| / 1000`，与表情引擎同源 —— **输入相同则输出逐字节相同**。
面积类图型一律开方（`Math.sqrt`）再做长度编码，以保证下墨面积与数值成正比，而不是与数值的平方成正比。

```bash
# 19 张图全部渲染成 HTML，双击即可看（零网络请求）
open tools/charts.html
```

**为了在本项目里成立，改了四件事**（全部写在页面底部的说明区，不藏在代码里）：

| 改了什么 | 为什么 |
| --- | --- |
| 字体内联为字体栈 | Lieflat 用 Google Fonts 引入 Inter；本项目所有页面必须能直接双击打开，所以装了 Inter 就用、没装就安静回落，**不发网络请求** |
| K 线不用涨跌色 | 跟随 Lieflat 的灰阶语义（实心=收跌、空心=收涨）。体重不是股价，也就不存在两套配色约定打架 |
| 取整要认账 | 1440 分钟折成 100 格、六段百分比取整只有 99，差额**显式**记在「独处 / 其余」上，底注写明分钟数是真的 |
| 极值不画，而非断轴 | K 系数里工作犬 5–11 会把其余七行全压扁，选择不画那一行并在副标题说明，而不是截断坐标轴 |

## 外设总线

这是 0.12 起新增的部分。它回答一个此前被绕开的问题：**这份规范里的系统不接受参数调优，那它到底哪一部分是可插拔的？**

答案是外设。玩具、飞盘、嗅闻垫、啃咬物、牵引装备 —— 这些是唯一由你决定要不要接、接哪个、什么时候退役的部件。所以这一章把「买玩具」写成了**总线协议**，而不是写成一张购物清单。

- `assets/js/peripherals.js` —— 外设内核。`14` 个设备类 · `6` 种角色 · `5` 阶段捕猎序列 · `13` 道门槛 · `33` 种失效模式 · `15` 条来源。
- `tools/peripherals.html` —— 外设控制台。左侧填档案与清单，右侧实时出结论；页面上每一个数字都来自内核。
- §4.7《外设总线》 —— 正文（协议、判定规则、端点定义）。
- 附录 R《外设目录与安全门槛》 —— 目录表、33 种失效模式逐条成因、13 道门槛依据、可打印核对表。

三条设计决定，全部写在页面上：

| 决定 | 为什么 |
| --- | --- |
| **按捕猎序列分类，不按材质分类** | 材质只决定耐磨，序列决定它到底在满足哪一相。一件"橡胶制品"可能只服务追逐相（激光笔），也可能能闭合到咬合相（球）—— 这是两个完全不同的东西 |
| **序列闭合是 MUST，不是 SHOULD** | 只提供早期阶段（定向 / 潜行 / 追逐）而不提供终点（咬合 / 撕解）的配置，会持续累积未完成的序列。这是激光笔被**整类弃用**的唯一理由，而不是"使用不当" |
| **60% 是算出来的，不是定的** | 承接上限由 `DogQuant.DNS_DIMS` 实时复算：运动 25 + 嗅闻 20 + 认知 15 = **60% 可承接**，社交 20% 是**结构性缺口**（没有设备能替代另一个个体），休息 20% 只能被**承载**、不能被替代。内核里不含第二份配额数据 |

```bash
# 内核自检（覆盖求和、门槛注册、序列规则、气道表单调性、弃用迁移目标）
node -e 'require("./assets/js/quantify.js"); var P=require("./assets/js/peripherals.js"); console.log(P.selfTest());'
```

两条短路沿用 §4.5 的既有规则，不新造：**热风险硬停**（气温 ≥32 ℃ 或 HRI ≥10 时户外外设全部挂起）与**分诊短路**（`P0` / `P1` 时所有外设端点返回 `451` —— 先去医院，别挑玩具）。

## 信源

`spec/dog.html` 的**《公开信源》**一章列出全部 52 条公开信源，含期刊、DOI 与临床指南编号。参数类内容均有出处，例如：

- 嗅觉受体 1.25 亿–3 亿 vs 人类 500–600 万；气流 80–85% / 10–15% 分流
- 地磁对齐：Hart 等，2013，*Frontiers in Zoology* 10:80（7,475 次观测）
- 摇尾方向编码：Quaranta 等，2007，*Current Biology*
- "愧疚脸"：Horowitz，2009
- 词汇量 1,022 项：Reid & Pilley，2011，*Behavioural Processes*
- 表观遗传钟：Wang 等，2020，*Cell Systems*
- 催产素凝视闭环：Nagasawa 等，2015，*Science*
- 能量需求公式与系数：T/CVMA 121—2023（中国兽医协会团体标准）
- 血液 95% 参考区间：PLOS ONE，2020，4,804 只犬七年队列
- 急性疼痛评分 CMPS-SF：Reid 等，2007，*Animal Welfare*
- 免疫与寄生虫排程：AAHA Canine Life Stage Guidelines (2019)、AAHA 2022/2024 疫苗指南、WSAVA 2024
- 老年犬定义与体检频次：AAHA Senior Care Guidelines
- 气管内径—体重对应（外设气道门槛的 B 级基准）：临床气管插管尺寸表
- 网球的毛毡与牙釉质磨耗：兽医牙科共识；网球本身的直径与"必须织物覆盖"：ITF 比赛用球规格

阅读建议：**先读《公开信源》，再读正文**。知道哪些是真的之后，剩下的部分才好玩。

## 声明

- **授权：本项目自身的文字、图表、代码与数据采用 CC BY-NC-SA 4.0**（署名 — 非商业性使用 — 相同方式共享）。
  法律全文见 `LICENSE`，授权范围说明与**例外清单**见 `NOTICE`。
  下方单独标注的其他授权只适用于其各自列出的第三方内容，不适用于本项目自身。
- 本项目是文体练习与科普杂糅的产物，**不是饲养指南，也不提供医疗建议**。唯一例外是速查卡里那三条 MUST，它们是认真的。
- 所有评分为**偏差提示**，不是诊断。复合指标（DNS / HRI / VSI）不得用于横向比较不同的狗，只用于同一只狗的纵向趋势。
- 出现 §4.4 分诊矩阵中的 P0 / P1 条目时，不要先算分 —— 直接联系执业兽医。
- `sdk/` 下所有代码均为行为模拟，不发起网络请求，不收集数据。
- `tools/expression.html` 与 `scripts/expression.js` 生成的 SVG 是**观测的编码，不是照片或插画**，请不要当作素材库使用。
  其中 `SICK` 状态的像素与健康基线完全一致 —— 这不是 bug，是那份规范里最严肃的一条。
- 图表使用的 Mono 图形语言与设计令牌来自 **Lieflat Charts**（作者「躺在废墟里」），
  授权为 **PolyForm Noncommercial License 1.0.0**，**仅限非商业用途**。
  本项目按其说明将 `mono-tokens.js` 的内容内联进 `assets/js/charts.js`，色值未做改动；
  19 个渲染函数以 `templates/basics-gallery.html` 与 `templates/lupi-gallery.html` 中的同名图型为结构正本，数据与文案由本项目提供。
  如需商业使用，请自行取得 Lieflat Charts 作者的授权。
- 图表以本项目的数据为准；其中标注为 **C 级示意**的图（合成示例数据）不声称来自实测，请勿用于任何真实个体的判断。
- 外设总线的门槛是**工程判据**（尺寸、硬度、序列闭合、磨损外观），**不是兽医诊断**。
  涉及啃咬造成的牙齿损伤、吞入异物、气道风险或行为问题，请直接联系执业兽医或专业训练师；
  附录 R 的核对表是选购前的筛查工具，不是体检的替代品。
- 外设内核中「序列闭合」与「60% 承接上限」属于本项目定义的复合判据（**C 级**）；
  气道门槛的基准表来自临床文献（**B 级**），但 `1.5×` 系数是本项目推导，不声称来自任何一篇文献。
- 文中提到的具体品种特征仅为**出厂倾向**描述，不构成对任何一只具体动物的预测。

## 添加一个附录

```js
// assets/data/appendices.js
window.DOG_APPENDICES.push({
  id: "apx-example",
  title: "示例附录",
  html: "<p>正文 HTML。</p>"
});
```

刷新即可，无需注册路由。

## 添加或修改一个量化参数

参数**只在** `assets/js/quantify.js` 的 `PARAMS` 里定义，之后交给脚本同步下游：

```bash
node scripts/sync-params.js
```

它会按注册表重写附录 P 的表格与等级分布，并更新 README / `docs/quantification.md` / `index.html` / CHANGELOG 里的参数计数。
脚本是幂等的，可以反复执行；反过来，**手工编辑附录 P 的表格会被下次同步覆盖**。

这么做的原因是本项目自己的一条教训：一份事实一旦有了两个副本，它们就会开始各自漂移
（改之前附录 P 说「睡眠占比」是 A 级、引擎说 B 级，注册表还少了两条）。

## 添加一个表情状态

与量化参数不同，表情状态**没有**第二个副本，所以直接在 `assets/js/expression.js` 的 `STATES` 里追加即可：

```js
{
  id: "SNIFFING", title: "在闻什么", class: "日常",
  params: { earPerk: 0.5, eyeOpen: 0.9, pupilX: -0.2, whaleEye: 0.4, mouthOpen: 0.1 },
  tail: "slow-right", body: "neutral", vocal: "none", confidence: 0.77, suppressed: false,
  note: "注意力被气味通道独占。此时它不是不听话，是没在听。"
}
```

要求只有三条：与既有状态**足够远**（否则那是既有状态的一种写法）、对应一个**可被外部观测**的场景、
`confidence` 如实填 —— 如果这个状态是人类的误读，就把分数压低（`GUILTY` 的 0.22 是范例，不是错误）。

改完必须跑 `node scripts/expression.js --selftest` 并肉眼过一遍 `--ascii`。
附录 Q 的状态表是手工维护的，记得同步。

## 添加一张图表

图表与表情状态一样，**没有第二份副本**：图型只在 `assets/js/charts.js` 里定义一次，页面上的卡片是唯一消费者。

```js
// assets/js/charts.js —— ① 写一个渲染函数，往传进来的 <svg> 节点里塞元素
RENDER['my-chart'] = function (s) {                     // s = 该图的 <svg>
  var base = 264, x = function (i) { return 40 + i * 48; };
  el(s, 'line', { x1: 24, y1: base, x2: 376, y2: base, stroke: GRID, 'stroke-width': .8 });
  D.forEach(function (row, i) {
    var n = txt(s, { x: x(i), y: base - row[1] * 6, 'font-size': 10,
                     fill: INK, 'text-anchor': 'middle' }, row[1]);
    tip(n, row[0] + ' — ' + row[1]);                    // 悬停提示
  });
};

// ② 在 CATALOG 里声明自己（顺序 = 页面上的顺序，vb 必须与 <svg> 的 viewBox 一致）
CATALOG.push({ id: 'my-chart', li: 'F5 Tick Rows', file: 'templates/basics-gallery.html',
               data: 'DogQuant.xxx()', grade: 'C', vb: '0 0 400 320', wide: false, dark: false });
```

可复用的几何助手都在同一个模块里一次性导出：`el(parent, tag, attrs)` / `txt(parent, attrs, text)` / `tip(node, title)`、
`rnd(i, k)`（确定性抖动）、`pol` / `sect`（极坐标与环形扇区路径）、`blob`（手绘感圆）、`smoothPath`（平滑折线）。
比例尺与坐标映射按图各写各的 —— 一张图一条映射，比抽象出一层配置更不容易出错。

页面侧只需加一个 `<svg data-chart="my-chart" viewBox="0 0 400 320"></svg>`，`mount()` 会自己找到它。

三条要求：

1. **`vb` 必须与页面 `<svg>` 的 `viewBox` 一致** —— 这是唯一一处可能漂移的地方，所以放在 CATALOG 里而不是各自硬编码。
2. **来源等级如实填。** 取自 `DogQuant` / `DogExpression` 的写 `A` 或 `B`，合成示意数据的写 `C`，并在卡片 `.src` 行里写明。
3. **不新增色彩系统。** 只用 `MONO` 里的七级灰阶；暗底卡片（`dark: true`）每屏不超过一张。

改完必须自检：

```bash
node --check assets/js/charts.js
node -e '
require("./assets/js/quantify.js");
require("./assets/js/charts.js");
// 在无浏览器环境里跑一遍全部图型，确认没有 NaN / undefined / 越界
' 
# 然后用浏览器打开 tools/charts.html，页脚会自动显示「mounted/total」；两者不等就是有图表没挂上
```

## 添加一个设备类

外设类别**没有第二份副本**：类的定义只在 `assets/js/peripherals.js` 的 `CLASSES` 里出现一次，控制台与附录 R 都是它的消费者。

```js
// assets/js/peripherals.js —— 往 CLASSES 数组里追加一个对象
// （cls() 是逐项查找，所以追加在字面量之后、用 CLASSES.push 也一样生效）
CLASSES.push({
  code: "RW", id: "PER/RW", name: "滚动零食球", en: "Rolling Treat Ball",
  role: "transducer",              // 换能器 / 协作器 / 承载器 / 约束器 / 抑制器 / 已弃用
  seq: ["chase", "dissect"],       // 它满足捕猎序列里的哪几相（空数组 = 不属于序列）
  forage: false,                   // 或者：属于觅食系统（seq 留空，它自成终点）
  dns: ["exercise", "cognitive"],  // 它把哪几维配额从「需要你在场」转成「不需要你在场」
  default: "cond",                 // ok / cond / ban —— 可用 / 默认需逐项判定 / 整类不建议
  grade: "C",                      // 这一条判断的来源等级
  wear: "engineered",              // rope / rubber / engineered；填 null 就是"本项目不给数值"
  play: "playMin",                 // 必须是引擎的输入项：walkMin / playMin / sniffMin / socialMin / chewMin
  gates: ["smallpart", "material"],// 参与哪几道门槛（键必须在 GATES 里存在）
  driver: "滚动 → 追逐 → 漏食",      // 一次典型使用怎么发生
  intent: "把「追」与「取食」接成一个能自己闭合的循环 —— 它不依赖你出手",
  duty: "单次 10–15 分钟；漏食口磨损后出食过快即失效",
  faults: [{ mode: "接缝先开、零食整颗掉出", why: "…", fix: "…", grade: "C" }],
  src: "零售侧观察 / 本项目定义"
});
```

要求只有四条：

1. **`seq` 要诚实。** 一个类只能声明它**真的**能服务的那几相。只写 `chase` 不写终点，就是这个类在给序列闭合规则交欠条 —— 激光笔（`LP`）正是唯一一个因此被整类弃用的例子，它的 `default` 是 `ban`，`migrateTo` 是 `FP`。
2. **`gates` 的键必须真实存在**，且阈值只能来自 `GATES` 与 `AIRWAY_TABLE`。**不要在手写数字**：气道门槛是 `airwayMm(体重, 短鼻) × 1.5`，改体重时它必须跟着动。
3. **`wear` 如实填。** 只有绳、橡胶、工程材料三类有零售侧观察区间（`WEAR`）；其余一类一律填 `null`，控制台会显示"本项目不给数值"，而不是编一个天数。
4. **`intent` 与 `src` 不能空。** 一个回答"它到底在满足哪一相"，一个回答"这条判断凭什么"。这两项空着，`selfTest()` 会直接报出来。

改完必须自检：

```bash
node --check assets/js/peripherals.js

# 内核断言：覆盖率求和为 1、门槛注册完整、序列规则真的会否掉激光笔、气道表单调、弃用迁移目标存在，
# 以及逐类核对 role / default / intent / src / seq 键 / 门槛键 / 配额维 / play 目标
node -e 'require("./assets/js/quantify.js"); var P=require("./assets/js/peripherals.js"); var r=P.selfTest(); console.log(r.ok ? "selfTest OK " + JSON.stringify(r.stats) : r.errors);'

# 全部 14（或更多）个类都要能过一遍判定，不能抛异常
node -e 'require("./assets/js/quantify.js"); var P=require("./assets/js/peripherals.js"); P.CLASSES.forEach(function(c){ P.checkDevice({cls:c.code, minutes:15, sessions:1}, {}, {kg:12, ageMonths:36}); }); console.log("all classes checkable");'
```

附录 R 的目录表是**手工维护**的，加完记得同步那 14 行（与附录 Q 同一类约定）。

---

项目状态：持续 Revising。
