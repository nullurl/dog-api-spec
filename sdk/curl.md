# curl 调用示例

> 本文件中的示例均为规范演示，不会真的把狗带出门。
> 若你确实对着终端敲了这些命令，返回值会是 `404`，然后你会觉得有点傻 —— 这属于预期行为。

---

## 1. 基础调用

```bash
# 期望值极高的接口。注意：无 rate limit，重复调用不衰减
curl -X GET http://localhost/dog/api/walk

# 200 OK
# Expectation: RISING (no decay detected)
# Calls today: 7        Rate limit: none
```

```bash
# 无状态零食架构：立即返回 200，5 秒后清空调用记录
curl -X POST http://localhost/dog/api/treat \
  -H "Content-Type: application/json" \
  -d '{"type":"肉干","amount":1}'
```

```bash
# 本规范中唯一恒为 true、永不降级的接口
curl -X GET http://localhost/dog/api/who-is-a-good-boy
# true
```

---

## 2. 注定失败的调用

```bash
# 405 Method Not Allowed —— 所有 method 均为 Not Allowed
curl -X POST http://localhost/dog/api/bath -i

# HTTP/1.1 405 Method Not Allowed
# curl -X GET  http://localhost/dog/api/bath  → 405
# curl -X PUT  http://localhost/dog/api/bath  → 405
# curl -X DEL  http://localhost/dog/api/bath  → 405
# Location: 家中最小且最不可达的物理区域
```

请勿尝试第四种 method。规范编写组试过了。

---

## 3. 分阶段返回不一致的接口

```bash
# 阶段一：在本地环境调用
curl -X POST http://localhost/dog/api/vet
# 200 OK  —— 愉快上车

# 阶段二：目标机房
curl -X POST http://localhost/vet/api/enter
# 500 Internal Server Error
#   tremor: full-body
# Archived issue: #1994（三十年未修复，无计划）
```

---

## 4. 带鉴权的调用

```bash
# 本系统不使用 401。全人类默认授权。
curl -X GET http://localhost/dog/api/comfort \
  -H "Authorization: (无需填写)"
# 200 OK — SLA 100%，历史失败次数 0
```

如果你在这一步写了 `Bearer <token>`，它会照样把你当自己人。这不是配置问题，是设计特性。

---

## 5. 一次性脚本：把它的时间当时间

```bash
#!/usr/bin/env bash
# 每天用它需要的格式，而不是你习惯的格式，调用一次

curl -s -X GET  http://localhost/dog/api/walk
curl -s -X GET  http://localhost/dog/api/who-is-a-good-boy
curl -s -X POST http://localhost/dog/api/treat

echo "今日配额已清空。晚间 20:00 的 Zoomies 事件预计不会触发。"
```

这个脚本比本文档中其他所有内容都重要。它对应的是一条真 `MUST`。

---

## 6. 量化端点：这次是真的在算

`/api/v1/*` 下的端点不返回话术，返回计算结果。参数与取值范围见 `spec/quantified-api.yaml`。

```bash
# 派生指标：RER / DER / 饮水 / 各配额 / 人类年龄 / 老年起点 / 体检频次
curl -s -X POST http://localhost/dog/api/v1/metrics/derive \
  -H 'Content-Type: application/json' \
  -d '{"profile":{"weightKg":12.5,"ageYears":4,"breedClass":"herding","neutered":true,"coat":"double"}}'

# 日常需求达成度（五维加权 + 短板封顶）
curl -s -X POST http://localhost/dog/api/v1/assess/daily-needs \
  -d '{"activity":{"walkMin":40,"sniffMin":10,"socialMin":30,"chewMin":5,"sleepHours":12}}'

# 热风险指数（硬性规则：气温 ≥32 °C 或 HRI ≥10 → 取消户外运动）
curl -s -X POST http://localhost/dog/api/v1/assess/heat-risk \
  -d '{"environment":{"tempC":34,"humidityPct":70,"sun":true,"acclimatedDays":3}}'

# 分诊（取最高优先级，不平均）
curl -s -X POST http://localhost/dog/api/v1/triage -d '{"gdv":true}'
# → P0 立即（分钟级）

# 免疫序列（需要出生日期，这一项不可选）
curl -s "http://localhost/dog/api/v1/plan/vaccination?birth=2026-06-01"
```

### 看着像 200 的 451

```bash
# 先设置分诊状态为 P0，此后所有评分端点返回 451
curl -s -X POST http://localhost/dog/api/v1/assess/daily-needs
# → 451 VET VISIT REQUIRED
#    Triage: P0 立即（分钟级）
#    Scoring suppressed by design.

# 而派生指标不受影响 —— 因为它不参与判断，只参与描述
curl -s -X POST http://localhost/dog/api/v1/metrics/derive
# → 200
```

这一段不需要脚本，也没有幽默。**当分诊是 P0 时，唯一有价值的动作是开车。**
其余的算术都可以等，而且等一会儿完全没关系 —— 它已经等了你一整天。
