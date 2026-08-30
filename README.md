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

`@orion-finance/protocol` is a direct GitHub dependency (`main`). `precompile` compiles it into `node_modules` before plugin builds and tests. Integration tests deploy the full protocol stack from those artifacts.

For protocol architecture and interface docs, see [docs.orionfinance.ai](https://docs.orionfinance.ai/).

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

[docs]: https://docs.orionfinance.ai/
[docs-badge]: https://img.shields.io/badge/Documentation-Read%20the%20Docs-blue?style=for-the-badge&logo=readthedocs&logoColor=white
