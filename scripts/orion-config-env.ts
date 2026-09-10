import { getAddress, ZeroAddress, isAddress } from "ethers";

const SEPOLIA_ORION_CONFIG = "0xbDe3025d08681a02a1c6cf70375baBe2152DD06f";

/**
 * Map Hardhat `--network` / CHAIN to the chain-specific OrionConfig env var name.
 */
export function orionConfigEnvName(network: string | undefined): string {
  if (network === undefined || network.trim() === "") {
    throw new Error("CHAIN is required");
  }
  const name = network.trim().toLowerCase();
  switch (name) {
    case "mainnet":
      return "MAINNET_ORION_CONFIG_ADDRESS";
    case "sepolia":
    case "hardhat":
    case "localhost":
      return "SEPOLIA_ORION_CONFIG_ADDRESS";
    default:
      throw new Error(`Unsupported CHAIN: ${network}`);
  }
}

/**
 * Resolve OrionConfig from chain-specific env (no generic ORION_CONFIG_ADDRESS fallback).
 */
export function resolveOrionConfigAddress(network: string | undefined, env: NodeJS.Dict<string> = process.env): string {
  const envName = orionConfigEnvName(network);
  const raw = env[envName];
  if (!raw || raw.trim() === "") {
    throw new Error(`${envName} is required for network ${network}`);
  }
  if (!isAddress(raw)) {
    throw new Error(`${envName} is not a valid address: ${raw}`);
  }
  const addr = getAddress(raw);
  if (addr === ZeroAddress) {
    throw new Error(`${envName} must not be the zero address`);
  }
  if (envName === "MAINNET_ORION_CONFIG_ADDRESS" && addr === getAddress(SEPOLIA_ORION_CONFIG)) {
    throw new Error(`${envName} must not be the Sepolia OrionConfig`);
  }
  return addr;
}
