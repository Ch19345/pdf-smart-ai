# PDF Smart AI - Cloudflare Workers

一个极简的 PDF AI 助手，部署在 Cloudflare Workers 上。

## 🚀 快速部署

```bash
# 1. 安装依赖
cd pdf-smart-ai
npm install

# 2. 登录 Cloudflare
npx wrangler login

# 3. 部署到 Cloudflare
npx wrangler deploy
```

## 📁 项目结构

```
pdf-smart-ai/
├── src/
│   └── index.ts      # 主 Worker 代码 (含 HTML)
├── wrangler.toml     # Cloudflare 配置
├── package.json
└── tsconfig.json
```

## ⚡ 功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 首页上传 | ✅ | 拖拽/点击上传 PDF |
| 工作区 | ✅ | 左侧 PDF 预览，右侧 AI 对话 |
| 用户认证 | 🔶 | 前端 UI，后端需集成 |
| 导出功能 | 🔶 | 前端 UI |
| Stripe 支付 | 🔶 | 需配置 API Key |
| AI 对话 | 🔶 | 需接入 OpenAI/Claude |

## 🔧 环境变量

创建 `.dev.vars` 文件进行本地开发：

```bash
# .dev.vars
STRIPE_SECRET_KEY=sk_test_xxx
OPENAI_API_KEY=sk-xxx
```

生产环境在 Cloudflare Dashboard 设置。

## 💡 架构说明

- **无存储**: PDF 文件在内存中处理（Workers 限制 ~15MB）
- **无状态**: 使用 D1 数据库存储用户订阅（如需）
- **边缘计算**: 全球 CDN 加速

## 🔨 后续集成

1. **AI 集成** - 在 `/api/chat` 中接入 OpenAI/Claude
2. **Stripe** - 配置 `STRIPE_SECRET_KEY` 并实现 Webhook
3. **PDF 解析** - 使用 pdf-lib 或 pdfjs-dist
4. **用户系统** - 使用 D1 数据库 + JWT

## 📄 License

MIT
