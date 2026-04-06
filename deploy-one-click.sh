#!/bin/bash
# 一键部署脚本 - 在本地终端运行

set -e

echo "=== PDF Smart AI 一键部署 ==="
echo ""
echo "请先登录 Cloudflare..."
npx wrangler login

echo ""
echo "=== 1. 创建 D1 数据库 ==="
npx wrangler d1 create pdf-smart-ai-db --location=wnam

echo ""
echo "=== 2. 执行数据库 Schema ==="
npx wrangler d1 execute pdf-smart-ai-db --remote --file=./schema.sql <<'EOF'
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, google_id TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, name TEXT, picture TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL, expires_at DATETIME NOT NULL);
CREATE INDEX idx_sessions_token ON sessions(token);
EOF

echo ""
echo "=== 3. 绑定数据库到 Pages ==="
# 获取数据库 UUID 并更新 wrangler.toml
DB_UUID=$(npx wrangler d1 list | grep pdf-smart-ai-db | awk '{print $2}')
echo "数据库 UUID: $DB_UUID"

cat >> wrangler.toml <<EOF

[[d1_databases]]
binding = "DB"
database_name = "pdf-smart-ai-db"
database_id = "$DB_UUID"
EOF

echo ""
echo "=== 4. 部署到 Pages ==="
npx wrangler pages deploy .

echo ""
echo "=== ✅ 部署完成 ==="
echo "访问: https://pdf-smart-ai.pages.dev"
