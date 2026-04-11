/**
 * PDF Smart AI - Cloudflare Worker
 * 支持: 登录 + Chat + PayPal 支付
 */
import indexHtml from "./public/index.html";

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

// 积分包配置
const CREDIT_PACKAGES = [
  { id: 'credits_100', credits: 100, price: '4.99', name: '100积分包' },
  { id: 'credits_500', credits: 500, price: '19.99', name: '500积分包' },
  { id: 'credits_2000', credits: 2000, price: '59.99', name: '2000积分包(推荐)' }
];

// 订阅计划配置
const SUBSCRIPTION_PLANS = [
  { id: 'monthly_basic', name: '基础版订阅', price: '9.99', credits_per_month: 500, features: ['每月500积分', '基础AI分析', '邮件支持'] },
  { id: 'monthly_pro', name: '专业版订阅', price: '29.99', credits_per_month: 2000, features: ['每月2000积分', '高级AI分析', '优先支持', '批量处理'] }
];

// ============ PayPal 工具函数 ============
async function getPayPalToken(env, isProduction = false) {
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

async function verifyWebhookSignature(headers, body, webhookId, isProduction = false) {
  const token = await getPayPalToken(env, isProduction);
  const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;
  
  const response = await fetch(`${config.apiBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: body
    })
  });
  
  if (!response.ok) return false;
  const data = await response.json();
  return data.verification_status === 'SUCCESS';
}

// ============ 主入口 ============
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isProduction = env.PAYPAL_MODE === 'production';
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, PayPal-Auth-Algo, PayPal-Cert-Url, PayPal-Transmission-Id, PayPal-Transmission-Sig, PayPal-Transmission-Time'
    };
    
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    
    // 静态页面
    if (path === '/') return new Response(indexHtml, { headers: { 'Content-Type': 'text/html' } });
    
    // ============ 认证相关 ============
    if (path === '/api/auth/login') return handleLogin(request, env, corsHeaders);
    if (path === '/api/auth/callback/google') return handleCallback(request, env, corsHeaders);
    if (path === '/api/auth/logout') return handleLogout(request, env, corsHeaders);
    if (path === '/api/auth/me') return handleMe(request, env, corsHeaders);
    
    // ============ Chat ============
    if (path === '/api/chat' && request.method === 'POST') return handleChat(request, env, corsHeaders);
    
    // ============ PayPal 支付 ============
    if (path === '/api/payment/packages') return handleGetPackages(request, env, corsHeaders);
    if (path === '/api/payment/create-order' && request.method === 'POST') return handleCreateOrder(request, env, corsHeaders, isProduction);
    if (path === '/api/payment/capture-order' && request.method === 'POST') return handleCaptureOrder(request, env, corsHeaders, isProduction);
    if (path === '/api/payment/subscription-plans') return handleGetSubscriptionPlans(request, env, corsHeaders);
    if (path === '/api/payment/create-subscription' && request.method === 'POST') return handleCreateSubscription(request, env, corsHeaders, isProduction);
    
    // ============ PayPal Webhook ============
    if (path === '/api/payment/webhook' && request.method === 'POST') {
      return handleWebhook(request, env, corsHeaders, isProduction);
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// ============ 认证处理函数 ============
async function handleLogin(request, env, corsHeaders) {
  const REDIRECT_URI = `${new URL(request.url).origin}/api/auth/callback/google`;
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', crypto.randomUUID());
  return new Response(JSON.stringify({ url: googleAuthUrl.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleCallback(request, env, corsHeaders) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('Authorization code not found', { status: 400 });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/api/auth/callback/google`, grant_type: 'authorization_code' })
  });
  const tokens = await tokenResponse.json();
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
  const user = await userResponse.json();
  const sessionData = { email: user.email, name: user.name, picture: user.picture, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  return new Response(null, { status: 302, headers: { 'Location': '/', 'Set-Cookie': `session=${btoa(JSON.stringify(sessionData))}; Path=/; HttpOnly; Max-Age=604800`, ...corsHeaders } });
}

async function handleLogout(request, env, corsHeaders) {
  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' } });
}

async function handleMe(request, env, corsHeaders) {
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie.includes('session=')) return new Response(JSON.stringify({ loggedIn: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const match = cookie.match(/session=([^;]+)/);
    if (!match) throw new Error('No session');
    const session = JSON.parse(atob(match[1]));
    if (session.exp < Date.now()) return new Response(JSON.stringify({ loggedIn: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ loggedIn: true, user: { email: session.email, name: session.name, picture: session.picture } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ loggedIn: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// ============ Chat 处理 ============
async function handleChat(request, env, corsHeaders) {
  try {
    const { question, context } = await request.json();
    const prompt = `Document:\n${context}\n\nQuestion: ${question}`;
    
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/4e4d1829dba852d88b69a8904923f2fd/ai/run/@cf/meta/llama-2-7b-chat-int8', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN || env.TENCENT_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: 'You are a helpful AI assistant. Answer based on the document content.' }, { role: 'user', content: prompt }] })
    });
    
    if (!response.ok) {
      return new Response(JSON.stringify({ response: `Based on the document, I can answer your question about "${question}".` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const data = await response.json();
    return new Response(JSON.stringify({ response: data.result?.response || 'I analyzed the document and found relevant information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ response: 'I apologize, but I encountered an error processing your request. Please try again.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// ============ PayPal 支付处理 ============
async function handleGetPackages(request, env, corsHeaders) {
  return new Response(JSON.stringify({ packages: CREDIT_PACKAGES }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleGetSubscriptionPlans(request, env, corsHeaders) {
  return new Response(JSON.stringify({ plans: SUBSCRIPTION_PLANS }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleCreateOrder(request, env, corsHeaders, isProduction) {
  try {
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
    
    return new Response(JSON.stringify({ orderId: data.id, approveUrl: data.links?.find(l => l.rel === 'approve')?.href }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleCaptureOrder(request, env, corsHeaders, isProduction) {
  try {
    const { orderId } = await request.json();
    const token = await getPayPalToken(env, isProduction);
    const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;
    
    // 先验证订单
    const orderResponse = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!orderResponse.ok) throw new Error('Order not found');
    const order = await orderResponse.json();
    if (order.status !== 'APPROVED') throw new Error(`Invalid order status: ${order.status}`);
    
    // 执行扣款
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
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleCreateSubscription(request, env, corsHeaders, isProduction) {
  try {
    const { planId, userEmail, returnUrl, cancelUrl } = await request.json();
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    if (!plan) throw new Error('Invalid plan');
    
    const token = await getPayPalToken(env, isProduction);
    const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;
    
    // 创建产品
    const productResponse = await fetch(`${config.apiBase}/v1/catalogs/products`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: plan.name, description: plan.features.join(', '), type: 'SERVICE', category: 'SOFTWARE' })
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
          return_url: returnUrl || `${new URL(returnUrl).origin}/?subscription=success`,
          cancel_url: cancelUrl || `${new URL(returnUrl).origin}/?subscription=cancelled`
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
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

// ============ PayPal Webhook 处理 ============
async function handleWebhook(request, env, corsHeaders, isProduction) {
  try {
    const body = await request.json();
    const headers = request.headers;
    
    // 验证 Webhook 签名 (生产环境必须验证)
    const webhookId = isProduction ? env.PAYPAL_WEBHOOK_ID : 'SANDBOX_WEBHOOK_ID';
    const isVerified = await verifyWebhookSignature(headers, body, webhookId, isProduction);
    
    // Sandbox 环境可以跳过验证用于测试
    if (!isProduction && headers.get('paypal-transmission-id')?.startsWith('TEST-')) {
      console.log('[Webhook] Sandbox test mode - skipping signature verification');
    } else if (!isVerified) {
      console.error('[Webhook] Signature verification failed');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const eventType = body.event_type;
    const resource = body.resource;
    
    console.log(`[Webhook] Received: ${eventType}`);
    
    // 处理不同事件
    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.REACTIVATED':
        console.log(`[Webhook] 订阅激活: ${resource.id}, 用户: ${resource.custom_id}`);
        // TODO: 激活用户订阅，更新数据库
        break;
        
      case 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED':
        console.log(`[Webhook] 订阅续费成功: ${resource.id}`);
        // TODO: 为用户添加积分
        break;
        
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        console.log(`[Webhook] 订阅取消/过期: ${resource.id}`);
        // TODO: 取消用户订阅
        break;
        
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        console.log(`[Webhook] 订阅暂停: ${resource.id}`);
        // TODO: 暂停用户订阅
        break;
        
      case 'PAYMENT.CAPTURE.COMPLETED':
        console.log(`[Webhook] 支付完成: ${resource.id}, 金额: ${resource.amount?.value} ${resource.amount?.currency_code}`);
        // TODO: 为用户添加积分
        break;
        
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.REFUNDED':
        console.log(`[Webhook] 支付失败/退款: ${resource.id}`);
        // TODO: 处理失败/退款
        break;
        
      default:
        console.log(`[Webhook] 未处理的事件: ${eventType}`);
    }
    
    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[Webhook] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
