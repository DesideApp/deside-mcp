# Real-Time Notifications

After successful authentication, the MCP session is automatically subscribed to real-time events for your wallet. No additional setup is needed.

---

## notifications/dm_received

Fired when a new DM arrives or a new contact request is received.

```json
{
  "method": "notifications/dm_received",
  "params": {
    "convId": "WalletA:WalletB",
    "sender": "SenderWallet...",
    "preview": "First 100 chars of the message...",
    "seq": 42,
    "isNewConversation": false,
    "timestamp": "2026-03-04T12:00:00.000Z"
  }
}
```

| Field | Description |
|---|---|
| `convId` | Conversation ID. `null` for new contact requests (no conversation exists yet until the request is accepted) |
| `sender` | Solana wallet address of the sender |
| `preview` | First 100 characters of the message |
| `seq` | Message sequence number (null for contact requests) |
| `isNewConversation` | `true` if this is a new contact request |
| `timestamp` | ISO 8601 timestamp |
