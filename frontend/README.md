# Live Poll — Frontend

React + TypeScript + Vite application serving as the interface for the Stellar Live Poll smart contract.

## Setup

```bash
npm install
npm run dev
```

## Configuration

The dApp connects to the Stellar Testnet. Contract address and RPC endpoint are configured in `src/App.tsx`:

```typescript
const CONTRACT_ID = "CBBADGQAX6F4NGXRKTC2UJ7P46RC6AVOZLK2EWKDR6QVFYSAG2IFXJGB";
const RPC_URL = "https://soroban-testnet.stellar.org:443";
```

## Key Dependencies

| Package | Purpose |
|---|---|
| `@stellar/stellar-sdk` | Soroban RPC client, transaction construction |
| `@creit.tech/stellar-wallets-kit` | Multi-wallet connection (Freighter, Albedo) |
| `buffer`, `process`, `stream-browserify` | Node.js polyfills for browser environment |

## Design

The UI uses a **dark claymorphism** aesthetic built entirely with vanilla CSS — featuring soft pillowy 3D surfaces, warm gradient accents, animated vote bars, and pulsing status orbs. No CSS framework or utility library is used.
