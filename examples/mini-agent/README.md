# Mini Agent (Deside MCP)

Small script to test an agent flow against Deside MCP with a real wallet signature.

## What it does

1. `initialize` MCP session.
2. Authenticate with:
   - `AUTH_MODE=legacy` via `/auth/nonce` + `/auth/login`, or
   - `AUTH_MODE=oauth` via `/oauth/register -> /oauth/authorize -> /oauth/wallet-challenge -> /oauth/token`.
3. Call `list_conversations`.
4. If `TO_WALLET` is set, call `send_dm` and `read_dms`.
5. Optional: wait SSE push (`notifications/dm_received`) when `WATCH_PUSH=1`.

## Run

From repo root:

```bash
cp mcp-server/examples/mini-agent/.env.example mcp-server/examples/mini-agent/.env
set -a; source mcp-server/examples/mini-agent/.env; set +a
npm run mcp:mini-agent
```

Or from `mcp-server/`:

```bash
cp examples/mini-agent/.env.example examples/mini-agent/.env
set -a; source examples/mini-agent/.env; set +a
npm run example:mini-agent
```

## Notes

- If `AGENT_SECRET_KEY_B58` is not set, the script creates an ephemeral wallet and prints it.
- For deterministic tests, set:
  - `AGENT_SECRET_KEY_B58`
  - `TO_WALLET`
  - `AUTH_MODE=oauth` (recommended for standard flow)
