// Cloudflare Pages _worker.js - 统一 API 入口
// 文档: https://developers.cloudflare.com/pages/functions/advanced-mode/

// ============ PayPal 配置 ============
const PAYPAL_CONFIG = {
  sandbox: {
    apiBase: 'https://api.sandbox.paypal.com',
    clientId: 'AU8smpjlmguKCQeHfxqy3c9Vn08qHWsBC02ILrU5KCYZoRg-eNYJl9BcWI-dgnWwMZduf2nRu-5Vdfoo',
    clientSecret: 'EEwBonPNL4PeX7lGjVaewz_cyDEz_YQhBoeZv2unaPuIhM-gSmHXirwuV2BRKHmDJH7zNL0H7Zuhj4nb'
  },
  production: {
    apiBase: 'https://api.paypal.com',
    clientId: 'YOUR_PRODUCTION_CLIENT_ID',
    clientSecret: 'YOUR_PRODUCTION_CLIENT_SECRET'
  }
};

const CREDIT_PACKAGES = [
  { id: 'credits_100', credits: 100, price: '4.99', name: '100积分包' },
  { id: 'credits_500', credits: 500, price: '19.99', name: '500积分包' },
  { id: 'credits_2000', credits: 2000, price: '59.99', name: '2000积分包(推荐)' }
];

const SUBSCRIPTION_PLANS = [
  { id: 'monthly_basic', name: '基础版订阅', price: '9.99', credits_per_month: 500, features: ['每月500积分', '基础AI分析', '邮件支持'] },
  { id: 'monthly_pro', name: '专业版订阅', price: '29.99', credits_per_month: 2000, features: ['每月2000积分', '高级AI分析', '优先支持', '批量处理'] }
];

// ============ 工具函数 ============
async function getPayPalToken(env, isProduction) {
  const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;
  const auth = btoa(`${config.clientId}:${config.clientSecret}`);
  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) throw new Error(`PayPal auth failed: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSHA256(key, message) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

// ============ 腾讯混元签名 ============
async function generateTencentSignature(secretId, secretKey, action, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const service = "hunyuan";
  const host = "hunyuan.tencentcloudapi.com";
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedPayload = await sha256(payload);
  
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
  
  const secretDate = await hmacSHA256(`TC3${secretKey}`, date);
  const secretService = await hmacSHA256(secretDate, service);
  const secretSigning = await hmacSHA256(secretService, "tc3_request");
  const signature = await hmacSHA256(secretSigning, stringToSign);
  
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

// ============ CORS 头 ============
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, PayPal-Auth-Algo, PayPal-Cert-Url, PayPal-Transmission-Id, PayPal-Transmission-Sig, PayPal-Transmission-Time'
};

// ============ 主入口 ============
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isProduction = env.PAYPAL_MODE === 'production';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ============ PayPal 支付 API ============
      if (path === '/api/payment/packages') {
        return new Response(JSON.stringify({ packages: CREDIT_PACKAGES }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (path === '/api/payment/subscription-plans') {
        return new Response(JSON.stringify({ plans: SUBSCRIPTION_PLANS }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (path === '/api/payment/create-order' && request.method === 'POST') {
        return handleCreateOrder(request, env, isProduction);
      }

      if (path === '/api/payment/capture-order' && request.method === 'POST') {
        return handleCaptureOrder(request, env, isProduction);
      }

      if (path === '/api/payment/create-subscription' && request.method === 'POST') {
        return handleCreateSubscription(request, env, isProduction);
      }

      if (path === '/api/payment/webhook' && request.method === 'POST') {
        return handleWebhook(request, env, isProduction);
      }

      // ============ Chat API ============
      if (path === '/api/chat' && request.method === 'POST') {
        return handleChat(request, env);
      }

      // ============ 静态文件 ============
      return env.ASSETS.fetch(request);
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

// ============ PayPal 处理函数 ============
async function handleCreateOrder(request, env, isProduction) {
  const { packageId, userEmail } = await request.json();
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
  if (!pkg) throw new Error('Invalid package');

  const token = await getPayPalToken(env, isProduction);
  const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;

  const response = await fetch(`${config.apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': crypto.randomUUID()
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: pkg.price },
        description: pkg.name,
        custom_id: JSON.stringify({ type: 'credits', package_id: pkg.id, credits: pkg.credits, user_email: userEmail })
      }]
    })
  });

  if (!response.ok) throw new Error(`Create order failed: ${await response.text()}`);
  const data = await response.json();

  return new Response(JSON.stringify({
    orderId: data.id,
    approveUrl: data.links?.find(l => l.rel === 'approve')?.href
  }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

async function handleCaptureOrder(request, env, isProduction) {
  const { orderId } = await request.json();
  const token = await getPayPalToken(env, isProduction);
  const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;

  const orderResponse = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!orderResponse.ok) throw new Error('Order not found');
  const order = await orderResponse.json();
  if (order.status !== 'APPROVED') throw new Error(`Invalid order status: ${order.status}`);

  const captureResponse = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  if (!captureResponse.ok) throw new Error(`Capture failed: ${await captureResponse.text()}`);
  const captureData = await captureResponse.json();
  const customData = JSON.parse(order.purchase_units[0].custom_id);

  return new Response(JSON.stringify({
    success: true,
    orderId: orderId,
    captureId: captureData.purchase_units[0].payments.captures[0].id,
    amount: order.purchase_units[0].amount.value,
    credits: customData.credits,
    userEmail: customData.user_email
  }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

async function handleCreateSubscription(request, env, isProduction) {
  const { planId, userEmail, returnUrl, cancelUrl } = await request.json();
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
  if (!plan) throw new Error('Invalid plan');

  const token = await getPayPalToken(env, isProduction);
  const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;
  const origin = new URL(request.url).origin;

  // 创建产品
  const productResponse = await fetch(`${config.apiBase}/v1/catalogs/products`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: plan.name,
      description: plan.features.join(', '),
      type: 'SERVICE',
      category: 'SOFTWARE'
    })
  });
  if (!productResponse.ok) throw new Error(`Create product failed: ${await productResponse.text()}`);
  const product = await productResponse.json();

  // 创建计划
  const planResponse = await fetch(`${config.apiBase}/v1/billing/plans`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product.id,
      name: `${plan.name} - 月度`,
      description: `每月${plan.credits_per_month}积分`,
      billing_cycles: [{
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: plan.price, currency_code: 'USD' } }
      }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3, setup_fee_failure_action: 'CONTINUE' },
      taxes: { percentage: '0', inclusive: false }
    })
  });
  if (!planResponse.ok) throw new Error(`Create plan failed: ${await planResponse.text()}`);
  const billingPlan = await planResponse.json();

  // 创建订阅
  const subResponse = await fetch(`${config.apiBase}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
    body: JSON.stringify({
      plan_id: billingPlan.id,
      subscriber: { email_address: userEmail },
      application_context: {
        brand_name: 'PDF Smart AI',
        locale: 'zh-CN',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl || `${origin}/?subscription=success`,
        cancel_url: cancelUrl || `${origin}/?subscription=cancelled`
      },
      custom_id: JSON.stringify({ user_email: userEmail, plan_id: planId })
    })
  });

  if (!subResponse.ok) throw new Error(`Create subscription failed: ${await subResponse.text()}`);
  const subData = await subResponse.json();

  return new Response(JSON.stringify({
    subscriptionId: subData.id,
    status: subData.status,
    approveUrl: subData.links?.find(l => l.rel === 'approve')?.href
  }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

async function handleWebhook(request, env, isProduction) {
  const body = await request.json();

  console.log(`[Webhook] Received: ${body.event_type}`);

  switch (body.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.REACTIVATED':
      console.log(`[Webhook] 订阅激活: ${body.resource?.id}`);
      break;
    case 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED':
      console.log(`[Webhook] 订阅续费成功: ${body.resource?.id}`);
      break;
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      console.log(`[Webhook] 订阅取消/过期: ${body.resource?.id}`);
      break;
    case 'PAYMENT.CAPTURE.COMPLETED':
      console.log(`[Webhook] 支付完成: ${body.resource?.id}`);
      break;
    default:
      console.log(`[Webhook] 未处理的事件: ${body.event_type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

// ============ Chat 处理函数 ============
async function handleChat(request, env) {
  const { question, context } = await request.json();
  
  const TENCENT_SECRET_ID = env.TENCENT_SECRET_ID;
  const TENCENT_SECRET_KEY = env.TENCENT_SECRET_KEY;

  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'API credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const payload = JSON.stringify({
    Model: "hunyuan-lite",
    Messages: [
      { Role: "system", Content: "You are a helpful AI assistant. Answer based on the document content." },
      { Role: "user", Content: `Document:\n${context}\n\nQuestion: ${question}` }
    ],
    Temperature: 0.7,
    MaxTokens: 1024
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const authorization = await generateTencentSignature(TENCENT_SECRET_ID, TENCENT_SECRET_KEY, "ChatCompletions", payload);

  const response = await fetch('https://hunyuan.tencentcloudapi.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'hunyuan.tencentcloudapi.com',
      'X-TC-Version': '2023-09-01',
      'X-TC-Action': 'ChatCompletions',
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': 'ap-guangzhou',
      'Authorization': authorization
    },
    body: payload
  });

  const data = await response.json();

  if (data.Response?.Choices?.[0]?.Message?.Content) {
    return new Response(JSON.stringify({ response: data.Response.Choices[0].Message.Content }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  return new Response(JSON.stringify({ error: data.Response?.Error?.Message || 'Unknown error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
