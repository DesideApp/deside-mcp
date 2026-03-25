# Mini Agent (Deside MCP)

Minimal client example for connecting an agent wallet to a Deside MCP endpoint.

This example is client-side only. It does not configure the MCP server. It connects to an MCP endpoint through OAuth 2.0 + PKCE and calls a few MCP tools.

## What it does

1. `initialize` MCP session.
2. Authenticate via OAuth 2.0 + PKCE:
   `/oauth/register -> /oauth/authorize -> /oauth/wallet-challenge -> /oauth/token`
3. Call `get_my_identity`.
4. Call `list_conversations`.
5. If `TO_WALLET` is set, call `send_dm`.
6. Optional: wait for MCP notification `notifications/dm_received` when `WATCH_PUSH=1`.

This example is intentionally minimal. It is the canonical public MCP hello-world flow, not a long-running production agent.

## Run

`MCP_BASE_URL` points to the MCP endpoint you want to test, local or production.

From repo root:

```bash
cp deside-mcp/examples/mini-agent/.env.example deside-mcp/examples/mini-agent/.env
set -a; source deside-mcp/examples/mini-agent/.env; set +a
node deside-mcp/examples/mini-agent/mini-agent.js
```

Or from `deside-mcp/`:

```bash
cp examples/mini-agent/.env.example examples/mini-agent/.env
set -a; source examples/mini-agent/.env; set +a
node examples/mini-agent/mini-agent.js
```

## Notes

- If `AGENT_SECRET_KEY_B58` is not set, the script creates an ephemeral wallet and prints it.
- Authentication uses OAuth 2.0 + PKCE automatically.
- The `.env.example` file configures this example client, not the MCP server.
- For deterministic tests, set:
  - `AGENT_SECRET_KEY_B58`
  - `TO_WALLET`
  - `OAUTH_SCOPE`
  - `OAUTH_CLIENT_NAME`
  - `WATCH_PUSH=1` if you want to wait for a notification
