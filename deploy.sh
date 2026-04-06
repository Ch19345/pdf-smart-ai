#!/bin/bash
# 一键创建 D1 数据库并部署
# 使用前需设置: export CLOUDFLARE_API_TOKEN="你的Token"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "错误: 请先设置 CLOUDFLARE_API_TOKEN"
  echo "获取方式: https://dash.cloudflare.com/profile/api-tokens"
  exit 1
fi

echo "=== 1. 创建 D1 数据库 ==="
npx wrangler d1 create pdf-smart-ai-db

echo "=== 2. 执行 Schema ==="
npx wrangler d1 execute pdf-smart-ai-db --file=./schema.sql

echo "=== 3. 部署到 Pages ==="
npx wrangler pages deploy .

echo "=== 完成 ==="
