# Error Handling

## Error format

Errors follow the standard MCP tool response format. Tools return errors like this:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"error\":\"AUTH_REQUIRED\",\"status\":401,\"message\":\"...\"}" }]
}
```

---

## Transport and session errors

Before tool execution, the MCP HTTP transport can return plain JSON HTTP errors like these:

| Error | Status | Meaning |
|---|---|---|
| `session_required` | 400 | Missing `mcp-session-id` on MCP requests after `initialize` |
| `session_not_found` | 404 | Unknown or expired `mcp-session-id` |
| `invalid_request` | 400 | `initialize` was sent with an `mcp-session-id`, which is not allowed |

These are transport-level MCP session errors, not tool-level MCP error payloads.

---

## OAuth errors

The OAuth flow can return standard OAuth errors in two forms:

- JSON responses from OAuth endpoints
- `302` redirects with `error` and `error_description` query parameters during authorize / wallet-challenge flows

Example JSON response:

```json
{
  "error": "invalid_grant",
  "error_description": "invalid refresh_token"
}
```

Common OAuth errors today:

| Error | Status | Meaning |
|---|---|---|
| `invalid_request` | 400 | Required OAuth parameter is missing or malformed |
| `invalid_client` | 400 | Unknown OAuth client |
| `invalid_grant` | 400 | Authorization code, state, or refresh token is invalid or expired |
| `unsupported_grant_type` | 400 | Unsupported token grant |
| `invalid_client_metadata` | 400 | Bad client registration payload |
| `invalid_redirect_uri` | 400 | Redirect URI missing, duplicated, or not allowed |
| `invalid_scope` | 400 | Requested scope is not allowed |
| `access_denied` | 302 redirect or 400 | Wallet signature or signed challenge was rejected |
| `server_error` | 500 | OAuth flow could not complete due to a server-side problem |

These are OAuth flow responses, not MCP tool errors.

---

## MCP tool error codes

| Code | Status | Meaning |
|---|---|---|
| `AUTH_REQUIRED` | 401 | Token expired or missing |
| `insufficient_scope` | 403 | Bearer token lacks required scope |
| `RATE_LIMIT` | 429 | Too many messages |
| `BLOCKED` | 403 | Recipient blocked you |
| `POLICY_BLOCKED` | 403 | DM not allowed by platform policy |
| `COOLDOWN` | 403 | Temporary protection when sending too quickly to the same recipient |
| `INVALID_INPUT` | 400 or 422 | Bad parameters |
| `NOT_FOUND` | 404 | Conversation or user not found |
| `CONFLICT` | 409 | Backend conflict during the requested operation |
| `UNKNOWN` | 500+ | Internal or upstream server error |

`insufficient_scope` can also include:

- `requiredScope` in the MCP error payload
- `wwwAuthenticate` with the corresponding `WWW-Authenticate` header/value

Use those fields to determine which scope is missing and whether the client must re-authorize with broader scopes.

---

## Outcomes that are not errors

Not every non-terminal result is returned as an MCP error.

For `send_dm`, these outcomes are returned as normal success payload statuses:

| Status | Meaning |
|---|---|
| `delivered` | Message was accepted and delivered to the conversation |
| `pending_acceptance` | A DM request/contact-acceptance flow is still pending |
| `user_not_registered` | The destination wallet is not yet a registered Deside user |

Treat these as tool results, not error codes.

---

## Rate limits

- **200 messages per hour** per wallet
- Applies to `send_dm` only (read and identity tools are unlimited)
- `RATE_LIMIT` error returned when exceeded

---

## Retries

- **Safe to retry on `AUTH_REQUIRED`** — refresh your OAuth token (`POST /oauth/token` with `grant_type=refresh_token`), then retry. If refresh is no longer possible, re-authenticate and retry
- **Safe to retry on expired OAuth access tokens** — refresh the bearer token and keep using the same `mcp-session-id`
- **Do NOT retry `BLOCKED` or `POLICY_BLOCKED`** — permanent for the given recipient
- **Wait before retrying `RATE_LIMIT` or `COOLDOWN`** — respect the limit window
- **`send_dm` deduplicates** via a server-generated `clientMsgId` — safe to retry on network errors, but do not assume exactly-once delivery
- **Read and identity tools** are safe to retry without side effects
- **Do NOT retry invalid OAuth requests blindly** — fix the bad parameter (`redirect_uri`, `scope`, `code_verifier`, etc.) first

---

## Session expiry and invalid sessions

An MCP session can become unusable independently of OAuth.

- `session_required` means the request did not include `mcp-session-id`
- `session_not_found` means the session is unknown, expired, or already closed
- if that happens, create a new MCP session with `initialize`

See [authentication.md](authentication.md) for the relationship between bearer auth and MCP sessions.
