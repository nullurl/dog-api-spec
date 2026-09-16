/* ============================================================
   DOG API — 领养 KEY 派生内核
   规范定义见 §5.3《领养与授权（Adoption API v1）》。

   纯函数、零依赖、零网络：不与任何服务端通信，也不需要通信 ——
   这个内核不生成 KEY，它把 KEY 算出来。同一元组永远得到同一结果。

   本文件与 skill/dog_adopt.py 是同一算法的两份实现，由 §5.3 里的
   固定测试向量互相钉住。改任何一边之前，先让测试向量继续成立。

   兼容：浏览器（window.DogAdoption）与 Node（module.exports）
   ============================================================ */

(function (global) {
  "use strict";

  var VERSION = 1;                          /* KEY 载荷的版本字节 */
  var TUPLE_VERSION = "dog-adoption/1";     /* 元组的版本行，参与摘要 */
  var FIELDS = ["adopter", "cohort", "habitat", "intent"];

  /* Crockford Base32：去掉了 I L O U 四个易混字母。
     它不是加密，是把 120 bit 印成人能抄写的样子。 */
  var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

  /* 规范化用的空白集合 —— 显式列出，不依赖各语言的 \s 定义差异。
     两边实现必须折叠同一组字符，否则同一个元组会算出两个 KEY。 */
  var WS = /[ \t\n\r\f\v\u00a0\u3000]+/g;

  /* ---------- SHA-256（FIPS 180-4，纯 JS） ---------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function sha256(bytes) {
    var l = bytes.length;
    var padded = new Uint8Array(((l + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[l] = 0x80;
    var bits = l * 8;
    var hi = Math.floor(bits / 4294967296);
    var lo = bits % 4294967296;
    var n = padded.length;
    padded[n - 8] = (hi >>> 24) & 255; padded[n - 7] = (hi >>> 16) & 255;
    padded[n - 6] = (hi >>> 8) & 255;  padded[n - 5] = hi & 255;
    padded[n - 4] = (lo >>> 24) & 255; padded[n - 3] = (lo >>> 16) & 255;
    padded[n - 2] = (lo >>> 8) & 255;  padded[n - 1] = lo & 255;

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Uint32Array(64);
    var i, off, t1, t2, s0, s1, ch, maj;

    for (off = 0; off < n; off += 64) {
      for (i = 0; i < 16; i++) {
        w[i] = ((padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) |
                (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3]) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        ch = (e & f) ^ (~e & g);
        t1 = (h + s1 + ch + K[i] + w[i]) >>> 0;
        s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        maj = (a & b) ^ (a & c) ^ (b & c);
        t2 = (s0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[i * 4] = (H[i] >>> 24) & 255; out[i * 4 + 1] = (H[i] >>> 16) & 255;
      out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255;
    }
    return out;
  }

  /* ---------- UTF-8 与十六进制 ---------- */
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                   0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
          i++;
        } else {
          out.push(0xef, 0xbf, 0xbd);
        }
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return new Uint8Array(out);
  }

  function hex(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) {
      s += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    }
    return s;
  }

  /* ---------- Crockford Base32 ---------- */
  function base32(bytes) {
    var bits = 0, nbits = 0, out = "";
    for (var i = 0; i < bytes.length; i++) {
      bits = (bits << 8) | bytes[i];
      nbits += 8;
      while (nbits >= 5) {
        nbits -= 5;
        out += ALPHABET.charAt((bits >> nbits) & 31);
      }
    }
    if (nbits > 0) out += ALPHABET.charAt((bits << (5 - nbits)) & 31);
    return out;
  }

  function unbase32(str) {
    var bits = 0, nbits = 0, out = [];
    for (var i = 0; i < str.length; i++) {
      var raw = str.charAt(i).toUpperCase();
      /* Crockford 的混淆容忍：O 读作 0，I / L 读作 1。
         它只挡看错，不挡抄错 —— 那由校验位负责。 */
      if (raw === "O") raw = "0";
      else if (raw === "I" || raw === "L") raw = "1";
      var v = ALPHABET.indexOf(raw);
      if (v < 0) throw new Error("KEY 含非法字符：" + str.charAt(i));
      bits = (bits << 5) | v;
      nbits += 5;
      if (nbits >= 8) {
        nbits -= 8;
        out.push((bits >> nbits) & 255);
      }
    }
    return new Uint8Array(out);
  }

  /* ---------- 元组 ---------- */
  function normalize(s) {
    return String(s == null ? "" : s).replace(WS, " ").replace(/^ | $/g, "");
  }

  /* 规范化只做两件事：折叠上面那组空白、去掉首尾。
     不做大小写折叠，也不做 Unicode 归一化 —— 做多了会让同一个元组
     在不同实现里算出两个 KEY。 */
  function canonical(fields) {
    fields = fields || {};
    var lines = [TUPLE_VERSION];
    for (var i = 0; i < FIELDS.length; i++) {
      lines.push(FIELDS[i] + "=" + normalize(fields[FIELDS[i]]));
    }
    return lines.join("\n") + "\n";
  }

  var COHORT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

  function epochOf(cohort) {
    if (!COHORT_RE.test(cohort)) {
      throw new Error("cohort 必须是 YYYY-MM-DDTHH:MM:SSZ（UTC、秒精度），收到：" + cohort);
    }
    var ms = Date.parse(cohort);
    if (isNaN(ms)) throw new Error("cohort 不是合法时刻：" + cohort);
    return Math.floor(ms / 1000);
  }

  function isoOf(epoch) {
    return new Date(epoch * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  /* ---------- 派生 ----------
     15 字节载荷：
       0     版本（恒 0x01）
       1..4  领养时刻的 Unix 秒（大端 uint32）
       5..12 摘要前 8 字节
       13..14 校验位 = SHA-256(前 13 字节) 的前 2 字节
     120 bit 恰好编成 24 个 Crockford 字符，因此没有补位、没有歧义。 */
  function derive(fields) {
    fields = fields || {};
    var tuple = canonical(fields);
    var digest = sha256(utf8(tuple));
    var epoch = epochOf(normalize(fields.cohort));

    var body = new Uint8Array(13);
    body[0] = VERSION;
    body[1] = (epoch >>> 24) & 255;
    body[2] = (epoch >>> 16) & 255;
    body[3] = (epoch >>> 8) & 255;
    body[4] = epoch & 255;
    for (var i = 0; i < 8; i++) body[5 + i] = digest[i];

    var sum = sha256(body);
    var keyBytes = new Uint8Array(15);
    keyBytes.set(body, 0);
    keyBytes[13] = sum[0];
    keyBytes[14] = sum[1];

    var code = base32(keyBytes);
    return {
      key: "DOG-" + code.replace(/(.{4})/g, "$1-").replace(/-$/, ""),
      code: code,
      bodyHex: hex(body),
      checksumHex: hex(keyBytes.slice(13)),
      digestHex: hex(digest),
      epoch: epoch,
      cohort: isoOf(epoch),
      tuple: tuple
    };
  }

  /* ---------- 解析：不联表，只凭字符串能读出什么 ---------- */
  function parse(key) {
    var code = String(key || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^DOG/, "");
    if (code.length !== 24) {
      return { ok: false, reason: "长度不对：去掉前缀与分隔符后应为 24 字符，实得 " + code.length };
    }
    var bytes;
    try {
      bytes = unbase32(code);
    } catch (e) {
      return { ok: false, reason: e.message };
    }
    if (bytes[0] !== VERSION) {
      return { ok: false, reason: "版本字节为 " + bytes[0] + "，本实现只认 " + VERSION };
    }
    var body = bytes.slice(0, 13);
    var want = sha256(body);
    var got = [bytes[13], bytes[14]];
    var checksumOK = want[0] === got[0] && want[1] === got[1];
    var epoch = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
    return {
      ok: true,
      checksumOK: checksumOK,
      version: bytes[0],
      epoch: epoch,
      cohort: isoOf(epoch),
      bodyHex: hex(body),
      checksumHex: hex(bytes.slice(13)),
      expectedHex: hex(want.slice(0, 2))
    };
  }

  /* ---------- 复算比对：有元组就能精确验证 ---------- */
  function verify(fields, key) {
    var expected = derive(fields).key;
    var got = String(key || "").trim().toUpperCase();
    return { ok: expected === got, expected: expected, got: got };
  }

  var API = {
    VERSION: VERSION,
    TUPLE_VERSION: TUPLE_VERSION,
    FIELDS: FIELDS,
    ALPHABET: ALPHABET,
    normalize: normalize,
    canonical: canonical,
    derive: derive,
    parse: parse,
    verify: verify,
    sha256Hex: function (input) {
      return hex(sha256(typeof input === "string" ? utf8(input) : input));
    },
    base32: base32,
    unbase32: unbase32
  };

  global.DogAdoption = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
