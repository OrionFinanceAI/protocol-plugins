# Contributing

Thank you for contributing to protocol-plugins. Contributions of all sizes are welcome, including bug reports, new
plugins, documentation improvements, tests, and code changes.

By participating in the project, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- Report reproducible bugs through [GitHub issues][gh-issues].
- Propose new plugins or improvements to existing ones.
- Improve the documentation or developer guides.
- Fix open issues.
- Add tests or improve existing test coverage.

Please report security vulnerabilities privately to security@orionfinance.ai, rather than opening a public issue.

For substantial changes, consider opening an issue first. This gives maintainers and contributors an opportunity to
discuss the scope and approach before implementation.

### Report a bug

A useful bug report includes:

- Your operating system, Node.js version, and pnpm version.
- Steps to reproduce the issue.
- The observed behavior and the expected behavior.
- The complete Hardhat or test error output, when applicable.

### Propose a plugin or feature

A useful proposal:

- Explains the problem or use case.
- Identifies the protocol interface your plugin would implement.
- Describes the expected behavior and a test plan.
- Keeps the initial scope as narrow as practical.

## Development setup

Local development requires Node.js ≥ 22.13 and [pnpm](https://pnpm.io/).

1. Fork the repository on GitHub and clone your fork:

   ```shell
   git clone git@github.com:your-name/protocol-plugins.git
   cd protocol-plugins
   ```

2. Install dependencies:

   ```shell
   pnpm install
   ```

   This pulls [`@orion-finance/protocol`](https://github.com/OrionFinanceAI/protocol) from GitHub as a dependency.

3. Create a branch for your changes:

   ```shell
   git checkout -b name-of-your-bugfix-or-feature
   ```

   Prefer a branch name of the form `type/reference/description-in-kebab-case`, where `type` aligns with
   [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (`feat`, `fix`, `docs`, `refactor`, `test`,
   `chore`, …), `reference` is an issue such as `issue-34` or `no-ref`, and `description` is a short kebab-case summary.
   Example: `feat/issue-34/k-best-strategist`.

   Commit messages on that branch should follow Conventional Commits as described in
   [Submit your changes](#submit-your-changes).

## Tests and code quality

Add tests for new behavior and bug fixes.

Run the full build (compiles the protocol dependency, then plugins):

```shell
pnpm build
```

Run tests:

```shell
pnpm test
```

Run tests with coverage:

```shell
pnpm coverage
```

Lint Solidity and TypeScript:

```shell
pnpm lint
```

Format code:

```shell
pnpm prettier:write
```

Integration tests deploy the full protocol stack via [`deployUpgradeableProtocol()`](test/helpers/deployUpgradeable.ts)
using artifacts from the installed `@orion-finance/protocol` package.

## Solidity conventions

- Implement protocol **interfaces** only in production plugin contracts.
- Never import protocol **implementation** contracts in production plugin Solidity.
- Use the `BSD-3-Clause` SPDX license identifier in new `.sol` files.
- Match existing naming, formatting, and test patterns in the repo.

## Submit your changes

Commit your changes using a message that follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

Use `type(scope): description`, where the scope is optional. Common types are:

- `feat`: New plugin or functionality.
- `fix`: Bug fix.
- `docs`: Documentation changes.
- `test`: Test changes.
- `refactor`: Code changes that preserve behavior.
- `build`: Packaging or dependency changes.
- `ci`: Continuous integration changes.
- `chore`: Repository maintenance.

Add `!` for a breaking change, for example `feat!: remove deprecated strategist parameter`.

```shell
git add .
git commit -m "feat(scope): describe your change"
git push origin name-of-your-bugfix-or-feature
```

Open a pull request through GitHub, or use the GitHub CLI:

```shell
gh pr create --fill
```

Draft pull requests are welcome and are a good place to discuss work in progress. Before requesting a review:

- Include tests for feature changes and bug fixes.
- Update the documentation when behavior or public APIs change.
- Keep the pull request focused on one coherent change.
- Confirm that `pnpm lint`, `pnpm build`, and `pnpm test` pass locally.
- Ensure that continuous integration passes.

[gh-issues]: https://github.com/OrionFinanceAI/protocol-plugins/issues
