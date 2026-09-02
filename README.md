<div align="center">

<img src="https://docs.orionfinance.ai/img/Orion_Logo_white_horizontal.svg" alt="orion" width="75%">

[![Github Actions][gha-badge]][gha] [![Coverage][cov-badge]][cov] [![Hardhat][hardhat-badge]][hardhat] [![CodeRabbit][cr-badge]][cr]

[![LinkedIn][linkedin-badge]][linkedin] [![X][x-badge]][x] [![Telegram][telegram-badge]][telegram] [![Discord][discord-badge]][discord]

</div>

Smart contract plugins for [Orion Finance](https://github.com/OrionFinanceAI/protocol): onchain strategists, deposit access controllers, and external depositor helpers.

Each plugin implements a protocol-defined interface from [`@orion-finance/protocol`](https://github.com/OrionFinanceAI/protocol).

If you have an idea for a strategist, access policy, or depositor flow, this is the place to build it, test it against the real protocol stack, and share it with others.

## Development

Requires Node.js ≥ 22.13 and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm coverage
```

`@orion-finance/protocol` is a direct GitHub dependency (`2.7.1`). `precompile` compiles it into `node_modules` before plugin builds and tests. Integration tests deploy the full protocol stack from those artifacts.

For protocol architecture and interface docs, see [docs.orionfinance.ai](https://docs.orionfinance.ai/).

## Deploy

One Hardhat script deploys a single plugin. KBest *operation* (cron / `submitIntent`) stays in [`IOrionStrategist-template`](https://github.com/OrionFinanceAI/IOrionStrategist-template); this CLI is how you get an address. `manager-only` and `non-transferable` are safe to reuse across vaults; whitelist is per-manager.

| `PLUGIN` | Contract | Extra env | What it does |
| --- | --- | --- | --- |
| `whitelist` | `WhitelistAccessControl` | `OWNER` (default: deployer) | Allowlist for deposit / holder / transfer |
| `manager-only` | `ManagerOnlyDepositAccessControl` | — | Only the vault manager may deposit |
| `non-transferable` | `NonTransferableSharesAccessControl` | — | Blocks P2P share transfers; redeem still works |
| `tvl-cap` | `TvlCapDepositAccessControl` | `TVL_CAP` | Caps projected vault TVL |
| `nft` | `NftOwnerAccessControl` | `CREDENTIAL` | Requires an ERC-721 credential |
| `blacklist` | `BlacklistRejectAccessControl` | `DENYLIST` | Rejects addresses on a denylist |
| `signed-ticket` | `SignedTicketAccessControl` | `ATTESTER`, `EIP712_NAME`, `EIP712_VERSION` | Off-chain signed tickets |
| `ens` | `EnsSubtreeAccessControl` | `ENS_REGISTRY`, `ROOT_NODE` | Wallet must resolve under an ENS root |
| `eas` | `EasAccessControl` | `OWNER`, `EAS`, `SCHEMA_UID`, `TRUSTED_ATTESTERS`, `POLICY_MODE` (`0` email / `1` nationality), `EMAIL_DOMAIN_HASH`, `COUNTRY_CODES` | EAS attestation gate |
| `all-of` | `AllOfDepositAccessControl` | `GATES` (comma addresses) | AND-composes deposit gates |
| `router` | `OrionDistributionRouter` | `SEPOLIA_ORION_CONFIG_ADDRESS` | Distributor-routed `requestDepositFor` |
| `tvl` | `KBestTvlWeightedAverage` | `STRATEGIST_K` (default `10`), optional `VAULT_ADDRESS` | Top-K by TVL, TVL weights |
| `apy-equal` | `KBestApyStrategist` | same | Top-K by APY, equal weights |
| `apy-weighted` | `KBestApyStrategist` | same | Top-K by APY, APY weights |

```bash
cp .env.example .env
PLUGIN=whitelist OWNER=0x... pnpm deploy:sepolia
PLUGIN=manager-only pnpm deploy:sepolia
PLUGIN=router pnpm deploy:sepolia
```

Required in `.env`: `PRIVATE_KEY`, `SEPOLIA_RPC_URL`. `PLUGIN` is set on the command. Writes `deployments/<network>-<timestamp>.json`.

## Adding a new plugin

1. Implement the relevant interface from `@orion-finance/protocol`.
2. Add unit tests with mocks where possible.
3. Add integration tests using `deployUpgradeableProtocol()` from [`test/helpers/deployUpgradeable.ts`](test/helpers/deployUpgradeable.ts).
4. Never import protocol implementation contracts in production plugin Solidity.

## Contributing

We welcome contributions of all kinds! Bug reports, new plugins, tests, docs. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

[gha]: https://github.com/OrionFinanceAI/protocol-plugins/actions
[gha-badge]: https://github.com/OrionFinanceAI/protocol-plugins/actions/workflows/ci.yml/badge.svg
[cov]: https://codecov.io/gh/OrionFinanceAI/protocol-plugins
[cov-badge]: https://codecov.io/gh/OrionFinanceAI/protocol-plugins/graph/badge.svg
[hardhat]: https://hardhat.org/
[hardhat-badge]: https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg

[cr]: https://www.coderabbit.ai/
[cr-badge]: https://img.shields.io/badge/CodeRabbit-Enabled-FF570A?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMiAyMkgyMkwxMiAyWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+

[linkedin]: https://www.linkedin.com/company/orionfinance/
[linkedin-badge]: https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white

[x]: https://x.com/OrionFinanceAI
[x-badge]: https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white

[telegram]: https://t.me/orionfinance_ai
[telegram-badge]: https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white

[discord]: https://discord.gg/8bAXxPSPdw
[discord-badge]: https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white
