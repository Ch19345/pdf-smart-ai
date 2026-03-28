// Cloudflare Pages Functions
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // API route
  if (url.pathname === '/api/chat' && request.method === 'POST') {
    return handleChat(request, env);
  }

  // Serve static files
  return context.next();
}

async function handleChat(request, env) {
  // Get credentials from environment variables (set in Cloudflare dashboard)
  const TENCENT_SECRET_ID = env.TENCENT_SECRET_ID;
  const TENCENT_SECRET_KEY = env.TENCENT_SECRET_KEY;
  const HUNYUAN_ENDPOINT = "hunyuan.tencentcloudapi.com";

  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
    return new Response(JSON.stringify({ 
      error: "API credentials not configured. Please set TENCENT_SECRET_ID and TENCENT_SECRET_KEY in Cloudflare Pages environment variables." 
    }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { question, context } = await request.json();
    
    const payload = JSON.stringify({
      Model: "hunyuan-lite",
      Messages: [
        { Role: "system", Content: "You are a helpful AI assistant. Answer based on the document content." },
        { Role: "user", Content: `Document:\n${context}\n\nQuestion: ${question}` }
      ],
      Temperature: 0.7,
      MaxTokens: 1024
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const authorization = await generateSignature(TENCENT_SECRET_ID, TENCENT_SECRET_KEY, "ChatCompletions", payload);

    const response = await fetch(`https://${HUNYUAN_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': HUNYUAN_ENDPOINT,
        'X-TC-Version': '2023-09-01',
        'X-TC-Action': 'ChatCompletions',
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': 'ap-guangzhou',
        'Authorization': authorization
      },
      body: payload
    });

    const data = await response.json();
    
    if (data.Response?.Choices?.[0]?.Message?.Content) {
      return new Response(JSON.stringify({ response: data.Response.Choices[0].Message.Content }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: data.Response?.Error?.Message || 'Unknown error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function generateSignature(secretId, secretKey, action, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const service = "hunyuan";
  
  const canonicalHeaders = `content-type:application/json\nhost:${HUNYUAN_ENDPOINT}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedPayload = await sha256(payload);
  
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${timestamp}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
  
  const secretDate = await hmacSHA256(`TC3${secretKey}`, String(timestamp).slice(0, 8));
  const secretService = await hmacSHA256(secretDate, service);
  const secretSigning = await hmacSHA256(secretService, "tc3_request");
  const signature = await hmacSHA256Hex(secretSigning, stringToSign);
  
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function sha256(data) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSHA256(key, msg) {
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await cryptoKey.sign(new TextEncoder().encode(msg));
}

async function hmacSHA256Hex(key, msg) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await cryptoKey.sign(new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
