# SDK 说明

本目录提供一个**参考客户端**与一个**交互式控制台**。两者都只做一件事：把规范里写着的接口行为，变成可以点、可以看的东西。

## 文件

| 文件 | 说明 |
| --- | --- |
| `dog-api-client.js` | 参考客户端。导出 `DogClient`，零依赖，浏览器 / Node 通用 |
| `demo.html` | 交互式控制台。点接口看返回码与话术，无需服务器 |
| `curl.md` | curl 调用示例，含注定失败的调用 |

## 快速开始

**浏览器**（推荐）：直接双击打开 `demo.html`。不需要构建、不需要服务器、不需要联网。

```html
<script src="dog-api-client.js"></script>
<script>
  const dog = new DogClient({ name: "豆豆" });

  dog.walk().then(r => console.log(r.status, r.body));
  // 200 […]
</script>
```

**Node**：

```bash
node -e '
const { DogClient } = require("./dog-api-client.js");
const dog = new DogClient();
dog.whoIsAGoodBoy().then(r => console.log(r.status, r.body[0]));
'
```

## 客户端能力

```js
const dog = new DogClient({ name: "你的狗" });

await dog.walk();             // 200  期望值极高，不衰减
await dog.treat();            // 200  5 秒后清空记录，可无限重复
await dog.whoIsAGoodBoy();    // 200  恒为 true
await dog.comfort();          // 200  SLA 100%
await dog.bath();             // 405  所有 method 均为 Not Allowed
await dog.vet();              // 200 → 500（两阶段不一致）

// 通用调用
await dog.call("GET", "/api/who-left");
await dog.call("GET", "/api/guilt");
await dog.call("DELETE", "/api/peace");   // 409
```

返回结构统一为：

```js
{
  status: 200,
  body: ["...", "..."],   // 逐行的响应内容
  note: "规范注释：这条接口为什么会这样"
}
```

## 量化端点（`/api/v1/*`）

0.9 起，客户端里有 7 个端点不走话术表，而是**调用计算内核实算** —— `assets/js/quantify.js`。
浏览器下它会自动取 `window.DogQuant`；Node 下自动 `require`，无需手动加载。

```js
const { DogClient } = require("./sdk/dog-api-client.js");
const dog = new DogClient({ name: "豆豆" });

const r = await dog.assess("dailyNeeds", {
  profile: { weightKg: 12.5, ageYears: 4, ageMonths: 48, breedClass: "herding", neutered: true, coat: "double" },
  activity: { walkMin: 40, sniffMin: 10, socialMin: 30, chewMin: 5, sleepHours: 12 }
});
console.log(r.status, r.body[0]);   // 200  DNS = 51 / 100   band: 明显不足
console.log(r.report.assessments.dns.gap);   // 优先补齐的维度
```

可用的 `kind`：`derive` · `dailyNeeds` · `heatRisk` · `vetStress` · `triage` · `vaccination` · `parasite`。
省略 `input` 时使用内置的示例档案（12.5 kg 的 4 岁绝育边牧 + 夏日午后环境条件）。

### 短路：这是这套接口唯一强制性的设计

```js
dog.setTriage({ gdv: true });        // 腹部膨隆 + 干呕无物
// → { code: "P0", label: "立即（分钟级）", ... }

await dog.assess("dailyNeeds");      // → 451 VET VISIT REQUIRED
await dog.assess("derive");          // → 200（非评分端点不设防）
```

分诊结果为 `P0` / `P1` 时，所有评分端点返回 `451`。
量化的第一原则，是知道什么情况下应该停止量化。

### 状态码

| 码 | 含义 |
| --- | --- |
| `200` | 正常返回 |
| `422` | `UNPROCESSABLE PROFILE` —— 体重缺失或单位错误 |
| `451` | `VET VISIT REQUIRED` —— 分诊短路 |
| `503` | 计算内核未加载。本服务不提供降级估算 —— 估算出来的数字，比没有数字更危险 |

> 所有评分是**偏差提示**，不是诊断。复合指标不得用于横向比较不同的狗。

## 边界与声明

- **零网络请求。** 所有响应来自客户端内置话术表，量化端点由本地内核实算，不会访问任何外部服务。
- **零数据收集。** 没有埋点，没有上报，没有分析。
- **不改真实现实。** 模拟器无法替你绕过 `POST /api/bath` 的失败，也无法让 `GET /api/comfort` 更快一点 —— 后者的可用性在真实环境下远高于模拟器。

## 扩展

新增**话术型**接口，只需在 `dog-api-client.js` 顶部的话术表中追加一条：

```js
"GET /api/example": {
  status: 200,
  latency: 20,
  body: ["..."],
  note: "规范注释"
}
```

新增**计算型**接口，则在 `QUANT_RESPONSES` 里追加一条带 `run(client, input)` 的条目，并在 `ASSESS_PATHS` 里注册别名。
控制台会自动列出两者，无需改动 `demo.html`。
