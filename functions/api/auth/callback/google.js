// functions/api/auth/callback/google.js
// Google OAuth 回调处理（无需数据库）

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const code = url.searchParams.get('code');
  if (!code) {
    return new Response('Authorization code not found', { status: 400 });
  }
  
  try {
    // 1. 用 code 换取 access_token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    });
    
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return new Response(`Token exchange failed`, { status: 400 });
    }
    
    // 2. 获取用户信息
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    
    // 3. 创建签名 session（包含用户信息）
    const sessionData = {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      iat: Date.now(),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    
    // 简单编码（生产环境建议用 JWT）
    const sessionToken = btoa(JSON.stringify(sessionData));
    
    // 4. 重定向回首页，并设置 cookie
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': `session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7*24*60*60}`,
      },
    });
    
  } catch (error) {
    console.error('OAuth error:', error);
    return new Response('Authentication failed', { status: 500 });
  }
}