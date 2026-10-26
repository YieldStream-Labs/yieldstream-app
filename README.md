# YieldStream Application Layer

[![Stellar Protocol](https://img.shields.io/badge/Stellar-Protocol%2022%2F25-blue)](https://stellar.org)
[![Next.js](https://img.shields.io/badge/Next.js-14%20(App%20Router)-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

**YieldStream Application Layer** is the multi-package TypeScript monorepo providing end-to-end tooling, indexing, verification, and interactive user interfaces for the YieldStream multi-tenant Merkle dividend distributor on Stellar (Soroban).

---

## Monorepo Architecture

```text
yieldstream-app/
├── package.json (npm workspaces)
├── tsconfig.base.json (strict TS configuration)
├── packages/
│   ├── merkle/         # TS tree builder & proof generator (byte-exact with Soroban Rust)
│   ├── sdk/            # Soroban contract client wrappers, XDR codecs, simulation helpers
│   └── verifier-cli/   # CLI to audit & recompute root from Horizon/snapshot data
├── apps/
│   └── web/            # Next.js 14 App Router Claim UI & Issuer Dashboard
└── indexer/            # Horizon asset holder snapshot builder with pure BigInt dividend math
```

---

## Packages & Subsystems

### 1. `@yieldstream/merkle`
Byte-exact Merkle tree implementation matching the Soroban smart contract:
- **Leaf Hash**: `sha256(0x00 || u64_be(id) || u32_be(index) || address_xdr || i128_be(amount))`
- **Node Hash**: `sha256(0x01 || min(a,b) || max(a,b))` (lexicographical sorting via `Buffer.compare`)
- **No Floats**: BigInt 16-byte big-endian two's complement conversion.

### 2. `@yieldstream/sdk`
Contract interaction layer wrapping `@stellar/stellar-sdk`:
- Full typed support for `create_distribution`, `claim`, `cancel`, `sweep`, `get_distribution`, and `verify`.
- Automatic simulation, resource footprint preparation, and transaction submission.

### 3. `@yieldstream/indexer`
Snapshot generator for asset holders:
- Connects to Horizon `/accounts?asset=...`.
- Uses pure integer arithmetic: $\text{amount}_i = \lfloor \text{pool} \times \text{balance}_i / \sum \text{balances} \rfloor$.
- Generates canonical JSON snapshots and computes `meta_hash`.

### 4. `@yieldstream/verifier-cli`
Auditing CLI:
- Rebuilds tree from snapshot or Horizon holder records.
- Compares root, leaf count, and metadata hash against the live on-chain contract state.
- Exits with status `0` on match, `1` on mismatch.

### 5. `web` (Next.js 14 App Router)
- **Issuer Dashboard**: Uploads JSON snapshot, inspects allocations, and invokes `create_distribution` via Freighter.
- **Claim UI**: Connects Freighter wallet, matches claimant address, performs read-only `verify` simulation, and executes on-chain claims.

---

## Quickstart

### Build All Workspaces
```bash
npm run build
```

### Run All Test Suites
```bash
npm test
```

### Run Development Web Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the Claim UI and Issuer Dashboard.
