#!/bin/sh
# ============================================================
# DOG API 领养技能 —— 安装包
#
# 一条命令装完，并当场领养：
#     curl -fsSL https://nullurl.github.io/dog-api-spec/skill/install.sh | sh -s -- --adopter "你@这台机器"
#
# 这个脚本把「其他安装命令」全收进来：取说明书、取命令行实现、领养、复算、
# 卸载。安装包之外不再需要任何一条命令 —— 除了下面那一条 curl。
#
# 安装即授权，卸载即撤回（§5.3）。本技能不联网，只有这里的三条 fetch 走网络。
# 证书写在栖息地**之外**（默认 ~/.workbuddy/dog-api/adoption.json）：
# 卸载不删证书，因为卸载不撤销任何东西。
# ============================================================
set -eu

BASE="${DOG_API_BASE:-https://nullurl.github.io/dog-api-spec}"
DIR="${DOG_API_DIR:-$HOME/.workbuddy/skills/dog-api-adoption}"
PKG="skill"                                      # 安装包在站点里的目录：<基址>/skill/
MANIFEST="SKILL.md dog_adopt.py install.sh"      # 安装包的全部内容

ADOPTER=""; COHORT=""; HABITAT=""; INTENT=""; CERT=""
PASSTHRU=""
UNINSTALL=0; YES=0; NOPROMPT=0

say()  { printf '%s\n' "$*"; }
die()  { printf '%s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
DOG API 领养技能 —— 安装包

  curl -fsSL <基址>/skill/install.sh | sh -s -- [选项]

  --adopter NAME   领养人标识，可填写。不给值且在终端里运行时会问一句
  --cohort  T      领养时刻 YYYY-MM-DDTHH:MM:SSZ（UTC 秒精度）。默认取安装那一刻
  --habitat H      栖息地。默认 ~/.workbuddy/skills/dog-api-adoption
  --intent  I      声明的用途。默认「非商业个人使用」
  --dir D          装到哪里。默认 $HOME/.workbuddy/skills/dog-api-adoption
  --cert P         证书写到哪里。默认 $HOME/.workbuddy/dog-api/adoption.json
  --base URL       从哪里取安装包。默认线上；也可以给本地目录，装法一样
  --keep-going     已装则只打印证书，不重新领养（默认行为）
  --readopt        重新领养（会得到新 KEY，旧 KEY 不作废）
  --verify         凭证书里的元组复算，与 KEY / 名字精确比对
  --selftest       跑 §5.3 公布的测试向量
  --json           机器可读输出
  --uninstall      卸载：删掉栖息地目录。证书不动 —— 牌删了，狗还在
  --yes            卸载时不再问一次
  --no-prompt      不要任何交互（管道里跑的时候本来也不会问）
  -h, --help       这一页

安装这个动作本身就是同意，卸载就是撤回，中间没有第三种状态（§5.3）。
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --adopter)  ADOPTER="${2:?--adopter 后面要跟一个值}"; shift 2 ;;
    --cohort)   COHORT="${2:?--cohort 后面要跟一个值}";   shift 2 ;;
    --habitat)  HABITAT="${2:?--habitat 后面要跟一个值}"; shift 2 ;;
    --intent)   INTENT="${2:?--intent 后面要跟一个值}";   shift 2 ;;
    --dir)      DIR="${2:?--dir 后面要跟一个值}";         shift 2 ;;
    --cert)     CERT="${2:?--cert 后面要跟一个值}";       shift 2 ;;
    --base)     BASE="${2:?--base 后面要跟一个值}";       shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    --yes|-y)   YES=1; shift ;;
    --no-prompt) NOPROMPT=1; shift ;;
    --keep-going|--readopt|--verify|--selftest|--json) PASSTHRU="$1"; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          die "不认识的选项：$1（--help 看用法）" ;;
  esac
done

# ----------------------------------------------------------------- 卸载
if [ "$UNINSTALL" -eq 1 ]; then
  case "$DIR" in
    ""|"/"|"$HOME"|"$HOME/") die "拒绝操作：--dir 指到了不该删的地方（$DIR）" ;;
  esac
  [ -f "$DIR/SKILL.md" ] || die "拒绝删除：$DIR 里没有 SKILL.md，它可能不是本技能的栖息地。"
  grep -q "DOG API 领养技能" "$DIR/SKILL.md" \
    || die "拒绝删除：$DIR/SKILL.md 不是本技能的说明书，不敢动它。"
  if [ "$YES" -eq 0 ] && [ "$NOPROMPT" -eq 0 ] && [ -r /dev/tty ]; then
    printf '%s' "确认卸载？删掉 $DIR 的全部内容（证书不动）：[y/N] " > /dev/tty
    ans=""; read -r ans < /dev/tty || true
    case "$ans" in
      y|Y|yes|YES) : ;;
      *) say "已取消。什么都没动。"; exit 0 ;;
    esac
  fi
  rm -rf "$DIR"
  say "已卸载：$DIR 不存在了。"
  say "证书仍在原处 —— 卸载技能不会删掉它。卸载不撤销任何东西，而一只狗不该因为换了份说明书就消失。"
  exit 0
fi

# ----------------------------------------------------------------- 安装
command -v python3 >/dev/null 2>&1 || die "找不到 python3（本技能只用标准库，不需要装任何包）"

fetch() {                                # $1 = 包内相对路径，$2 = 目标
  case "$BASE" in
    http://*|https://*)
      command -v curl >/dev/null 2>&1 || die "找不到 curl"
      curl -fsSL -o "$2" "$BASE/$PKG/$1" || { rm -f "$2"; die "取不到 $BASE/$PKG/$1"; } ;;
    file://*)  cp "${BASE#file://}/$PKG/$1" "$2" || { rm -f "$2"; die "取不到 $BASE/$PKG/$1"; } ;;
    *)         cp "$BASE/$PKG/$1" "$2" || { rm -f "$2"; die "取不到 $BASE/$PKG/$1"; } ;;
  esac
  # curl -sf 遇 404 时可能留下 0 字节文件：那是「文件在但内容是空的」，
  # 比缺文件更难查。宁可在这里就失败。
  [ -s "$2" ] || { rm -f "$2"; die "取回的文件是空的：$1"; }
}

mkdir -p "$DIR"
n=0
for f in $MANIFEST; do
  fetch "$f" "$DIR/$f"
  n=$((n + 1))
done
[ -f "$DIR/dog_adopt.py" ] || die "安装包不完整"
say "已安装到 $DIR（$n 个文件）。安装这个动作本身就是同意 —— 没有账号、没有登录、没有同意书。"

# ----------------------------------------------------------------- 领养人可填写
# 只在真有终端时问。`curl … | sh` 那条路上 stdin 是脚本本身，
# 在这里读一行会把后面的命令一起吃掉 —— 所以读 /dev/tty，不读 stdin。
if [ -z "$ADOPTER" ] && [ "$NOPROMPT" -eq 0 ] && [ -r /dev/tty ]; then
  printf '%s' "领养人（可填写；直接回车用「用户名@主机名」）：" > /dev/tty
  ans=""; read -r ans < /dev/tty || true
  ADOPTER="$ans"
fi

set --
# 栖息地是元组里的一行，装到非默认目录时如实写实际路径（默认目录写成 ~ 形式，与 §5.3 的约定一致）
if [ -z "$HABITAT" ] && [ "$DIR" != "${DOG_API_DEFAULT_DIR:-$HOME/.workbuddy/skills/dog-api-adoption}" ]; then
  HABITAT="$DIR"
fi
[ -n "$ADOPTER" ] && set -- "$@" --adopter "$ADOPTER"
[ -n "$COHORT" ]  && set -- "$@" --cohort  "$COHORT"
[ -n "$HABITAT" ] && set -- "$@" --habitat "$HABITAT"
[ -n "$INTENT" ]  && set -- "$@" --intent  "$INTENT"
[ -n "$CERT" ]    && set -- "$@" --cert    "$CERT"
[ -n "${PASSTHRU:-}" ] && set -- "$@" "$PASSTHRU"

if [ "${PASSTHRU:-}" != "--json" ]; then say ""; fi
python3 "$DIR/dog_adopt.py" "$@"

if [ "${PASSTHRU:-}" != "--json" ]; then
  say ""
  say "卸载：sh $DIR/install.sh --uninstall     （牌删了，狗还在）"
  say "复算：python3 $DIR/dog_adopt.py --verify （凭证书里的元组重算一遍）"
fi
