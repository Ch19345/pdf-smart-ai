// functions/api/auth/logout.js
// 退出登录

export async function onRequest(context) {
  // 清除 session cookie
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
  });
}