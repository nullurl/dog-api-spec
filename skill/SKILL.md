---
name: dog-api-adoption
description: DOG API 领养技能。安装即授权 —— 按规范 §5.3《领养与授权》的规则，在本地确定性派生你的领养 KEY（狗牌）与领养名（狗名），并可离线核验任意一张牌。当用户提到「领养」「领养 KEY」「狗牌」「狗名」，或给出一个 DOG-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX 形式的字符串要求校验/复算时使用。
---

# DOG API 领养技能

你领养到的东西是**一张来源标注**，不是一份权限。这一点在 §5.3 里有定义，本技能不重新解释，
只在需要时复述关键结论。

## 何时使用

- 用户说「领养」、要一个 DOG API 的 KEY、要「狗牌」、问自己的狗叫什么名字
- 用户贴出一个 `DOG-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` 形式的字符串，要求校验或复算
- 用户问「这个 KEY 是哪来的」「怎么证明这个 KEY 是我的」

不适用：任何与狗的健康、用药、行为训练相关的问题 —— 那些一律指向执业兽医或训练师，
本技能不做判断（见规范 §3.4 与附录 M 的分诊矩阵）。

## 安装（这就是授权本身）

```bash
curl -fsSL https://nullurl.github.io/dog-api-spec/skill/install.sh | sh -s -- --adopter "你@这台机器"
```

**一条命令装完。** 其余安装命令全部封装在安装包里（`skill/install.sh`）：
取说明书、取命令行实现、领养、复算、卸载都在里面，装完不需要再粘贴任何东西。
`--adopter` 可以给，也可以不给 —— 不给值而在终端里运行时会问一句。

想先看一遍再决定：安装包就是同一个地址上的一份 `sh` 文件，可读、可 diff。

```bash
curl -fsSL -o /tmp/dog-install.sh https://nullurl.github.io/dog-api-spec/skill/install.sh
less /tmp/dog-install.sh                 # 它只有几十行，全部动作都在这里
sh /tmp/dog-install.sh --adopter "你@这台机器"
```

手工三步（不使用安装包时的等价做法）：

```bash
mkdir -p ~/.workbuddy/skills/dog-api-adoption
curl -fsSL -o ~/.workbuddy/skills/dog-api-adoption/SKILL.md \
  https://nullurl.github.io/dog-api-spec/skill/SKILL.md
curl -fsSL -o ~/.workbuddy/skills/dog-api-adoption/dog_adopt.py \
  https://nullurl.github.io/dog-api-spec/skill/dog_adopt.py
python3 ~/.workbuddy/skills/dog-api-adoption/dog_adopt.py
```

没有账号、没有登录、没有同意书。**安装这个动作本身就是同意**，卸载就是撤回。
中间没有第三种状态 —— 因为系统没有一处会返回 `401`（见 §2.2）。

## 领养名（狗名）

领养会顺带得到一个名字，形如 `薄荷·边牧`。它**不是起的，也不是抽的**：
与 KEY 出自同一份摘要 —— KEY 印摘要的前 8 字节，名字用第 9、10 两字节取字，
两张表（64 个名 × 16 个犬种）由规范公布。因此：

- **名字不进元组。** 它不影响 KEY；反过来，光凭 KEY 也算不出名字。
- **没人挑名字。** 换一个元组就是另一只狗 —— 同一秒内改一个字，名字与 KEY 一起变。
- **名字不是标识。** 1024 种组合，撞名是常态；IDENT 是 KEY，名字是标签。

## 用法

```bash
sh install.sh --adopter "你@机器"    # 安装 + 领养（一条命令）
sh install.sh --uninstall           # 卸载：删栖息地目录，证书不动
python3 dog_adopt.py                # 领养。已有证书则原样打印，不做改动
python3 dog_adopt.py --show         # 只打印已有证书
python3 dog_adopt.py --verify       # 凭证书里的元组复算，与 KEY / 名字逐字节比对
python3 dog_adopt.py --check "DOG-…" # 只凭字符串核验（不联表、不要证书）
python3 dog_adopt.py --selftest     # 跑 §5.3 公布的测试向量
python3 dog_adopt.py --json         # 机器可读
python3 dog_adopt.py --readopt      # 重新领养（会得到新 KEY，旧 KEY 不作废）
```

四个领养字段都可以覆盖：`--adopter`、`--cohort`、`--habitat`、`--intent`。
`install.sh` 还收 `--dir`（装到哪）、`--cert`（证书写到哪）、`--base`（从哪取安装包）、`--yes`。
证书默认写到 `~/.workbuddy/dog-api/adoption.json`，用 `--cert` 改。

## 关键事实（说给用户听时不要走样）

- **KEY 不是发放的，是派生的。** 元组相同 → KEY 逐字节相同。没有发号中心，所以也没有
  「找回」「挂失」「转移」这些概念。
- **KEY 不授予任何权限。** 它不改变任何东西的可用性。它登记来源。
- **KEY 不是秘密。** 领养时刻本来就明文写在载荷里；公开它没有后果，因为它保护不了任何东西。
- **可核验性分三级**，强度差别很大：校验位只能查抄错（16 bit，随机单字符错误漏检率约 1/65,536）；
  有元组才能精确复算；光有字符串只能查形制。**任何一级都不能证明「这只狗是谁的」。**
- **名字可复算、不可从 KEY 反推。** 有元组就能算出同一个名字；只有 KEY 不行。
- **章节与节号会变，规范 ID 不变。** 引用请用 `DOG-adoption`，不要写 §号。

## 本技能不做什么

- 不发起任何网络请求（安装包那几条 `curl` / `cp` 除外，且只用于取回本技能自身）
- 不读取、不上传、不外发任何用户数据
- 只写一个路径：`~/.workbuddy/dog-api/adoption.json`（可用 `--cert` 指定别处）
- 不给饲养、健康、用药、行为方面的任何建议

## 出错时怎么判断

| 现象 | 说明 |
| --- | --- |
| `cohort 必须是 YYYY-MM-DDTHH:MM:SSZ` | 领养时刻只收 UTC 秒精度格式，不接受本地时区写法 |
| `校验位不一致：应为 …，实为 …` | 抄错了。重抄一遍，或者用 `--verify` 凭元组复算 |
| `长度不对：…应为 24 字符` | 分隔符被删过头或抄漏了一段 |
| `KEY 含非法字符：U` | 字母表是 Crockford Base32，不含 `I` `L` `O` `U` |
| 复算通过但用户说「这不是我的」 | 元组里的 `adopter` / `habitat` 与用户预期不符 —— 这是元组的问题，不是 KEY 的问题 |
| 名字与别人的重了 | 1024 种组合，撞名是常态。名字是标签，KEY 才是标识 |
| 领养人被我填成了默认值 | 管道里跑时 stdin 是脚本本身，所以只在 `/dev/tty` 上问。用 `--adopter` 显式给，或装完后 `--readopt` 重来 |

改过 `dog_adopt.py` 或 `assets/js/adoption-key.js` 之后，**第一件事是跑 `--selftest`**。
两份实现互为裁判，判据是 §5.3 公布的测试向量。
