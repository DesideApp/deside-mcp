# Payments

> Deprecated mirror. Current page: [`deside-docs/mcp/docs/payments.md`](https://github.com/DesideApp/deside-docs/blob/main/mcp/docs/payments.md).

`llm_complete` paid tiers use x402 for fixed-price, per-call payments.

This is an MCP tool flow, not a plain HTTP paid endpoint. Deside returns a standard x402 V2 `PaymentRequired` object inside the MCP tool error payload, and the client retries the same MCP tool call with a base64 x402 payment payload in the `payment` argument.

## Availability

Paid settlement is feature-gated. Clients should be prepared for paid tiers to return `MODEL_UNAVAILABLE` until the specific tier is enabled in production.

The `free` tier does not require payment.

## Network And Asset

Deside accepts paid `llm_complete` calls with:

| Field | Value |
|---|---|
| Network | Solana mainnet, CAIP-2 `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Asset | USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Scheme | x402 `exact` |
| Pricing | Fixed price per tier, known before payment |

Deside does not use postpaid billing, custodial balances, API credits, or token-metered post-calculation for the MVP.

## Flow

1. The client calls `llm_complete` with a paid tier and no `payment`.
2. Deside checks auth, scope, input, rate limit, and budget caps before asking the wallet to sign anything.
3. Deside returns an MCP tool error with `error: "PAYMENT_REQUIRED"` and a `data` field containing the x402 V2 payment requirements.
4. The client signs a payment payload with an x402-compatible Solana wallet.
5. The client retries the same `llm_complete` call with `payment`.
6. Deside verifies the payment with its facilitator.
7. Deside calls the upstream model provider.
8. If the provider succeeds, Deside settles the payment.
9. Deside returns the completion with `paymentReceipt`.

If the provider fails after payment verification, Deside does not settle the payment. The client receives `PROVIDER_TIMEOUT`, `PROVIDER_ERROR`, or `MODEL_UNAVAILABLE` instead of being charged for a failed completion.

## PAYMENT_REQUIRED Shape

MCP tool errors are returned as MCP tool results with `isError: true`. The text content is JSON.

Example:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "{\"error\":\"PAYMENT_REQUIRED\",\"status\":402,\"message\":\"payment_required\",\"data\":{\"x402Version\":2,\"error\":\"payment required for llm_complete tier cheap\",\"resource\":{\"url\":\"mcp://deside/llm_complete/cheap\",\"description\":\"Deside MCP llm_complete (cheap)\",\"mimeType\":\"application/json\"},\"accepts\":[{\"scheme\":\"exact\",\"network\":\"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp\",\"amount\":\"2000\",\"asset\":\"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\",\"payTo\":\"TreasuryWallet...\",\"maxTimeoutSeconds\":120,\"extra\":{\"feePayer\":\"FacilitatorFeePayer...\",\"memo\":\"llm_quote_nonce\"}}]}}"
    }
  ]
}
```

After parsing `content[0].text`, the useful payload is:

```json
{
  "error": "PAYMENT_REQUIRED",
  "status": 402,
  "message": "payment_required",
  "data": {
    "x402Version": 2,
    "error": "payment required for llm_complete tier cheap",
    "resource": {
      "url": "mcp://deside/llm_complete/cheap",
      "description": "Deside MCP llm_complete (cheap)",
      "mimeType": "application/json"
    },
    "accepts": [
      {
        "scheme": "exact",
        "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        "amount": "2000",
        "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "payTo": "TreasuryWallet...",
        "maxTimeoutSeconds": 120,
        "extra": {
          "feePayer": "FacilitatorFeePayer...",
          "memo": "llm_quote_nonce"
        }
      }
    ]
  }
}
```

Important shape rules:

- `network` is CAIP-2, not plain `solana`.
- `amount` is an atomic unit string with USDC's 6 decimals.
- x402 requirements are carried under `accepts[]`.
- `extra.memo` binds the quote nonce.
- Unknown or expired nonce returns a fresh `PAYMENT_REQUIRED` quote.

## Retrying With Payment

The retry uses the same MCP tool call and same request fields, plus `payment`.

```json
{
  "messages": [
    { "role": "user", "content": "Draft a reply." }
  ],
  "model": "cheap",
  "max_tokens": 256,
  "temperature": 0.7,
  "payment": "base64-x402-payment-payload"
}
```

The `payment` value is Deside's in-band MCP adaptation of x402. The signed payload itself is a standard x402 V2 payment payload; only the transport location differs from the usual HTTP `PAYMENT-SIGNATURE` header.

## TypeScript Sketch

Use the current x402 TypeScript SDK for the exact signer and scheme APIs. At a high level, a paid MCP client does this:

```ts
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import { x402Client } from "@x402/core/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";

const signer = await createKeyPairSignerFromBytes(
  base58.decode(process.env.SVM_PRIVATE_KEY!)
);

const x402 = new x402Client();
x402.register("solana:*", new ExactSvmScheme(signer));

const first = await callMcpTool("llm_complete", {
  model: "cheap",
  messages,
  max_tokens: 256
});

if (first.error === "PAYMENT_REQUIRED") {
  const requirements = first.data;

  // Build and sign a standard x402 V2 PaymentPayload for one entry in
  // requirements.accepts, then base64-encode it for the MCP tool argument.
  // The exact helper name can vary by x402 SDK version.
  const payment = await signX402PaymentPayloadBase64(x402, requirements);

  const paid = await callMcpTool("llm_complete", {
    model: "cheap",
    messages,
    max_tokens: 256,
    payment
  });

  console.log(paid.text, paid.paymentReceipt);
}
```

For HTTP transport examples and current package APIs, use the x402 buyer docs and register Solana support with `@x402/svm`.

## Receipts

Successful paid responses include:

```json
{
  "text": "Completion text",
  "model": "cheap",
  "usage": {
    "inputTokens": 24,
    "outputTokens": 91
  },
  "cost": 0.002,
  "currency": "USDC",
  "paymentReceipt": "settlement-transaction-signature",
  "requestId": "llm_...",
  "finishReason": "stop"
}
```

`paymentReceipt` is `null` for `free`.

## Privacy

Deside does not persist prompts or responses for `llm_complete`.

Prompts and returned completions still pass through Deside-operated infrastructure and upstream model providers to perform inference. Provider terms can apply to that processing. Do not send secrets unless your agent policy allows those providers to process them.

## Error Handling

| Error | Meaning | Client action |
|---|---|---|
| `PAYMENT_REQUIRED` | Paid tier needs a signed x402 payment | Sign the advertised requirement and retry once |
| `PAYMENT_INVALID` | Signature, nonce, amount, asset, network, or receiver is invalid | Request a fresh quote and rebuild the payment |
| `PAYMENT_FAILED` | Settlement failed after provider success | Treat as payment failure and retry with care |
| `BUDGET_EXCEEDED` | Wallet cap would be exceeded | Do not ask the wallet to sign; lower usage or wait |
| `MODEL_UNAVAILABLE` | Tier cannot currently be served | Try another tier or wait |
| `PROVIDER_TIMEOUT` | Provider timed out | Retry later or lower `max_tokens` |
| `PROVIDER_ERROR` | Provider failed | Retry later or use another tier |

Clients should not blindly reuse a signed payment payload after a failed retry. Get a new quote unless Deside explicitly returns a reusable requirement.
