# Contributing to YieldStream

Thank you for your interest in contributing to **YieldStream**! We welcome contributions from developers, researchers, technical writers, and community members participating in the Stellar Wave and ecosystem programs.

This document outlines the development guidelines, local setup, testing procedures, conventional commit standards, and the process for claiming open issues.

---

## Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [Getting Started & Local Development](#getting-started--local-development)
3. [Drips / Stellar Wave: Claiming an Issue](#drips--stellar-wave-claiming-an-issue)
4. [Git Workflow & Commit Standards](#git-workflow--commit-standards)
5. [Pull Request Process](#pull-request-process)
6. [Testing & Quality Assurance](#testing--quality-assurance)

---

## Code of Conduct

We are dedicated to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and collaborative in all discussions, issues, and pull requests.

---

## Getting Started & Local Development

### Prerequisites
- **Node.js**: `v20.0.0` or higher (Node `v22+` recommended)
- **npm**: `v10.0.0` or higher
- **Stellar Wallet**: [Freighter Wallet](https://www.freighter.app/) browser extension configured for Stellar Testnet
- (Optional for contract development) **Rust**: `1.84+` with target `wasm32-unknown-unknown` or `wasm32v1-none`

### 1. Clone the Repository
```bash
git clone https://github.com/YieldStream-Labs/yieldstream-app.git
cd yieldstream-app
```

### 2. Install Dependencies
YieldStream is structured as an npm workspace monorepo. Install all root and package dependencies at once:
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` in the project root to create your local environment file:
```bash
cp .env.example .env.local
```

Ensure the following variables are defined:
```ini
NEXT_PUBLIC_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_RPC_URL="https://soroban-testnet.stellar.org"
NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
HORIZON_URL="https://horizon-testnet.stellar.org"
```

### 4. Build Monorepo Workspaces
Before launching the web app or running scripts, build the dependent TypeScript packages (`@yieldstream/merkle`, `@yieldstream/sdk`, `@yieldstream/indexer`, `@yieldstream/verifier-cli`):
```bash
npm run build
```

### 5. Run the Local Development Server
Launch the Next.js 14 App Router application:
```bash
npm run dev
# or specifically for the web app:
npm run dev --workspace=apps/web
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Run Test Suites
Ensure all unit and integration tests pass across all packages:
```bash
npm test
```

---

## Drips / Stellar Wave: Claiming an Issue

If you are participating in the **Stellar Wave** or ecosystem grant/bounty programs (such as Drips-funded tasks), follow this process to claim an issue:

1. **Browse Open Issues**:
   - Check the [YieldStream App Issues](https://github.com/YieldStream-Labs/yieldstream-app/issues).
   - Look for labels such as `good first issue`, `UI`, `backend`, or `documentation`.
2. **Claiming**:
   - Comment on the issue expressing your intent to work on it (e.g., *"Hi! I'd like to work on this issue for the Stellar Wave. Please assign it to me."*).
   - Wait for a maintainer to assign the issue to you or confirm in the comments before starting major work. This avoids duplicate efforts across contributors.
3. **Draft Pull Requests**:
   - Open a Draft PR early if you want feedback on your architectural direction.
4. **Linking Issues**:
   - In your pull request description, reference the issue using GitHub keywords: `Fixes #<issue-number>` or `Closes #<issue-number>`.
5. **Review & Wave Attestation**:
   - Once your PR is reviewed and merged, the maintainers will attest to your contribution or credit your payout address for the Wave track.

---

## Git Workflow & Commit Standards

We follow a strict **Conventional Commits** specification (`<type>(<scope>): <description>`).

### Commit Types
- `feat`: A new feature (e.g., UI component, SDK method, indexer query)
- `fix`: A bug fix
- `docs`: Documentation changes only (e.g., README, guides, diagrams)
- `chore`: Maintenance tasks, dependency updates, configuration changes
- `test`: Adding or updating test cases
- `refactor`: Code refactoring without behavioral changes
- `perf`: Performance improvements

### Scopes
Use the affected package or workspace name as the scope:
- `(merkle)`: `packages/merkle`
- `(sdk)`: `packages/sdk`
- `(verifier)`: `packages/verifier-cli`
- `(indexer)`: `indexer`
- `(web)` or `(ui)`: `apps/web`
- `(repo)` or `(setup)`: Monorepo configuration / workspace setup

### Example Commit Messages
```bash
feat(ui): add wallet disconnect dropdown button
feat(indexer): add Hubble BigQuery fallback for archived ledgers
fix(merkle): handle odd leaf count duplicate node padding
docs(readme): add system architecture flowchart
test(sdk): add contract client simulation unit test
```

### Branching Convention
Create feature branches from `main`:
- `feat/issue-number-short-description` (e.g., `feat/1-wallet-disconnect`)
- `fix/issue-number-short-description` (e.g., `fix/4-leaf-endianness`)
- `docs/short-description` (e.g., `docs/architecture-flowchart`)

---

## Pull Request Process

1. Ensure your branch is rebased on latest `main`.
2. Ensure `npm run build` compiles without TypeScript or linter errors.
3. Ensure `npm test` passes 100% across all packages.
4. Open a Pull Request targeting `main`.
5. Fill out the PR template with:
   - Summary of changes
   - Linked issue (`Fixes #...`)
   - Test steps or screenshot/recording for UI changes.
6. A maintainer will review your submission and provide feedback or approve for merge.

---

## Testing & Quality Assurance

All contributions must adhere to our core cryptographic and mathematical constraints:
- **No Floating Point Math**: All token balances, allocations, and tree indices must use JavaScript `BigInt` (128-bit values).
- **Exact Cryptographic Parity**: Any changes to Merkle hashing must maintain 100% parity with the Soroban Rust contract in `yieldstream-contract`.
- **Strict TypeScript**: Do not use `any` unless strictly necessary for raw third-party XDR wrappers.
