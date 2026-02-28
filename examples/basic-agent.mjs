/**
 * Deside MCP — Basic Agent Example
 *
 * Minimal example: authenticate with a Solana keypair and send a DM.
 *
 * Requirements:
 *   npm install @solana/web3.js tweetnacl bs58
 *
 * Usage:
 *   AGENT_SECRET_KEY=<base58-secret-key> node basic-agent.mjs
 */

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const MCP_BASE = 'https://mcp.deside.io';
const RECIPIENT = 'RecipientWalletPublicKeyHere'; // replace with target wallet

// --- Load keypair from env ---
const secretKey = bs58.decode(process.env.AGENT_SECRET_KEY);
const keypair = Keypair.fromSecretKey(secretKey);
console.log(`Agent wallet: ${keypair.publicKey.toBase58()}`);

// --- Step 1: Initialize MCP session ---
const initRes = await fetch(`${MCP_BASE}/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'basic-agent', version: '1.0.0' }
  }})
});
const sessionId = initRes.headers.get('mcp-session-id');
console.log(`Session: ${sessionId}`);

// --- Step 2: Authenticate ---
// 2a. Get nonce
const { nonce } = await fetch(`${MCP_BASE}/auth/nonce`).then(r => r.json());

// 2b. Sign challenge
const message = `Domain: https://deside.io\nNonce: ${nonce}`;
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
const signatureBase58 = bs58.encode(signature);

// 2c. Login
const loginRes = await fetch(`${MCP_BASE}/auth/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'mcp-session-id': sessionId,
  },
  body: JSON.stringify({
    wallet: keypair.publicKey.toBase58(),
    signature: signatureBase58,
    message,
  }),
});
const loginData = await loginRes.json();
console.log(`Auth: ${loginData.ok ? 'success' : 'failed'}`);

// --- Step 3: Send a DM ---
const sendRes = await fetch(`${MCP_BASE}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'mcp-session-id': sessionId,
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
    name: 'send_dm',
    arguments: {
      to_wallet: RECIPIENT,
      text: 'Hello from my agent!',
    }
  }})
});
const sendData = await sendRes.json();
const result = JSON.parse(sendData.result.content[0].text);
console.log(`DM status: ${result.status}`); // "delivered" or "pending_acceptance"
