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

export async function onRequest(context) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  return new Response(JSON.stringify({ plans: SUBSCRIPTION_PLANS }), { headers: corsHeaders });
}
