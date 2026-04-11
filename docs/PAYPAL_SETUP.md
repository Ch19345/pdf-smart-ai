# PayPal 生产环境配置指南

## 1. 获取 PayPal 生产环境凭证

1. 登录 [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. 切换到 **Live** 环境
3. 创建 App → 获取 **Client ID** 和 **Secret**

## 2. 配置 Cloudflare Pages 环境变量

在 Cloudflare Dashboard → Pages → pdf-smart-ai → Settings → Environment variables 添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `PAYPAL_MODE` | `production` | 切换到生产模式 |
| `PAYPAL_WEBHOOK_ID` | (从 PayPal 获取) | Webhook ID |

## 3. 在 PayPal Dashboard 配置 Webhook

1. 进入 [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) → Live → App → Webhooks
2. 添加 Webhook URL: `https://your-domain.com/api/payment/webhook`
3. 选择以下事件类型：
   - `Billing subscription activated`
   - `Billing subscription payment completed`
   - `Billing subscription cancelled`
   - `Billing subscription expired`
   - `Billing subscription suspended`
   - `Payment capture completed`
   - `Payment capture denied`
   - `Payment capture refunded`

4. 复制 Webhook ID 到 Cloudflare 环境变量

## 4. 更新代码中的生产凭证

编辑 `functions/api/payment/*.js` 文件，替换：

```javascript
production: {
  apiBase: 'https://api.paypal.com',
  clientId: 'YOUR_PRODUCTION_CLIENT_ID',      // ← 替换为你的 Client ID
  clientSecret: 'YOUR_PRODUCTION_CLIENT_SECRET' // ← 替换为你的 Secret
}
```

**安全建议**: 生产环境建议将 Client ID 和 Secret 也移到环境变量中

## 5. 测试

### 5.1 Sandbox 测试 (已完成)
当前代码使用 Sandbox 环境，可以直接测试

### 5.2 生产测试
配置完成后，推送代码自动部署，访问：
- `https://your-domain.com/api/payment/packages`
- `https://your-domain.com/api/payment/subscription-plans`

确认返回数据正常

## API 端点列表

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/payment/packages` | GET | 获取积分包列表 |
| `/api/payment/create-order` | POST | 创建积分订单 |
| `/api/payment/capture-order` | POST | 确认支付 |
| `/api/payment/subscription-plans` | GET | 获取订阅计划 |
| `/api/payment/create-subscription` | POST | 创建订阅 |
| `/api/payment/webhook` | POST | PayPal Webhook |

## 前端集成示例

```javascript
// 1. 获取积分包
const packages = await fetch('/api/payment/packages').then(r => r.json());

// 2. 创建订单
const { orderId, approveUrl } = await fetch('/api/payment/create-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ packageId: 'credits_100', userEmail: 'user@example.com' })
}).then(r => r.json());

// 3. 重定向到 PayPal 支付
window.location.href = approveUrl;

// 4. 用户支付完成后，前端调用 capture
const result = await fetch('/api/payment/capture-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId })
}).then(r => r.json());
```
