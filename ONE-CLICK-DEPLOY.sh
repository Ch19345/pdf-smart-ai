# 一键部署脚本
# 需要先安装依赖: npm install

# 1. 先登录 Cloudflare
npx wrangler login

# 2. 创建 D1 数据库并执行 schema
npx wrangler d1 create pdf-smart-ai-db --location=nam
npx wrangler d1 execute pdf-smart-ai-db --local --file=./schema.sql

# 3. 部署到 Pages
npx wrangler pages deploy .