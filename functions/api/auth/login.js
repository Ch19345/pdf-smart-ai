// functions/api/auth/login.js
// Google OAuth 登录入口

export async function onRequest(context) {
  const GOOGLE_CLIENT_ID = context.env.GOOGLE_CLIENT_ID;
  const REDIRECT_URI = `${context.request.url.origin}/api/auth/callback/google`;
  
  // 生成随机 state 防止 CSRF
  const state = crypto.randomUUID();
  
  // 构建 Google OAuth URL
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'consent');
  
  // 返回包含 state 的响应（前端需要存储 state）
  return new Response(JSON.stringify({
    url: googleAuthUrl.toString(),
    state: state
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}