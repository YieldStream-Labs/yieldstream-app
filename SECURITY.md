# Security Policy

YieldStream takes the security and integrity of its smart contracts, cryptographic libraries, and web applications seriously. We appreciate the efforts of security researchers and community members who help keep the protocol secure.

---

## ⚠️ Unaudited Smart Contract Notice

> [!CAUTION]
> **The YieldStream smart contracts and application layer are currently UNAUDITED.**
> 
> The code in this repository and the companion [`yieldstream-contract`](https://github.com/YieldStream-Labs/yieldstream-contract) repository is in active development and provided for experimental and testing purposes on the **Stellar Testnet**.
> 
> - **DO NOT** deploy these contracts to Stellar Mainnet with real, production funds without commissioning a comprehensive, professional third-party smart contract security audit.
> - **DO NOT** deposit significant monetary value or irrevocable tokens into active distributions on testnets or unauthorized deployments.
> - The developers and contributors make no representations or warranties regarding the security, accuracy, or reliability of these contracts or client SDKs.

---

## Supported Versions

Only the latest commit on the `main` branch of this repository is supported for security disclosures.

| Component | Version / Branch | Supported |
|---|---|---|
| `yieldstream-app` Monorepo | `main` | :white_check_mark: |
| `@yieldstream/merkle` | Latest (`0.1.0`) | :white_check_mark: |
| `@yieldstream/sdk` | Latest (`0.1.0`) | :white_check_mark: |
| `yieldstream-contract` | `main` | :white_check_mark: |
| Older releases / branches | Prior commits | :x: |

---

## Reporting a Vulnerability (Responsible Disclosure)

If you discover a security vulnerability, bug, or exploit vector in YieldStream (including Merkle tree construction bugs, fund-draining vulnerabilities, simulation discrepancies, or credential leaks):

1. **Do NOT open a public GitHub issue.** Public issues disclose vulnerabilities before patches can be deployed.
2. **Submit via GitHub Private Vulnerability Reporting**:
   - Navigate to the [YieldStream App Security tab](https://github.com/YieldStream-Labs/yieldstream-app/security/advisories/new).
   - Click **"Report a vulnerability"** to open a private advisory.
3. **Alternative Contact**:
   - If GitHub Private Vulnerability Reporting is unavailable, email our security team directly at:
     **`security@yieldstream.org`** (or contact the maintainers via `YieldStream-Labs` organization administration).
   - Please include:
     - Component name and file path(s)
     - Detailed description of the vulnerability and attack vector
     - Step-by-step proof-of-concept (PoC) or reproducer script
     - Potential impact (e.g. unauthorized claims, denial of service, griefing)

---

## Response Process & Timelines

- **Initial Acknowledgment**: Within 48 hours of report receipt.
- **Triage & Assessment**: Within 5 business days, confirming whether the vulnerability is reproducible and assessing severity.
- **Fix & Disclosure**: We will collaborate with the reporter to develop and verify a patch before coordinating a public disclosure and security advisory release.

---

## Safe Harbor Policy

We consider security research conducted under this policy to be authorized. We will not pursue legal action against researchers who:
- Make a good-faith effort to avoid privacy violations, data destruction, and service interruption.
- Do not exploit identified vulnerabilities beyond what is minimally required to prove the concept.
- Give us reasonable time to resolve the issue before public disclosure.
- Act in compliance with applicable laws.
