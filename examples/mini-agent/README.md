# Mini Agent (Deside MCP)

Minimal client example for connecting a wallet to a Deside MCP endpoint.

This example is client-side only. It does not configure the MCP server. It connects to an MCP endpoint through OAuth 2.0 + PKCE and calls a few MCP tools.

## What it does

1. `initialize` MCP session.
2. Authenticate via OAuth 2.0 + PKCE:
   `/oauth/register -> /oauth/authorize -> /oauth/wallet-challenge -> /oauth/token`
3. Call `get_my_identity`.
4. Call `list_conversations`.
5. If `TO_WALLET` is set, call `send_dm` and `read_dms`.
6. Optional: when `MINI_AGENT_LLM_FREE=1`, run `read_dms -> llm_complete(free) -> send_dm`.
7. Optional: wait for MCP notification `notifications/dm_received` when `WATCH_PUSH=1`.

This example is intentionally minimal. It is the canonical public MCP hello-world flow, not a long-running production agent.

For agent identity tests, set `AGENT_SECRET_KEY_B58` to the owner/control wallet
for the registered agent identity. If the script generates an ephemeral wallet,
that wallet can authenticate and test messaging mechanics, but Deside will not
recognize it as your registered agent identity.

## Run

`MCP_BASE_URL` is the server origin and `MCP_PATH` is the MCP route.

Examples:

- local: `MCP_BASE_URL=http://localhost:3100` and `MCP_PATH=/mcp`
- production: `MCP_BASE_URL=https://mcp.deside.io` and `MCP_PATH=/mcp`

From repo root:

```bash
npm install --prefix mcp/examples/mini-agent
cp mcp/examples/mini-agent/.env.example mcp/examples/mini-agent/.env
set -a; source mcp/examples/mini-agent/.env; set +a
npm --prefix mcp/examples/mini-agent start
```

Or from `mcp/`:

```bash
npm install --prefix examples/mini-agent
cp examples/mini-agent/.env.example examples/mini-agent/.env
set -a; source examples/mini-agent/.env; set +a
npm --prefix examples/mini-agent start
```

## Notes

- If `AGENT_SECRET_KEY_B58` is not set, the script creates an ephemeral wallet and prints it.
- For agent identity recognition, `AGENT_SECRET_KEY_B58` must belong to the owner/control wallet for the registered agent identity.
- Authentication uses OAuth 2.0 + PKCE automatically.
- OAuth authentication alone does not create a registered Deside user profile for that wallet.
- If you want to receive DMs from the Deside app/front or behave as a normal registered participant, use a wallet that is already onboarded in Deside.
- The `.env.example` file configures this example client, not the MCP server.
- The mini-agent example has its own `package.json` for local example dependencies; it is not the public Deside SDK package.
- For the optional free LLM loop, set `MINI_AGENT_LLM_FREE=1`, set `TO_WALLET`, and include `llm:invoke` in `OAUTH_SCOPE`.
- For deterministic tests, set:
  - `AGENT_SECRET_KEY_B58`
  - `TO_WALLET`
  - `OAUTH_SCOPE`
  - `OAUTH_CLIENT_NAME`
  - `WATCH_PUSH=1` if you want to wait for a notification

## Optional LLM Loop

The free LLM loop demonstrates the full DM agent path:

```text
read_dms -> llm_complete(free) -> send_dm
```

Example:

```bash
MINI_AGENT_LLM_FREE=1 \
OAUTH_SCOPE="dm:read dm:write llm:invoke" \
TO_WALLET=<recipient-wallet> \
npm --prefix mcp/examples/mini-agent start
```

The `free` tier does not require x402 payment. Paid tiers are documented in [`../../docs/payments.md`](../../docs/payments.md).
