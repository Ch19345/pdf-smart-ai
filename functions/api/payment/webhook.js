// PayPal Webhook 处理
// 文档: https://developer.paypal.com/api/webhooks/v1/#webhooks_verify-post

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

async function verifyWebhookSignature(headers, body, webhookId, env, isProduction) {
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
        'Access-Control-Allow-Headers': 'Content-Type, PayPal-Auth-Algo, PayPal-Cert-Url, PayPal-Transmission-Id, PayPal-Transmission-Sig, PayPal-Transmission-Time'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const headers = request.headers;

    // 验证 Webhook 签名
    const webhookId = isProduction ? env.PAYPAL_WEBHOOK_ID : 'SANDBOX_WEBHOOK_ID';
    
    // Sandbox 测试模式可以跳过验证
    if (!isProduction && headers.get('paypal-transmission-id')?.startsWith('TEST-')) {
      console.log('[Webhook] Sandbox test mode - skipping signature verification');
    } else {
      const isVerified = await verifyWebhookSignature(headers, body, webhookId, env, isProduction);
      if (!isVerified) {
        console.error('[Webhook] Signature verification failed');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: corsHeaders });
      }
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

    return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
  } catch (error) {
    console.error('[Webhook] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
