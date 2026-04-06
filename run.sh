#!/bin/bash
# PDF Smart AI 部署脚本
# 在本地终端运行，一次搞定

cd "$(dirname "$0")"

echo "🔐 登录 Cloudflare（会打开浏览器）"
npx wrangler login

echo "🗄️ 创建 D1 数据库"
npx wrangler d1 create pdf-smart-ai-db --location=wnam --update-config

echo "📊 创建数据表"
npx wrangler d1 execute pdf-smart-ai-db --remote --command="
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
"

echo "🚀 部署到 Pages"
npx wrangler pages deploy .

echo "✅ 完成！访问 https://pdf-smart-ai.pages.dev"