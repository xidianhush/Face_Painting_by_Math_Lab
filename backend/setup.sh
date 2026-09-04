#!/usr/bin/env bash
# 一键准备 DECA：clone 官方仓库 + 下载 FLAME 模型与 DECA 预训练权重。
# 用法：bash backend/setup.sh
set -euo pipefail

cd "$(dirname "$0")"
DECA_DIR="third_party/DECA"

echo "==> [1/3] clone DECA 官方仓库（浅克隆）"
if [ ! -d "$DECA_DIR/.git" ]; then
  git clone --depth 1 https://github.com/YadiraF/DECA.git "$DECA_DIR"
else
  echo "    $DECA_DIR 已存在，跳过 clone"
fi

echo "==> [2/3] 下载 FLAME2020 的 generic_model.pkl（需 FLAME 账号）"
echo "    请先到 https://flame.is.tue.mpg.de/ 注册并同意许可"
read -rp "    FLAME 用户名: " username
read -rsp "    FLAME 密码: " password; echo
mkdir -p "$DECA_DIR/data"
curl -L --fail \
  --data-urlencode "username=${username}" \
  --data-urlencode "password=${password}" \
  "https://download.is.tue.mpg.de/download.php?domain=flame&sfile=FLAME2020.zip&resume=1" \
  -o "$DECA_DIR/data/FLAME2020.zip"
unzip -o "$DECA_DIR/data/FLAME2020.zip" -d "$DECA_DIR/data/FLAME2020"
cp "$DECA_DIR/data/FLAME2020/generic_model.pkl" "$DECA_DIR/data/"

echo "==> [3/3] 下载 deca_model.tar（~245MB，Google Drive）"
if ! command -v gdown >/dev/null 2>&1; then
  echo "    安装 gdown..."
  pip install gdown
fi
gdown "https://drive.google.com/uc?id=1rp8kdyLPvErw2dTmqtjISRVvQLj6Yzje" \
  -O "$DECA_DIR/data/deca_model.tar"

echo "==> 完成。DECA 位于 $DECA_DIR，数据位于 $DECA_DIR/data"
