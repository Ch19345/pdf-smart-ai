// functions/api/auth/me.js
// 获取当前登录用户信息

export async function onRequest(context) {
  const { request, env } = context;
  
  // 从 cookie 获取 session
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => c.split('='))
  );
  
  const sessionToken = cookies.session;
  
  if (!sessionToken) {
    return new Response(JSON.stringify({ loggedIn: false }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
  
  try {
    // 解析 session token
    const payload = JSON.parse(atob(sessionToken));
    
    // 检查是否过期
    if (payload.exp < Date.now()) {
      return new Response(JSON.stringify({ loggedIn: false, expired: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    // 返回用户信息
    return new Response(JSON.stringify({
      loggedIn: true,
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      }
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ loggedIn: false, error: 'Invalid session' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}