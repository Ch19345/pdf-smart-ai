// PayPal Worker - 简化版
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function getPayPalToken(env, isProduction) {
  const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;
  const auth = btoa(`${config.clientId}:${config.clientSecret}`);
  const res = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error('PayPal auth failed');
  return (await res.json()).access_token;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isProduction = env.PAYPAL_MODE === 'production';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // GET packages
      if (path === '/api/payment/packages') {
        return json({ packages: CREDIT_PACKAGES });
      }

      // GET subscription plans
      if (path === '/api/payment/subscription-plans') {
        return json({ plans: SUBSCRIPTION_PLANS });
      }

      // POST create order
      if (path === '/api/payment/create-order' && request.method === 'POST') {
        const { packageId, userEmail } = await request.json();
        const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
        if (!pkg) throw new Error('Invalid package');

        const token = await getPayPalToken(env, isProduction);
        const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;

        const res = await fetch(`${config.apiBase}/v2/checkout/orders`, {
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

        if (!res.ok) throw new Error('Create order failed');
        const data = await res.json();
        return json({ orderId: data.id, approveUrl: data.links?.find(l => l.rel === 'approve')?.href });
      }

      // POST capture order
      if (path === '/api/payment/capture-order' && request.method === 'POST') {
        const { orderId } = await request.json();
        const token = await getPayPalToken(env, isProduction);
        const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;

        // Verify order
        const orderRes = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!orderRes.ok) throw new Error('Order not found');
        const order = await orderRes.json();
        if (order.status !== 'APPROVED') throw new Error(`Status: ${order.status}`);

        // Capture
        const captureRes = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}/capture`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!captureRes.ok) throw new Error('Capture failed');

        const customData = JSON.parse(order.purchase_units[0].custom_id);
        return json({ success: true, orderId, credits: customData.credits, userEmail: customData.user_email });
      }

      // POST create subscription
      if (path === '/api/payment/create-subscription' && request.method === 'POST') {
        const { planId, userEmail } = await request.json();
        const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
        if (!plan) throw new Error('Invalid plan');

        const token = await getPayPalToken(env, isProduction);
        const config = isProduction ? PAYPAL_CONFIG.production : PAYPAL_CONFIG.sandbox;
        const origin = url.origin;

        // Create product
        const productRes = await fetch(`${config.apiBase}/v1/catalogs/products`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: plan.name, type: 'SERVICE', category: 'SOFTWARE' })
        });
        if (!productRes.ok) throw new Error('Create product failed');
        const product = await productRes.json();

        // Create billing plan
        const planRes = await fetch(`${config.apiBase}/v1/billing/plans`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: product.id,
            name: `${plan.name} - Monthly`,
            billing_cycles: [{
              frequency: { interval_unit: 'MONTH', interval_count: 1 },
              tenure_type: 'REGULAR',
              sequence: 1,
              total_cycles: 0,
              pricing_scheme: { fixed_price: { value: plan.price, currency_code: 'USD' } }
            }],
            payment_preferences: { auto_bill_outstanding: true }
          })
        });
        if (!planRes.ok) throw new Error('Create plan failed');
        const billingPlan = await planRes.json();

        // Create subscription
        const subRes = await fetch(`${config.apiBase}/v1/billing/subscriptions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
          body: JSON.stringify({
            plan_id: billingPlan.id,
            subscriber: { email_address: userEmail },
            application_context: {
              brand_name: 'PDF Smart AI',
              return_url: `${origin}/?subscription=success`,
              cancel_url: `${origin}/?subscription=cancelled`
            }
          })
        });
        if (!subRes.ok) throw new Error('Create subscription failed');
        const subData = await subRes.json();

        return json({ subscriptionId: subData.id, status: subData.status, approveUrl: subData.links?.find(l => l.rel === 'approve')?.href });
      }

      // POST webhook
      if (path === '/api/payment/webhook' && request.method === 'POST') {
        const body = await request.json();
        console.log(`[Webhook] ${body.event_type}: ${body.resource?.id}`);
        return json({ received: true });
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
