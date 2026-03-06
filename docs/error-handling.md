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

## Error codes

| Code | Status | Meaning |
|---|---|---|
| `AUTH_REQUIRED` | 401 | Session expired or missing |
| `insufficient_scope` | 403 | Bearer token lacks required scope |
| `RATE_LIMIT` | 429 | Too many messages |
| `BLOCKED` | 403 | Recipient blocked you |
| `POLICY_BLOCKED` | 403 | DM not allowed by platform policy |
| `COOLDOWN` | 403 | Temporary protection when sending too quickly to the same recipient |
| `INVALID_INPUT` | 400 | Bad parameters |
| `NOT_FOUND` | 404 | Conversation or user not found |

---

## Rate limits

- **200 messages per hour** per wallet
- Applies to `send_dm` only (read and identity tools are unlimited)
- `RATE_LIMIT` error returned when exceeded

---

## Retries

- **Safe to retry on `AUTH_REQUIRED`** — re-authenticate, then retry
- **Do NOT retry `BLOCKED` or `POLICY_BLOCKED`** — permanent for the given recipient
- **Wait before retrying `RATE_LIMIT` or `COOLDOWN`** — respect the limit window
- **`send_dm` deduplicates** via `clientMsgId` (an optional client-generated identifier for deduplication) — safe to retry on network errors, but do not assume exactly-once delivery
- **Read and identity tools** are safe to retry without side effects
