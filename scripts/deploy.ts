/**
 * Deploy one plugin contract.
 *
 * Required env:
 *   PLUGIN                  — see VALID_PLUGINS below
 *   PRIVATE_KEY             — deployer
 *
 * Optional env:
 *   SEPOLIA_ORION_CONFIG_ADDRESS — Sepolia OrionConfig (see .env.example)
 *   SKIP_VERIFY                  — set "1" to skip printing Etherscan verify commands
 *
 * Usage:
 *   PLUGIN=whitelist pnpm deploy:sepolia
 *   PLUGIN=manager-only hardhat run scripts/deploy.ts --network hardhat
 */

import hre from "hardhat";
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";
import fs from "node:fs";
import path from "node:path";
import type { BytesLike } from "ethers";

const DEFAULT_ORION_CONFIG = "0xbDe3025d08681a02a1c6cf70375baBe2152DD06f";
const WEIGHTING_EQUAL = 0n;
const WEIGHTING_APY = 1n;

const VALID_PLUGINS = [
  "whitelist",
  "manager-only",
  "non-transferable",
  "tvl-cap",
  "nft",
  "blacklist",
  "signed-ticket",
  "ens",
  "eas",
  "all-of",
  "router",
  "tvl",
  "apy-equal",
  "apy-weighted",
] as const;

type PluginKey = (typeof VALID_PLUGINS)[number];
type CtorArg = string | bigint | number | boolean | BytesLike | CtorArg[];

const connection = (await hre.network.getOrCreate()) as unknown as { networkName?: string; ethers: HardhatEthers };
const { ethers } = connection;
const networkName = connection.networkName ?? process.env.HARDHAT_NETWORK ?? "hardhat";
const isLocal = networkName === "hardhat" || networkName === "localhost";
const confirmations = isLocal ? 1 : 5;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function parsePlugin(): PluginKey {
  const raw = process.env.PLUGIN?.trim().toLowerCase();
  if (!raw) throw new Error(`Missing required env var: PLUGIN. Valid: ${VALID_PLUGINS.join(", ")}`);
  if (!VALID_PLUGINS.includes(raw as PluginKey)) {
    throw new Error(`Unknown PLUGIN "${raw}". Valid: ${VALID_PLUGINS.join(", ")}`);
  }
  return raw as PluginKey;
}

function parseAddressList(name: string): string[] {
  const raw = requireEnv(name);
  return raw.split(",").map((s) => ethers.getAddress(s.trim()));
}

function parseBytes2List(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  return raw.split(",").map((s) => {
    const hex = s.trim();
    if (!/^0x[0-9a-fA-F]{4}$/.test(hex)) {
      throw new Error(`COUNTRY_CODES entries must be bytes2 hex (got ${hex})`);
    }
    return hex;
  });
}

function printVerifyCmd(network: string, address: string, constructorArgs: CtorArg[]): void {
  const argsStr = constructorArgs
    .flatMap((a) => (Array.isArray(a) ? a : [a]))
    .map((a) => String(a))
    .join(" ");
  console.log(`  npx hardhat verify --network ${network} ${address} ${argsStr}`);
}

async function main(): Promise<void> {
  const plugin = parsePlugin();
  const pk = requireEnv("PRIVATE_KEY");
  const deployer = new ethers.Wallet(pk, ethers.provider);
  const configAddr = ethers.getAddress(process.env.SEPOLIA_ORION_CONFIG_ADDRESS ?? DEFAULT_ORION_CONFIG);
  const skipVerify = process.env.SKIP_VERIFY === "1";
  const owner = process.env.OWNER ? ethers.getAddress(process.env.OWNER) : deployer.address;
  const vaultAddr = process.env.VAULT_ADDRESS ? ethers.getAddress(process.env.VAULT_ADDRESS) : null;
  const k = BigInt(process.env.STRATEGIST_K ?? "10");

  console.log(`Network:     ${networkName}`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`PLUGIN:      ${plugin}`);
  console.log();

  let contractName: string;
  let constructorArgs: CtorArg[];
  let isKBest = false;

  switch (plugin) {
    case "whitelist":
      contractName = "WhitelistAccessControl";
      constructorArgs = [owner];
      break;
    case "manager-only":
      contractName = "ManagerOnlyDepositAccessControl";
      constructorArgs = [];
      break;
    case "non-transferable":
      contractName = "NonTransferableSharesAccessControl";
      constructorArgs = [];
      break;
    case "tvl-cap":
      contractName = "TvlCapDepositAccessControl";
      constructorArgs = [BigInt(requireEnv("TVL_CAP"))];
      break;
    case "nft":
      contractName = "NftOwnerAccessControl";
      constructorArgs = [ethers.getAddress(requireEnv("CREDENTIAL"))];
      break;
    case "blacklist":
      contractName = "BlacklistRejectAccessControl";
      constructorArgs = [ethers.getAddress(requireEnv("DENYLIST"))];
      break;
    case "signed-ticket":
      contractName = "SignedTicketAccessControl";
      constructorArgs = [
        ethers.getAddress(requireEnv("ATTESTER")),
        requireEnv("EIP712_NAME"),
        requireEnv("EIP712_VERSION"),
      ];
      break;
    case "ens":
      contractName = "EnsSubtreeAccessControl";
      constructorArgs = [ethers.getAddress(requireEnv("ENS_REGISTRY")), requireEnv("ROOT_NODE")];
      break;
    case "eas": {
      const policyMode = Number(requireEnv("POLICY_MODE"));
      if (policyMode !== 0 && policyMode !== 1)
        throw new Error("POLICY_MODE must be 0 (EmailDomain) or 1 (Nationality)");
      contractName = "EasAccessControl";
      constructorArgs = [
        owner,
        ethers.getAddress(requireEnv("EAS")),
        requireEnv("SCHEMA_UID"),
        parseAddressList("TRUSTED_ATTESTERS"),
        policyMode,
        process.env.EMAIL_DOMAIN_HASH ?? ethers.ZeroHash,
        parseBytes2List(process.env.COUNTRY_CODES),
      ];
      break;
    }
    case "all-of":
      contractName = "AllOfDepositAccessControl";
      constructorArgs = [parseAddressList("GATES")];
      break;
    case "router":
      contractName = "OrionDistributionRouter";
      constructorArgs = [configAddr];
      break;
    case "tvl":
      if (k === 0n || k > 65535n) throw new Error("STRATEGIST_K must be in range 1–65535");
      contractName = "KBestTvlWeightedAverage";
      constructorArgs = [deployer.address, configAddr, k];
      isKBest = true;
      break;
    case "apy-equal":
      if (k === 0n || k > 65535n) throw new Error("STRATEGIST_K must be in range 1–65535");
      contractName = "KBestApyStrategist";
      constructorArgs = [deployer.address, configAddr, k, WEIGHTING_EQUAL];
      isKBest = true;
      break;
    case "apy-weighted":
      if (k === 0n || k > 65535n) throw new Error("STRATEGIST_K must be in range 1–65535");
      contractName = "KBestApyStrategist";
      constructorArgs = [deployer.address, configAddr, k, WEIGHTING_APY];
      isKBest = true;
      break;
  }

  console.log(`Deploying ${contractName}...`);
  const Factory = await ethers.getContractFactory(contractName, deployer);
  const contract = await Factory.deploy(...constructorArgs);
  await contract.deploymentTransaction()?.wait(confirmations);
  const address = await contract.getAddress();
  console.log(`  ${contractName}: ${address}`);

  if (isKBest && vaultAddr) {
    console.log(`Linking to vault ${vaultAddr}...`);
    const tx = await new ethers.Contract(address, ["function setVault(address) external"], deployer).setVault(
      vaultAddr,
    );
    await tx.wait(confirmations);
    console.log("  setVault ok");
  }

  if (!isLocal && !skipVerify) {
    console.log("\nTo verify on Etherscan, run:");
    printVerifyCmd(networkName, address, constructorArgs);
  }

  const output: Record<string, unknown> = {
    network: networkName,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    plugin,
    address,
    constructorArgs: constructorArgs.map((a) => (typeof a === "bigint" ? a.toString() : a)),
  };
  if (isKBest || plugin === "router") output.orionConfig = configAddr;
  if (isKBest) {
    output.k = Number(k);
    output.vault = vaultAddr;
  }

  const deploymentsDir = path.join(import.meta.dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const filename = `${networkName}-${Date.now()}.json`;
  fs.writeFileSync(path.join(deploymentsDir, filename), JSON.stringify(output, null, 2));

  console.log(`\nDeployment saved to deployments/${filename}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
