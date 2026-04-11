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

const CREDIT_PACKAGES = [
  { id: 'credits_100', credits: 100, price: '4.99', name: '100积分包' },
  { id: 'credits_500', credits: 500, price: '19.99', name: '500积分包' },
  { id: 'credits_2000', credits: 2000, price: '59.99', name: '2000积分包(推荐)' }
];

const SUBSCRIPTION_PLANS = [
  { id: 'monthly_basic', name: '基础版订阅', price: '9.99', credits_per_month: 500 },
  { id: 'monthly_pro', name: '专业版订阅', price: '29.99', credits_per_month: 2000 }
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
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ packages: CREDIT_PACKAGES }), { headers: corsHeaders });
    }

    if (request.method === 'POST') {
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
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
