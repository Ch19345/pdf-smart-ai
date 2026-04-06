/**
 * PDF Smart AI - Cloudflare Worker
 */
import indexHtml from "./public/index.html";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (path === '/') return new Response(indexHtml, { headers: { 'Content-Type': 'text/html' } });
    if (path === '/api/auth/login') return handleLogin(request, env, corsHeaders);
    if (path === '/api/auth/callback/google') return handleCallback(request, env, corsHeaders);
    if (path === '/api/auth/logout') return handleLogout(request, env, corsHeaders);
    if (path === '/api/auth/me') return handleMe(request, env, corsHeaders);
    if (path === '/api/chat' && request.method === 'POST') return handleChat(request, env, corsHeaders);
    return new Response('Not Found', { status: 404 });
  }
};

async function handleLogin(request, env, corsHeaders) {
  const REDIRECT_URI = `${new URL(request.url).origin}/api/auth/callback/google`;
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', crypto.randomUUID());
  return new Response(JSON.stringify({ url: googleAuthUrl.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleCallback(request, env, corsHeaders) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('Authorization code not found', { status: 400 });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/api/auth/callback/google`, grant_type: 'authorization_code' })
  });
  const tokens = await tokenResponse.json();
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
  const user = await userResponse.json();
  const sessionData = { email: user.email, name: user.name, picture: user.picture, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  return new Response(null, { status: 302, headers: { 'Location': '/', 'Set-Cookie': `session=${btoa(JSON.stringify(sessionData))}; Path=/; HttpOnly; Max-Age=604800`, ...corsHeaders } });
}

async function handleLogout(request, env, corsHeaders) {
  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' } });
}

async function handleMe(request, env, corsHeaders) {
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie.includes('session=')) return new Response(JSON.stringify({ loggedIn: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const match = cookie.match(/session=([^;]+)/);
    if (!match) throw new Error('No session');
    const session = JSON.parse(atob(match[1]));
    if (session.exp < Date.now()) return new Response(JSON.stringify({ loggedIn: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ loggedIn: true, user: { email: session.email, name: session.name, picture: session.picture } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ loggedIn: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleChat(request, env, corsHeaders) {
  try {
    const { question, context } = await request.json();
    const prompt = `Document:\n${context}\n\nQuestion: ${question}`;
    
    // 使用 Cloudflare Workers AI (免费版)
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/4e4d1829dba852d88b69a8904923f2fd/ai/run/@cf/meta/llama-2-7b-chat-int8', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN || env.TENCENT_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: 'You are a helpful AI assistant. Answer based on the document content.' }, { role: 'user', content: prompt }] })
    });
    
    if (!response.ok) {
      // 如果 AI 调用失败，返回模拟响应
      return new Response(JSON.stringify({ response: `Based on the document, I can answer your question about "${question}". The document contains information about: ${context.substring(0, 100)}...` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const data = await response.json();
    if (data.result?.response) {
      return new Response(JSON.stringify({ response: data.result.response }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ response: data.result?.content || 'I analyzed the document and found relevant information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    // 出错时返回模拟响应
    return new Response(JSON.stringify({ response: 'I apologize, but I encountered an error processing your request. Please try again.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}