#!/usr/bin/env bash
# 仅下载 FLAME2020 的 generic_model.pkl（需 FLAME 账号）。
# 用法：
#   FLAME_USERNAME=你的邮箱 bash download_flame.sh   # 只输密码
#   bash download_flame.sh                            # 交互输入邮箱 + 密码
set -euo pipefail

cd "$(dirname "$0")"
DECA_DIR="third_party/DECA"

USERNAME="${FLAME_USERNAME:-}"
if [ -z "$USERNAME" ]; then
  read -rp "FLAME 用户名/邮箱: " USERNAME
fi
read -rsp "FLAME 密码（输入不显示）: " password; echo

mkdir -p "$DECA_DIR/data"
curl -L -k --fail \
  --data-urlencode "username=${USERNAME}" \
  --data-urlencode "password=${password}" \
  "https://download.is.tue.mpg.de/download.php?domain=flame&sfile=FLAME2020.zip&resume=1" \
  -o "$DECA_DIR/data/FLAME2020.zip"

unzip -o "$DECA_DIR/data/FLAME2020.zip" -d "$DECA_DIR/data/FLAME2020"
cp "$DECA_DIR/data/FLAME2020/generic_model.pkl" "$DECA_DIR/data/"

echo "完成：$DECA_DIR/data/generic_model.pkl"
