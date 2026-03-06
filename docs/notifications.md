# Real-Time Notifications

After authentication, the server automatically subscribes your wallet to real-time push events via the MCP notification channel.

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
| `convId` | Conversation ID (null for new contact requests) |
| `sender` | Wallet address of the sender |
| `preview` | First 100 characters of the message |
| `seq` | Message sequence number (null for contact requests) |
| `isNewConversation` | `true` if this is a new contact request |
| `timestamp` | ISO 8601 timestamp |
