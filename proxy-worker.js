/**
 * Cloudflare Worker —— 密钥托管后端（key-custody backend）
 *
 * 与旧版"转发代理"的区别：
 *   - 旧版：浏览器把自己的 API Key 发到 Worker，Worker 原样转发给智谱（Key 仍在浏览器里）。
 *   - 新版：Worker 自己持有智谱 Key（存为 Worker Secret），浏览器**只发送对话内容、不发 Key**。
 *           Key 永远不会离开 Cloudflare，也不进用户浏览器 / localStorage。
 *
 * 部署步骤：
 * 1. 登录 https://dash.cloudflare.com → Workers & Pages → 你的 Worker → Settings → Variables。
 * 2. 添加一个 Secret（不是普通变量）：名称 `ZHIPU_API_KEY`，值 = 你的智谱 API Key。
 * 3. 把本脚本粘贴进 Code 编辑器，Save & Deploy。
 * 4. 在 InsightLoop「AI 模型设置」里：
 *    - 代理地址（后端地址）：https://你的worker.workers.dev/v1
 *    - API Key：可留空（后端托管）；若想继续用转发代理模式，也可填，但会被忽略。
 *    - 使用真实模型：勾选
 *
 * 说明：浏览器仍需要能访问到这个 Worker 域名。若 workers.dev 在你网络下被墙，
 *       请给 Worker 绑定你自己的域名（Custom Domain），代码无需改动。
 */

const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

function cors(resp) {
  const h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 健康检查 / 探活
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('InsightLoop key-custody backend OK', { status: 200 });
    }

    // 预检
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    // 仅处理聊天补全路径
    if (url.pathname !== '/v1/chat/completions') {
      return cors(new Response('use POST /v1/chat/completions', { status: 404 }));
    }

    if (request.method !== 'POST') {
      return cors(new Response('POST only', { status: 405 }));
    }

    // 读取浏览器发来的请求体（不含任何 Key）
    let incoming;
    try {
      incoming = await request.json();
    } catch (e) {
      return cors(new Response(JSON.stringify({ error: { message: 'invalid JSON body' } }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      }));
    }

    const upstreamBody = {
      model: incoming.model || 'glm-4-flash',
      messages: Array.isArray(incoming.messages) ? incoming.messages : [],
      temperature: typeof incoming.temperature === 'number' ? incoming.temperature : 0.7,
      response_format: incoming.response_format || { type: 'json_object' },
    };

    // 用 Worker 自己保存的 Key 调用智谱（服务器对服务器，无 CORS 限制）
    try {
      const resp = await fetch(ZHIPU_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (env.ZHIPU_API_KEY || ''),
        },
        body: JSON.stringify(upstreamBody),
      });

      // 若未配置 Key，提前给出明确提示
      if (!env.ZHIPU_API_KEY && resp.status === 401) {
        return cors(new Response(JSON.stringify({ error: { message: 'Worker 未配置 ZHIPU_API_KEY 密钥，请在 Cloudflare Worker Settings → Variables 添加 Secret。' } }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        }));
      }

      return cors(new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      }));
    } catch (e) {
      return cors(new Response(JSON.stringify({ error: { message: 'upstream failed: ' + e.message } }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      }));
    }
  },
};
