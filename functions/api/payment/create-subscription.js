// PayPal 配置
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

const SUBSCRIPTION_PLANS = [
  { id: 'monthly_basic', name: '基础版订阅', price: '9.99', credits_per_month: 500, features: ['每月500积分', '基础AI分析', '邮件支持'] },
  { id: 'monthly_pro', name: '专业版订阅', price: '29.99', credits_per_month: 2000, features: ['每月2000积分', '高级AI分析', '优先支持', '批量处理'] }
];

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

export async function onRequest(context) {
  const { env, request } = context;
  const isProduction = env.PAYPAL_MODE === 'production';

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
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
    }), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
