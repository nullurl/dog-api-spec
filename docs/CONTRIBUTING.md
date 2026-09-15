# 贡献指南

欢迎补充内容。本项目的门槛不高，但有几条硬性约定。

## 可以提交什么

| 类型 | 说明 | 落点 |
| --- | --- | --- |
| 新附录 | 运维、行为、医疗、营养、合规等方向 | `assets/js/appendices.js` |
| 正文勘误 | 参数错误、信源失效、逻辑矛盾 | `assets/js/data-dog.js` |
| 新信源 | 附期刊名与 DOI，或权威机构指南编号 | `assets/js/data-dog.js` 的《公开信源》一章 |
| 新接口 | 新增 `endpoint` 条目即可，控制台会自动列出 | `sdk/dog-api-client.js` |
| 新表情状态 | 在 13 维参数空间里新增一个采样点（见第八条） | `assets/js/expression.js` |
| 新图表 | 在 Mono 灰阶语法里新增一个图型（见第九条） | `assets/js/charts-dog.js` |
| 新设备类 | 在外设总线里新增一类玩具 / 装备（见第十条） | `assets/js/peripherals.js` |
| 新门槛 | 新增一条安全判据（必须同时给出依据与放宽条款） | `assets/js/peripherals.js` |
| 图形修正 | 渲染几何、调色板、体积 | `assets/js/expression.js` / `charts-dog.js` |
| 界面修正 | 排版、可读性、打印效果 | `assets/` |

## 硬性约定

**1. 参数必须有出处。**
正文里出现的任何数字（受体数量、体温、寿命、周期、阈值），必须能在《公开信源》一章里找到对应信源。
如果找不到出处，就必须明确标注为 `HEURISTIC`（社区经验值）。**不接受无出处的精确数字。**

**2. 不转载他人正文。**
本项目引用的外部项目、标准与文献，著作权均属各自作者。可以引用、可以对照、可以链接，
但不要把它们的正文抄进本项目。

**3. 不写饲养指导性断言。**
本文档的文体是规范，不是兽医建议。涉及健康、用药、行为干预的内容，
一律指向执业兽医或专业训练师，不要给出"你可以这样处理"式的诊断级建议。

**4. 保持文体纪律。**
全文的幽默来自**文体与事实的反差**，不来自形容词。写法是平铺直叙地陈述事实，
让事实自己说话。不要加入俏皮话、感叹号、网络流行语，也不要解释笑点在哪。
一旦开始解释，这个玩笑就不成立了。

```
✅ 摇尾长期被视为"友好"的布尔值。Quaranta 等（2007）发现这是一条带符号的矢量。
❌ 哈哈哈原来狗狗摇尾巴方向还有这么多学问！左摇是害怕，下次注意啦～
```

**5. 不许编造研究结论。**
可以引用真实研究的真实结论，也可以在明确标注 `HEURISTIC` 的前提下写社区经验。
不可以把不存在的研究写得像存在。《公开信源》是可核验的承诺。

**6. 不涉及具体个体的健康判断。**
可以写"3 岁以上犬只中超过 80% 存在不同程度牙周疾病"（有出处），
不可以写"如果你的狗口臭，它一定有牙周病"（无出处的诊断断言）。

**7. 数字只能有一份事实源。**
量化参数（单位、范围、采样频率、报警阈值、来源等级）**只在 `assets/js/quantify.js` 的 `PARAMS` 里定义**。
附录 P 的表格、各文档里的"共 N 项 / A 级 N 项"计数，全部由脚本从注册表生成。

```bash
# 改完 PARAMS 后必须跑一次（幂等，可反复执行）
node tools/sync-params.js
```

**不要手工编辑附录 P 的表格**，也不要手工改文档里的参数计数 —— 下次同步就会把你覆盖掉。
这条约定的存在理由，本身也写在 CHANGELOG 的 0.9.2 里：同一份事实存在两个副本后，它们一定会开始漂移。

**8. 表情状态是采样点，不是分类边界。**
`assets/js/expression.js` 的 `STATES` 里每个状态 = 13 维参数空间里的一个点 + 三条响应头 + 一条自评。
新增状态时必须同时满足：

- 它的参数向量与**已有状态**足够远（否则不是新状态，是既有状态的一个写法）
- 它对应一个**可被外部观测**的场景，而不是一个内部情绪词
- `confidence` 如实填。**如果一个状态是人类的误读，就把分数压低** —— `GUILTY` 的 0.22 是范例，不是错误
- 三条响应头（`tail` / `body` / `vocal`）必须填，且 `tail` 的取值要在 `X-Dog-Tail` 的既有枚举内

改完图形或状态后必须跑：

```bash
node tools/dog-expression.js --selftest          # 引擎断言，含 SICK=基线、UNKNOWN=剪影、compose 的 200/409/422
node tools/dog-expression.js --ascii <ID>        # 24px 下相邻特征会互相吞掉，肉眼看一遍
node tools/dog-expression.js --all --out /tmp/x  # 再用 XML 解析器校验导出结果
```

几何调试的踩坑记录在 `.workbuddy/skills/dog-expression/reference.md`，改之前请先读。

**9. 图表只锁一种色彩系统。**
`assets/js/charts-dog.js` 用的是 Lieflat Charts 的 **Mono** 灰阶语法，这几条是硬的：

- **只用声明的令牌。** 浅卡用 `INK` / `PAPER` / `MUTED` / `FAINT` / `GRID` 与七级 `L` 阶梯，暗卡用 `DARK` 的对应项。
  **不要写阶梯外的十六进制灰**（写够十张图之后，你会不自觉造出 `#CFCEC7` 这种「差一点的灰」—— 那是本文件教训之一），
  也不要写 `rgb()` / `hsl()` / 颜色名。这条可以被机器验证：把 19 张图渲染出来，出现的墨色必须是声明令牌的子集。
- **明度即数据。** 重要 = 更黑，不用颜色、渐变、阴影、发光区分系列。
- **面积编码一律开方**（`Math.sqrt`），柱状图**不断轴**；遇到会把其余数据压扁的极值就**不画那一行并说明原因**。
- **演示数据一律 `rnd(i,k)`，禁用 `Math.random()`** —— 否则刷新两次图就不一样，截图与回归对比全部失效。
- **一处只有一条承载数据的维度。** 若副标题说「长度 = 强度」，就不要让角度宽度也由强度计算；两处都编码同一个量会让读者无法判断该读哪一条。
- **每屏不超过一张暗卡。** 混用色彩系统在 Lieflat 里属于返工项。
- **半宽卡最小字号 6.5**，通栏 5.5。
- 新增图型时必须同时改三处：`RENDER[id]` 渲染函数、`CATALOG` 声明（`vb` 必须与页面 `<svg>` 的 `viewBox` **逐字相同**）、
  以及页面里的 `<svg data-chart="id">`。`vb` 放在 `CATALOG` 里就是为了不让这三处各自漂移。

```bash
node --check assets/js/charts-dog.js

# 把 19 张（或更多）图全部渲染一遍，检查 NaN / 越界 / 字号 / 确定性
# 参考 README 的《添加一张图表》一节

# 然后用浏览器打开 tools/charts.html
#   标题会自动变成「… · mounted/total」——两者不等就是有图表没挂上
#   页脚若出现「自检未通过」，会逐条列出缺渲染器的 id 与页面缺声明的 id
```

图形语言与令牌来自 Lieflat Charts（PolyForm Noncommercial License 1.0.0，**仅限非商业用途**），
署名要求见 `tools/charts.html` 底部与 README 的《声明》。**不要去掉那两处归属说明。**

**10. 外设只转移负荷，不创造配额。**
`assets/js/peripherals.js` 里的每一类设备都必须能回答一个问题：**它把哪一维配额从「需要你在场」转成了「不需要你在场」**。
回答不了这一问的类别不是外设，是摆设。五条硬约定：

- **`seq` 要诚实。** 一个类只能声明它**真的**能服务的那几相。只写 `chase` 不写终点，就是在给序列闭合规则交欠条 ——
  这正是激光笔（`PER/LP`）成为唯一一个被**整类弃用**的条目的原因。**不要**用「降低推荐等级」来软化这类问题：接口设计错了，不是使用方式错了。
- **`intent` 与 `src` 不能空。** 一个回答「它到底在满足哪一相」，一个回答「这条判断凭什么」。`selfTest()` 会逐类报出来。
- **配额不许抄第二份。** 承接上限（`60%`）、DNS 增量、HRI 下行**一律实时问 `DogQuant`**。
  内核里出现任何写死的权重或阈值，就是本项目反复嘲笑的那类缺陷（见第七条）。
- **不知道就返回 `null`。** 磨损区间只有绳 / 橡胶 / 工程材料三类有可引用的观察区间；其余材质必须返回「本项目不给数值」，
  **不许**为了页面好看编一个天数。气道门槛同理：只覆盖气管受压、不覆盖舌根嵌顿，就明确写出来。
- **合规空白是 `warn`，不是 `fail`。** 宠物玩具在美国没有强制性标准（`ASTM F963` 约束的是儿童玩具）。
  把「没有声明」判成不合格，会让整份文档失去可用性。

```bash
node --check assets/js/peripherals.js

# 内核断言：覆盖率求和为 1、门槛注册完整、序列规则确实否掉激光笔、气道表单调、弃用迁移目标存在
node -e 'require("./assets/js/quantify.js"); var P=require("./assets/js/peripherals.js"); var r=P.selfTest(); console.log(r.ok ? "OK " + JSON.stringify(r.stats) : r.errors);'

# 全部类别都要能过一遍判定，不能抛异常
node -e 'require("./assets/js/quantify.js"); var P=require("./assets/js/peripherals.js"); P.CLASSES.forEach(function(c){ P.checkDevice({cls:c.code, minutes:15, sessions:1}, {}, {kg:12, ageMonths:36}); }); console.log("all classes checkable");'
```

新增或修改类别后，记得同步**附录 R 的目录表**（手工维护，14 行）与控制台里那张数据驱动的注册表 —— 后者的数据源就是内核，不用改。

## 提交方式

1. Fork / 建分支
2. 改文件。正文改动请同步更新 `docs/CHANGELOG.md`
3. 本地自检：

```bash
# 若改过 quantify.js 的参数注册表，先同步下游
node tools/sync-params.js

# JS 语法（无构建步骤，语法错误会直接让页面白屏）
node --check assets/js/render.js
node --check assets/js/appendices.js
node --check assets/js/data-dog.js
node --check assets/js/quantify.js
node --check assets/js/scenarios.js
node --check assets/js/expression.js
node --check assets/js/charts-dog.js
node --check assets/js/peripherals.js
node --check sdk/dog-api-client.js
node --check tools/sync-params.js
node --check tools/dog-expression.js

# 表情引擎断言（若改过 expression.js）
node tools/dog-expression.js --selftest

# 页面自检：直接用浏览器打开这些文件，确认导航、目录、正文均正常
#   index.html  spec/dog.html  reference/cheatsheet.html
#   tools/quantifier.html  tools/expression.html  tools/charts.html  tools/peripherals.html  sdk/demo.html
#
# charts.html 额外自带一条自检：标题会变成「… · mounted/total」。
# 两者不等，或页脚出现「自检未通过」，就说明有图表没挂上或页面漏了声明。
#
# peripherals.html 也自带一条：标题会变成「… · 14 类 / 13 门槛 / 可承接 60%」。
# 三个数来自内核的 selfTest()，对不上说明内核或页面被改坏了。
```

4. 提交说明写清：改了哪一章 / 新增了什么 / 信源是什么

## 不需要做的事

- 不需要写测试（这是文档项目）
- 不需要引入构建工具。**本项目有意保持零依赖、零构建**，直接打开即可阅读
