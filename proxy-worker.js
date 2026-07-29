/**
 * Cloudflare Worker 代理：把浏览器请求转发到智谱 / OpenAI 兼容 API，解决 CORS。
 *
 * 部署步骤：
 * 1. 登录 https://dash.cloudflare.com → Workers & Pages → Create Worker。
 * 2. 粘贴本脚本，Save & Deploy。
 * 3. 得到类似 https://your-worker.your-subdomain.workers.dev 的域名。
 * 4. 在 InsightLoop 的「AI 模型设置」里：
 *    - API Base URL: https://open.bigmodel.cn/api/paas/v4
 *    - 模型名: glm-4-flash
 *    - API Key: 你的智谱 Key
 *    - 代理地址: https://your-worker.your-subdomain.workers.dev/v1
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 只代理 /v1/* 路径
    if (!url.pathname.startsWith('/v1/')) {
      return new Response('InsightLoop CORS Proxy: use /v1/chat/completions', { status: 404 });
    }

    // 目标 API：从请求头或默认使用智谱 OpenAI 兼容端点
    const targetBase = request.headers.get('x-target-base') || 'https://open.bigmodel.cn/api/paas/v4';
    const targetUrl = targetBase.replace(/\/+$/, '') + url.pathname + url.search;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
      // 透传常用头部，避免 CORS 预检问题
      if (['authorization', 'content-type', 'x-target-base'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = request.body;
    }

    try {
      const resp = await fetch(targetUrl, {
        method: request.method,
        headers,
        body,
        // Cloudflare Worker 到源站不受浏览器 CORS 限制
      });

      const responseHeaders = new Headers(resp.headers);
      // 允许任意前端域名访问
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Target-Base');
      responseHeaders.set('Access-Control-Max-Age', '86400');

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: 'Proxy fetch failed: ' + e.message } }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
