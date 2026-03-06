import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomUUID } from 'node:crypto';

const ENV = {
  mcpBaseUrl: (process.env.MCP_BASE_URL || 'http://localhost:3100').replace(/\/+$/, ''),
  mcpPath: process.env.MCP_PATH || '/mcp',
  authMode: (process.env.AUTH_MODE || 'legacy').toLowerCase(),
  authLoginPath: process.env.AUTH_LOGIN_PATH || '/auth/login',
  authDomain: process.env.AUTH_DOMAIN || null,
  toWallet: process.env.TO_WALLET || null,
  text: process.env.TEXT || `Hello from deside mini-agent @ ${new Date().toISOString()}`,
  listLimit: Number.parseInt(process.env.LIST_LIMIT || '20', 10),
  readLimit: Number.parseInt(process.env.READ_LIMIT || '20', 10),
  watchPush: process.env.WATCH_PUSH === '1',
  pushTimeoutMs: Number.parseInt(process.env.PUSH_TIMEOUT_MS || '15000', 10),
  oauthScope: process.env.OAUTH_SCOPE || 'dm:read dm:write',
  oauthClientName: process.env.OAUTH_CLIENT_NAME || 'deside-mini-agent',
  oauthRedirectUri: process.env.OAUTH_REDIRECT_URI || null,
  agentSecretKeyB58: process.env.AGENT_SECRET_KEY_B58 || null,
};

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  if (details !== undefined) error.details = details;
  throw error;
}

function decodeAgentKeypair(secretKeyB58) {
  const bytes = bs58.decode(secretKeyB58);
  if (bytes.length === 64) return nacl.sign.keyPair.fromSecretKey(bytes);
  if (bytes.length === 32) return nacl.sign.keyPair.fromSeed(bytes);
  throw new Error('AGENT_SECRET_KEY_B58 must decode to 32-byte seed or 64-byte secret key');
}

function createAgent() {
  const keypair = ENV.agentSecretKeyB58
    ? decodeAgentKeypair(ENV.agentSecretKeyB58)
    : nacl.sign.keyPair();
  const wallet = bs58.encode(keypair.publicKey);
  return { keypair, wallet, ephemeral: !ENV.agentSecretKeyB58 };
}

function signMessage(message, keypair) {
  const bytes = new TextEncoder().encode(message);
  return bs58.encode(nacl.sign.detached(bytes, keypair.secretKey));
}

async function httpJson(url, { method = 'GET', headers = {}, body, redirect = 'follow', signal } = {}) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect,
    signal,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, headers: response.headers, data };
}

function parseMcpEnvelope(payload) {
  if (payload && typeof payload === 'object') return payload;
  if (typeof payload !== 'string' || !payload.startsWith('event: message')) return null;
  const marker = 'data: ';
  const index = payload.indexOf(marker);
  if (index < 0) return null;
  try {
    return JSON.parse(payload.slice(index + marker.length).trim());
  } catch {
    return null;
  }
}

function parseToolResult(jsonRpc) {
  const result = jsonRpc?.result;
  if (!result) return { ok: false, error: jsonRpc?.error || { message: 'missing_result' } };

  if (result.isError) {
    if (Array.isArray(result.content)) {
      const textPart = result.content.find((part) => part?.type === 'text' && typeof part.text === 'string');
      if (textPart?.text) {
        try {
          return { ok: false, error: JSON.parse(textPart.text) };
        } catch {
          return { ok: false, error: { message: textPart.text } };
        }
      }
    }
    return { ok: false, error: { message: 'tool_error_without_payload' } };
  }

  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return { ok: true, data: result.structuredContent };
  }
  if (typeof result === 'object') return { ok: true, data: result };
  return { ok: false, error: { message: 'unsupported_tool_result_shape' } };
}

async function mcpRpc({ sessionId, bearerToken, method, params, id }) {
  const payload = { jsonrpc: '2.0', method };
  if (params !== undefined) payload.params = params;
  if (id !== undefined) payload.id = id;

  const response = await httpJson(`${ENV.mcpBaseUrl}${ENV.mcpPath}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: payload,
  });

  return {
    status: response.status,
    sessionId: response.headers.get('mcp-session-id') || sessionId || null,
    jsonRpc: parseMcpEnvelope(response.data),
    raw: response.data,
  };
}

async function initializeSession() {
  const initialize = await mcpRpc({
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'deside-mini-agent', version: '1.0.0' },
    },
  });

  const sessionId = initialize.sessionId;
  assert(sessionId, 'initialize_failed_missing_mcp_session_id', initialize.raw);
  await mcpRpc({ sessionId, method: 'notifications/initialized' });
  return sessionId;
}

function buildPkceChallenge(verifier) {
  return globalThis.crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(verifier))
    .then((hash) => Buffer.from(hash).toString('base64'))
    .then((base64) => base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
}

async function authLegacy({ sessionId, agent }) {
  const nonceRes = await httpJson(`${ENV.mcpBaseUrl}/auth/nonce`);
  assert(nonceRes.status === 200, 'auth_nonce_failed', nonceRes.data);
  const nonce = nonceRes.data?.nonce;
  assert(typeof nonce === 'string' && nonce.length > 0, 'auth_nonce_missing', nonceRes.data);
  const domain = nonceRes.data?.domain || ENV.authDomain || ENV.mcpBaseUrl;
  const message = `Domain: ${domain}\nNonce: ${nonce}`;
  const signature = signMessage(message, agent.keypair);

  const loginRes = await httpJson(`${ENV.mcpBaseUrl}${ENV.authLoginPath}`, {
    method: 'POST',
    headers: { 'mcp-session-id': sessionId },
    body: {
      wallet: agent.wallet,
      signature,
      message,
    },
  });
  assert(loginRes.status === 200, 'legacy_login_failed', loginRes.data);
  return { mode: 'legacy', accessToken: null, refreshToken: null };
}

async function authOAuth({ agent }) {
  const now = Date.now();
  const redirectUri = ENV.oauthRedirectUri || `${ENV.mcpBaseUrl}/mini-agent/callback`;

  const registerRes = await httpJson(`${ENV.mcpBaseUrl}/oauth/register`, {
    method: 'POST',
    body: {
      client_name: `${ENV.oauthClientName}-${now}`,
      redirect_uris: [redirectUri],
      scope: ENV.oauthScope,
    },
  });
  assert(registerRes.status === 200, 'oauth_register_failed', registerRes.data);
  const clientId = registerRes.data?.client_id;
  assert(typeof clientId === 'string' && clientId.length > 0, 'oauth_missing_client_id', registerRes.data);

  const state = randomUUID();
  const verifier = `mini-agent-verifier-${randomUUID()}`;
  const challenge = await buildPkceChallenge(verifier);
  const authorizeUrl = new URL('/oauth/authorize', ENV.mcpBaseUrl);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('scope', ENV.oauthScope);
  authorizeUrl.searchParams.set('state', state);

  const authorizeRes = await httpJson(authorizeUrl.toString(), { method: 'GET', redirect: 'manual' });
  assert(authorizeRes.status === 302, 'oauth_authorize_failed', authorizeRes.data);
  const challengeUrl = authorizeRes.headers.get('location');
  assert(challengeUrl, 'oauth_authorize_missing_challenge_redirect');

  const walletChallengeGetRes = await httpJson(challengeUrl, { method: 'GET', redirect: 'manual' });
  assert(walletChallengeGetRes.status === 200, 'oauth_wallet_challenge_get_failed', walletChallengeGetRes.data);
  const nonce = walletChallengeGetRes.data?.nonce;
  const domain = walletChallengeGetRes.data?.domain;
  const challengeState = walletChallengeGetRes.data?.state || state;
  assert(nonce && domain, 'oauth_wallet_challenge_missing_nonce_or_domain', walletChallengeGetRes.data);

  const signedMessage = `Domain: ${domain}\nNonce: ${nonce}`;
  const signature = signMessage(signedMessage, agent.keypair);

  const walletChallengePostRes = await httpJson(`${ENV.mcpBaseUrl}/oauth/wallet-challenge`, {
    method: 'POST',
    redirect: 'manual',
    body: {
      wallet: agent.wallet,
      signature,
      message: signedMessage,
      state: challengeState,
    },
  });
  assert(walletChallengePostRes.status === 302, 'oauth_wallet_challenge_post_failed', walletChallengePostRes.data);
  const codeRedirect = walletChallengePostRes.headers.get('location');
  assert(codeRedirect, 'oauth_wallet_challenge_missing_code_redirect');

  const code = new URL(codeRedirect).searchParams.get('code');
  assert(code, 'oauth_missing_authorization_code', { codeRedirect });

  const tokenRes = await httpJson(`${ENV.mcpBaseUrl}/oauth/token`, {
    method: 'POST',
    body: {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    },
  });
  assert(tokenRes.status === 200, 'oauth_token_failed', tokenRes.data);
  assert(tokenRes.data?.access_token, 'oauth_missing_access_token', tokenRes.data);

  return {
    mode: 'oauth',
    accessToken: tokenRes.data.access_token,
    refreshToken: tokenRes.data.refresh_token || null,
    clientId,
  };
}

async function callTool({ sessionId, bearerToken, name, args, id }) {
  const rpc = await mcpRpc({
    sessionId,
    bearerToken,
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return parseToolResult(rpc.jsonRpc);
}

async function waitForPushNotification({ sessionId, bearerToken, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENV.mcpBaseUrl}${ENV.mcpPath}`, {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        'mcp-session-id': sessionId,
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
      },
      signal: controller.signal,
    });
    assert(res.ok, 'push_sse_open_failed', { status: res.status });
    assert(res.body, 'push_sse_missing_body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const lines = block.split('\n');
        let eventType = 'message';
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (eventType !== 'message' || dataLines.length === 0) continue;
        let payload = null;
        try {
          payload = JSON.parse(dataLines.join('\n'));
        } catch {
          continue;
        }
        if (payload?.method === 'notifications/dm_received') {
          return payload.params || null;
        }
      }
    }
    return null;
  } catch (error) {
    if (error?.name === 'AbortError') return null;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const agent = createAgent();
  console.log(`[mini-agent] wallet=${agent.wallet} ephemeral=${agent.ephemeral}`);
  console.log(`[mini-agent] mcp=${ENV.mcpBaseUrl}${ENV.mcpPath} authMode=${ENV.authMode}`);

  const sessionId = await initializeSession();
  let authResult = null;
  if (ENV.authMode === 'oauth') {
    authResult = await authOAuth({ agent });
  } else {
    authResult = await authLegacy({ sessionId, agent });
  }

  const bearerToken = authResult.accessToken || null;
  const summary = {
    sessionId,
    authMode: authResult.mode,
    wallet: agent.wallet,
    send: null,
    conversations: null,
    read: null,
    push: null,
  };

  const list = await callTool({
    sessionId,
    bearerToken,
    name: 'list_conversations',
    args: { limit: ENV.listLimit },
    id: 2,
  });
  assert(list.ok, 'list_conversations_failed', list.error);
  summary.conversations = Array.isArray(list.data?.conversations)
    ? list.data.conversations.length
    : 0;

  if (ENV.toWallet) {
    const send = await callTool({
      sessionId,
      bearerToken,
      name: 'send_dm',
      args: { to_wallet: ENV.toWallet, text: ENV.text },
      id: 3,
    });
    assert(send.ok, 'send_dm_failed', send.error);
    summary.send = send.data || null;

    const convId = send.data?.convId;
    if (typeof convId === 'string' && convId.length > 0) {
      const read = await callTool({
        sessionId,
        bearerToken,
        name: 'read_dms',
        args: { conv_id: convId, limit: ENV.readLimit },
        id: 4,
      });
      assert(read.ok, 'read_dms_failed', read.error);
      summary.read = Array.isArray(read.data?.messages) ? read.data.messages.length : 0;
    }
  } else {
    console.log('[mini-agent] TO_WALLET not set; skipping send_dm/read_dms');
  }

  if (ENV.watchPush) {
    console.log(`[mini-agent] waiting push notifications/dm_received for up to ${ENV.pushTimeoutMs}ms`);
    summary.push = await waitForPushNotification({
      sessionId,
      bearerToken,
      timeoutMs: ENV.pushTimeoutMs,
    });
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

main().catch((error) => {
  const details = error?.details ? ` details=${JSON.stringify(error.details)}` : '';
  console.error(`[mini-agent] ERROR ${error?.message || String(error)}${details}`);
  process.exit(1);
});
