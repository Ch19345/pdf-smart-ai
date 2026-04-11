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
    const { orderId } = await request.json();
    const token = await getPayPalToken(env, isProduction);
    const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;

    // 验证订单
    const orderResponse = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
    }), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
