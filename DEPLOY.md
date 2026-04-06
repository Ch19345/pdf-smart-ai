# 一键部署到 Cloudflare Pages

## 步骤（2分钟）

### 1. 推送到 GitHub
```bash
git add .
git commit -m "deploy"
git push origin main
```

### 2. 在 GitHub 设置 Secrets
打开 `https://github.com/你的用户名/pdf-smart-ai/settings/secrets/actions`

添加两个 Secrets：
- `CLOUDFLARE_API_TOKEN`: 从 https://dash.cloudflare.com/profile/api-tokens 创建
  - 权限：Cloudflare Pages:Edit, D1:Edit
- `CLOUDFLARE_ACCOUNT_ID`: `4e4d1829dba852d88b69a8904923f2fd`

### 3. 自动部署
推送后 GitHub Actions 会自动部署，访问 https://pdf-smart-ai.pages.dev

## D1 数据库
部署后去 Dashboard 手动创建：
1. https://dash.cloudflare.com/d1 → Create database → pdf-smart-ai-db
2. SQL Editor 执行：
```sql
CREATE TABLE users (id INTEGER PRIMARY KEY, google_id TEXT UNIQUE, email TEXT UNIQUE, name TEXT, picture TEXT);
CREATE TABLE sessions (id INTEGER PRIMARY KEY, token TEXT UNIQUE, user_id INTEGER, expires_at DATETIME);
```
3. Pages → pdf-smart-ai → Settings → Functions → Add D1 binding (Variable: DB)
