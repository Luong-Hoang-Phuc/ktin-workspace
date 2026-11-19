#!/bin/sh
# Đóng gói web để đăng lên Cloudflare Pages: nén + làm rối JS/CSS vào thư mục dist/
# Cloudflare Pages: Build command = sh build.sh · Build output directory = dist
set -e
ESBUILD="${ESBUILD:-npx --yes esbuild@0.28.2}"
rm -rf dist && mkdir -p dist/js/views dist/js/vendor dist/css
# Nén từng tệp riêng (không gộp) để giữ nguyên cách các module gọi nhau
$ESBUILD js/*.js js/views/*.js --minify --format=esm --target=es2022 \
  --legal-comments=none --outbase=js --outdir=dist/js --log-level=warning
cp js/vendor/*.js dist/js/vendor/
$ESBUILD css/style.css --minify --outfile=dist/css/style.css --log-level=warning
cp index.html robots.txt _headers dist/
echo "Đã đóng gói vào dist/"
