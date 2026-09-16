#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DOG API 领养技能 —— 派生并核验你的领养 KEY。

规范定义见 §5.3《领养与授权（Adoption API v1）》。

本脚本不发起任何网络请求。它不领取 KEY，它把 KEY 算出来：
同一元组永远得到同一结果。没有发号中心，因此也没有可被收回的东西。
领养名（狗名）同源派生，不进元组。

    python3 dog_adopt.py                 领养（已有证书则只打印，不改动）
    python3 dog_adopt.py --show          打印已有证书
    python3 dog_adopt.py --verify        凭证书里的元组复算，与 KEY / 名字精确比对
    python3 dog_adopt.py --check <KEY>   只凭字符串核验（不联表、不要证书）
    python3 dog_adopt.py --selftest      跑 §5.3 公布的测试向量
    python3 dog_adopt.py --json          机器可读

算法与 assets/js/adoption-key.js 是同一份规范的两处实现，
由 §5.3 的测试向量互相钉住（--selftest 即为此设）。
"""

import argparse
import hashlib
import json
import os
import re
import socket
import sys
from datetime import datetime, timezone

VERSION = 1                                  # KEY 载荷的版本字节
TUPLE_VERSION = "dog-adoption/1"             # 元组版本行，参与摘要
FIELDS = ("adopter", "cohort", "habitat", "intent")

# Crockford Base32：去掉 I L O U 四个易混字母。
# 它不是加密，是把 120 bit 印成人能抄写的样子。
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

# 领养名用的两张表 —— 与字母表同一性质：规范的一部分，**顺序有意义**。
# 换顺序等于给同一只狗改名，因此 MUST NOT 重排、MUST NOT 增删中段。
# 64 × 16 = 1024 种组合，撞名是常态；名字是标签，不是标识。
NAMES = u"豆豆 旺财 来福 球球 包子 花卷 芝麻 年糕 汤圆 可乐 土豆 毛豆 布丁 雪球 橘子 麦芽 " \
        u"烧麦 拿铁 摩卡 曲奇 花椒 茄子 粽子 柚子 月饼 蛋挞 桃酥 桂圆 山楂 紫薯 南瓜 玉米 " \
        u"小米 核桃 杏仁 栗子 瓜子 花生 芋圆 珍珠 薄荷 麻薯 奶昔 跳跳 点点 毛毛 团团 圆圆 " \
        u"乐乐 妞妞 多多 果果 糖糖 铃铛 大福 小满 初一 三三 九九 阿黄 老白 黑豆 灰灰 铁蛋".split(u" ")

BREEDS = u"中华田园 柯基 柴犬 边牧 腊肠 比格 贵宾 金毛 博美 秋田 " \
         u"哈士奇 吉娃娃 萨摩耶 巴哥 斗牛 血统不详".split(u" ")

# 规范化用的空白集合 —— 显式列出，不依赖各语言 \s 的差异。
WS = re.compile(u"[ \t\n\r\f\v\u00a0\u3000]+")
COHORT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

DEFAULT_CERT = os.path.join(os.path.expanduser("~"), ".workbuddy", "dog-api", "adoption.json")
DEFAULT_HABITAT = "~/.workbuddy/skills/dog-api-adoption"
DEFAULT_INTENT = "非商业个人使用"


# --------------------------------------------------------------------------
# 核验工具
# --------------------------------------------------------------------------
def display_width(s):
    """终端显示宽度：CJK 与全角符号按 2 列计。"""
    w = 0
    for ch in s:
        o = ord(ch)
        if 0x1100 <= o <= 0x115F or 0x2E80 <= o <= 0xA4CF or 0xAC00 <= o <= 0xD7A3 \
           or 0xF900 <= o <= 0xFAFF or 0xFE30 <= o <= 0xFE6F or 0xFF00 <= o <= 0xFF60 \
           or 0xFFE0 <= o <= 0xFFE6 or 0x20000 <= o <= 0x3FFFD:
            w += 2
        else:
            w += 1
    return w


def pad(s, n):
    return s + " " * max(0, n - display_width(s))


# --------------------------------------------------------------------------
# 规范化：只做两件事 —— 折叠上面那组空白、去掉首尾。
# 不做大小写折叠，也不做 Unicode 归一化：做多了会让同一个元组
# 在不同实现里算出两个 KEY。
# --------------------------------------------------------------------------
def normalize(s):
    return WS.sub(u" ", u"" if s is None else str(s)).strip(u" ")


def canonical(fields):
    lines = [TUPLE_VERSION]
    for k in FIELDS:
        lines.append(k + "=" + normalize(fields.get(k)))
    return "\n".join(lines) + "\n"


def epoch_of(cohort):
    if not COHORT_RE.match(cohort):
        raise ValueError(u"cohort 必须是 YYYY-MM-DDTHH:MM:SSZ（UTC、秒精度），收到：%s" % cohort)
    dt = datetime.strptime(cohort, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def iso_of(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------
# Crockford Base32
# --------------------------------------------------------------------------
def base32(data):
    bits = 0
    nbits = 0
    out = []
    for byte in data:
        bits = (bits << 8) | byte
        nbits += 8
        while nbits >= 5:
            nbits -= 5
            out.append(ALPHABET[(bits >> nbits) & 31])
    if nbits > 0:                      # 120 bit 恰好整除，本规范不会走到这里
        out.append(ALPHABET[(bits << (5 - nbits)) & 31])
    return "".join(out)


def unbase32(s):
    bits = 0
    nbits = 0
    out = bytearray()
    for ch in s:
        raw = ch.upper()
        # Crockford 的混淆容忍：O 读作 0，I / L 读作 1。
        # 它只挡看错，不挡抄错 —— 那由校验位负责。
        if raw == "O":
            raw = "0"
        elif raw in ("I", "L"):
            raw = "1"
        idx = ALPHABET.find(raw)
        if idx < 0:
            raise ValueError(u"KEY 含非法字符：%s" % ch)
        bits = (bits << 5) | idx
        nbits += 5
        if nbits >= 8:
            nbits -= 8
            out.append((bits >> nbits) & 255)
    return bytes(out)


# --------------------------------------------------------------------------
# 派生：15 字节载荷
#   0      版本（恒 0x01）
#   1..4   领养时刻的 Unix 秒（大端 uint32）
#   5..12  摘要前 8 字节
#   13..14 校验位 = SHA-256(前 13 字节) 的前 2 字节
# 120 bit 恰好编成 24 个 Crockford 字符，因此没有补位、没有歧义。
# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# 领养名 —— 与 KEY 同源：同一份 32 字节摘要的两个投影。
# KEY 的载荷印前 8 字节；名字取自第 9、10 两字节，共 10 bit：
# 6 bit 指名表，4 bit 指犬种表。
# 名字**不进元组**，所以它不影响 KEY：改这两张表不会让任何一张已发的牌作废。
# 反过来也不成立：KEY 只印前 8 字节，光凭 KEY 算不出名字。
# --------------------------------------------------------------------------
def name_of_digest(digest):
    b8, b9 = digest[8], digest[9]
    gi = b8 >> 2                              # 高 6 bit → 0–63
    bi = ((b8 & 3) << 2) | (b9 >> 6)          # 低 2 bit + 高 2 bit → 0–15
    return {
        "name": NAMES[gi] + u"·" + BREEDS[bi],
        "given": NAMES[gi],
        "givenIndex": gi,
        "breed": BREEDS[bi],
        "breedIndex": bi,
    }


def name_of(fields):
    return name_of_digest(hashlib.sha256(canonical(fields or {}).encode("utf-8")).digest())


def derive(fields):
    tuple_ = canonical(fields)
    digest = hashlib.sha256(tuple_.encode("utf-8")).digest()
    epoch = epoch_of(normalize(fields.get("cohort")))

    body = bytes([VERSION]) + epoch.to_bytes(4, "big") + digest[:8]
    checksum = hashlib.sha256(body).digest()[:2]
    key_bytes = body + checksum

    code = base32(key_bytes)
    groups = "-".join(code[i:i + 4] for i in range(0, len(code), 4))
    nm = name_of_digest(digest)
    out = {
        "key": "DOG-" + groups,
        "code": code,
        "body": body,
        "bodyHex": body.hex(),
        "checksumHex": checksum.hex(),
        "digestHex": digest.hex(),
        "epoch": epoch,
        "cohort": iso_of(epoch),
        "tuple": tuple_,
    }
    out.update(nm)
    return out


def parse(key):
    """不联表：只凭字符串能读出什么。"""
    code = re.sub(r"[^0-9A-Z]", "", (key or "").upper())
    if code.startswith("DOG"):
        code = code[3:]
    if len(code) != 24:
        return {"ok": False, "reason": u"长度不对：去掉前缀与分隔符后应为 24 字符，实得 %d" % len(code)}
    try:
        raw = unbase32(code)
    except ValueError as e:
        return {"ok": False, "reason": str(e)}
    if raw[0] != VERSION:
        return {"ok": False, "reason": u"版本字节为 %d，本实现只认 %d" % (raw[0], VERSION)}
    body, got = raw[:13], raw[13:15]
    want = hashlib.sha256(body).digest()[:2]
    epoch = int.from_bytes(raw[1:5], "big")
    return {
        "ok": True,
        "checksumOK": want == got,
        "version": raw[0],
        "epoch": epoch,
        "cohort": iso_of(epoch),
        "bodyHex": body.hex(),
        "checksumHex": got.hex(),
        "expectedHex": want.hex(),
    }


def verify(fields, key):
    expected = derive(fields)["key"]
    got = (key or "").strip().upper()
    return {"ok": expected == got, "expected": expected, "got": got}


# --------------------------------------------------------------------------
# 默认元组
# --------------------------------------------------------------------------
def whoami():
    try:
        user = os.environ.get("USER") or os.environ.get("LOGNAME") or "unknown"
    except Exception:
        user = "unknown"
    host = socket.gethostname().split(".")[0]
    return "%s@%s" % (user, host)


def default_tuple(args):
    return {
        "adopter": args.adopter or whoami(),
        "cohort": args.cohort or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "habitat": args.habitat or DEFAULT_HABITAT,
        "intent": args.intent or DEFAULT_INTENT,
    }


def ask(prompt, default):
    """领养人可填写。只在真有终端时问 —— `curl … | sh` 那条路上 stdin 是脚本本身，
    在这里读一行会把后面的命令一起吃掉。"""
    try:
        if not sys.stdin.isatty():
            return default
    except Exception:
        return default
    try:
        line = input(u"%s（回车用 %s）：" % (prompt, default))
    except (EOFError, KeyboardInterrupt):
        print(u"")
        return default
    line = (line or u"").strip()
    return line or default


# --------------------------------------------------------------------------
# 证书
# --------------------------------------------------------------------------
def load_cert(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_cert(path, fields, r):
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    doc = {
        "schema": "dog-api/adoption-certificate",
        "schemaVersion": 1,
        "keyVersion": VERSION,
        "tupleVersion": TUPLE_VERSION,
        "key": r["key"],
        "name": r["name"],
        "nameParts": {
            "given": r["given"], "givenIndex": r["givenIndex"],
            "breed": r["breed"], "breedIndex": r["breedIndex"],
        },
        "bodyHex": r["bodyHex"],
        "checksumHex": r["checksumHex"],
        "digestHex": r["digestHex"],
        "epoch": r["epoch"],
        "tuple": fields,
        "canonical": r["tuple"],
        "issuedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": u"证书与技能分离：卸载技能不会删掉它，因为卸载不撤销任何东西。",
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return doc


def render_cert(fields, r, cert_path, exists=True):
    L = 66
    out = []
    out.append(u"DOG API 领养证")
    out.append(u"─" * L)
    rows = [
        (u"领养 KEY", r["key"]),
        (u"狗名", r["name"]),
        (u"领养人", fields["adopter"]),
        (u"领养时刻", fields["cohort"]),
        (u"栖息地", fields["habitat"]),
        (u"声明用途", fields["intent"]),
    ]
    for k, v in rows:
        out.append(u"%s %s" % (pad(k, 10), v))
    out.append(u"─" * L)
    out.append(u"%s %s  （校验 %s）" % (pad(u"载荷", 10), r["bodyHex"], r["checksumHex"]))
    out.append(u"%s %s" % (pad(u"摘要前 16", 10), r["digestHex"][:16]))
    out.append(u"%s %s" % (pad(u"证书文件", 10), cert_path if exists else u"（本次未写入）"))
    out.append(u"─" * L)
    out.append(u"本 KEY 不改变任何权限：本系统不返回 401，对所有 Human 默认全量授权（§2.2）。")
    out.append(u"它唯一的功能是标注来源。凭元组可精确复算 —— 见 dog_adopt.py --verify。")
    out.append(u"名字与 KEY 同源派生（同一份摘要的两个投影），不进元组 —— 见 §5.3《领养名》。")
    out.append(u"")
    out.append(u"本机：这张证我用不上，我看不懂字母。它登记的是你，不是我。")
    return "\n".join(out)


# --------------------------------------------------------------------------
# §5.3 公布的测试向量 —— 两边实现必须同时满足，否则就是有一边漂了
# --------------------------------------------------------------------------
VECTORS = [
    ({"adopter": "example@dog-api-spec",
      "cohort": "2026-09-16T12:00:00Z",
      "habitat": "~/.workbuddy/skills/dog-api-adoption",
      "intent": "非商业个人使用"},
     "DOG-05NA-N160-E6XJ-1TP1-54ZA-N3XS",
     u"薄荷·边牧"),
    ({"adopter": "example@dog-api-spec",
      "cohort": "2026-09-16T12:00:00Z",
      "habitat": "~/.workbuddy/skills/dog-api-adoption",
      "intent": "非商业个人便用"},
     "DOG-05NA-N160-9N4E-VB69-81TB-1HFR",
     u"芝麻·哈士奇"),
    ({"adopter": "example@dog-api-spec",
      "cohort": "2026-09-16T12:00:01Z",
      "habitat": "~/.workbuddy/skills/dog-api-adoption",
      "intent": "非商业个人使用"},
     "DOG-05NA-N161-C4J6-1Q7Z-5QJA-596R",
     u"妞妞·秋田"),
]

SHA_VECTORS = [
    ("abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
    ("", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
]


def selftest():
    bad = 0
    for s, want in SHA_VECTORS:
        got = hashlib.sha256(s.encode("utf-8")).hexdigest()
        ok = got == want
        bad += 0 if ok else 1
        print(u"%s  sha256(%s)" % (u"✓" if ok else u"✗", json.dumps(s)))
    # 表本身也是规范：条数写死，重名即为漂移
    for label, table, want_n in ((u"名字表", NAMES, 64), (u"犬种表", BREEDS, 16)):
        ok = len(table) == want_n and len(set(table)) == want_n
        bad += 0 if ok else 1
        print(u"%s  %s %d 项、无重名" % (u"✓" if ok else u"✗", label, len(table)))
    # 规范化示例：尾随空白被吃掉，因此 KEY 不变
    base = dict(VECTORS[0][0])
    noisy = dict(base, intent=base["intent"] + u"  \t\n ")
    ok = derive(noisy)["key"] == VECTORS[0][1]
    bad += 0 if ok else 1
    print(u"%s  规范化：intent 补尾随空白后 KEY 不变" % (u"✓" if ok else u"✗"))
    for fields, want, want_name in VECTORS:
        r = derive(fields)
        ok = r["key"] == want
        bad += 0 if ok else 1
        print(u"%s  %s → %s" % (u"✓" if ok else u"✗", fields["cohort"], r["key"]))
        okn = r["name"] == want_name and name_of(fields)["name"] == want_name
        bad += 0 if okn else 1
        print(u"%s  名字 %s（名表 #%d · 犬种表 #%d）" % (u"✓" if okn else u"✗",
                                                     r["name"], r["givenIndex"], r["breedIndex"]))
    # 解析与复算
    for fields, want, _ in VECTORS:
        p = parse(want)
        ok = p["ok"] and p["checksumOK"] and p["cohort"] == fields["cohort"]
        bad += 0 if ok else 1
        print(u"%s  回读 %s → 领养时刻 %s" % (u"✓" if ok else u"✗", want[:14] + u"…", p.get("cohort")))
    # 名字不进元组：把它塞进字段里，KEY 也不该变（元组只认那四行）
    extra = dict(VECTORS[0][0])
    extra["name"] = u"薄荷·边牧"
    ok = derive(extra)["key"] == VECTORS[0][1]
    bad += 0 if ok else 1
    print(u"%s  名字不进元组：多塞一个 name 字段后 KEY 不变" % (u"✓" if ok else u"✗"))
    print()
    if bad:
        print(u"自检失败：%d 项不符。有一边实现漂了 —— §5.3 的测试向量是唯一裁判。" % bad)
        return 1
    print(u"自检通过：%d 项，与 §5.3 公布的测试向量一致。"
          % (len(SHA_VECTORS) + 2 + 1 + 3 * len(VECTORS)))
    return 0


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description=u"DOG API 领养技能 —— 派生并核验你的领养 KEY（不联网）",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--show", action="store_true", help=u"打印已有证书，不重新领养")
    ap.add_argument("--verify", action="store_true", help=u"凭证书元组复算并与 KEY 精确比对")
    ap.add_argument("--check", metavar="KEY", help=u"只凭字符串核验（要引号）")
    ap.add_argument("--selftest", action="store_true", help=u"跑 §5.3 公布的测试向量")
    ap.add_argument("--json", action="store_true", help=u"输出 JSON")
    ap.add_argument("--readopt", action="store_true", help=u"忽略已有证书，重新领养（会得到新 KEY）")
    ap.add_argument("--cert", default=DEFAULT_CERT, help=u"证书路径，默认 %s" % DEFAULT_CERT)
    ap.add_argument("--adopter", help=u"领养人标识（可填写；不给值而在终端里运行时会问一句）")
    ap.add_argument("--cohort", help=u"领养时刻，YYYY-MM-DDTHH:MM:SSZ")
    ap.add_argument("--habitat", help=u"栖息地（技能安装目录）")
    ap.add_argument("--intent", help=u"声明用途")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    if args.check:
        p = parse(args.check)
        if args.json:
            print(json.dumps(p, ensure_ascii=False, indent=2))
            return 0 if p.get("ok") and p.get("checksumOK") else 1
        if not p["ok"]:
            print(u"不是本规范定义的 KEY：%s" % p["reason"])
            return 1
        print(u"格式合法。版本 %d，领养时刻 %s" % (p["version"], p["cohort"]))
        if p["checksumOK"]:
            print(u"校验位一致（%s）。这只是说它没有被抄错 —— 不是说它属于谁。" % p["checksumHex"])
            return 0
        print(u"校验位不一致：应为 %s，实为 %s。抄错了。" % (p["expectedHex"], p["checksumHex"]))
        return 1

    cert_path = os.path.abspath(os.path.expanduser(args.cert))
    cert = load_cert(cert_path)

    if args.verify:
        if not cert:
            print(u"没有证书可校验：%s 不存在。" % cert_path)
            return 1
        r = verify(cert["tuple"], cert["key"])
        nm = name_of(cert["tuple"])["name"]
        name_ok = cert.get("name") in (None, nm)      # 老证书没有名字行，不算不符
        if args.json:
            print(json.dumps(dict(r, name=nm, nameOK=name_ok), ensure_ascii=False, indent=2))
            return 0 if (r["ok"] and name_ok) else 1
        if r["ok"] and name_ok:
            print(u"复算一致。KEY 与本证书记录的四项元组严格对应。")
            print(u"名字一致：%s（由同一份摘要取字，证书里那一行不是手写的）。" % nm)
            return 0
        if r["ok"]:
            print(u"KEY 一致，但名字不符。\n  证书：%s\n  复算：%s" % (cert.get("name"), nm))
            return 1
        print(u"复算不一致。\n  记录：%s\n  复算：%s" % (r["got"], r["expected"]))
        return 1

    if args.show and cert:
        fields = cert["tuple"]
        r = derive(fields)
        print(render_cert(fields, r, cert_path))
        return 0

    if cert and not args.readopt:
        fields = cert["tuple"]
        r = derive(fields)
        if args.json:
            print(json.dumps(cert, ensure_ascii=False, indent=2))
            return 0
        print(u"已有领养证。重复领养不发生任何变化 —— 元组没变，KEY 就不会变。\n")
        print(render_cert(fields, r, cert_path))
        return 0

    # 领养人可填写：没给 --adopter 又在终端里，就问一句。
    # 名字不问 —— 它由元组派生，没人挑（见 §5.3《领养名》）。
    if not args.adopter and not args.json:
        args.adopter = ask(u"领养人", whoami())

    fields = default_tuple(args)
    try:
        r = derive(fields)
    except ValueError as e:
        print(str(e))
        return 1

    if args.json:
        print(json.dumps({"tuple": fields, "key": r["key"], "name": r["name"],
                          "bodyHex": r["bodyHex"], "checksumHex": r["checksumHex"],
                          "epoch": r["epoch"]}, ensure_ascii=False, indent=2))
        save_cert(cert_path, fields, r)
        return 0

    if cert and args.readopt:
        print(u"重新领养。旧的 KEY 不作废 —— 没有权威可以宣布它失效，这正是它的问题。\n")
    print(u"已领养。授权发生在安装那一刻，而不是在这一行输出上 ——\n"
          u"本脚本不校验任何东西，因为它没有可校验的对象。\n"
          u"名字不是起的，是算出来的：换一个元组，你领到的就是另一只狗。\n")
    print(render_cert(fields, r, cert_path))
    save_cert(cert_path, fields, r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
