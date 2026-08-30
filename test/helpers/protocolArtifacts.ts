import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Signer } from "ethers";
import { ethers } from "./hh";

const require = createRequire(import.meta.url);
const protocolRoot = path.dirname(require.resolve("@orion-finance/protocol/package.json"));
const protocolArtifactsRoot = path.join(protocolRoot, "artifacts", "contracts");

function findArtifactFile(dir: string, contractName: string): string | undefined {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findArtifactFile(fullPath, contractName);
      if (found) return found;
      continue;
    }
    if (entry === `${contractName}.json` && !entry.endsWith(".dbg.json")) {
      return fullPath;
    }
  }
  return undefined;
}

export function loadProtocolArtifact(contractName: string): {
  abi: readonly unknown[];
  bytecode: string;
  deployedBytecode: string;
  contractName: string;
  sourceName: string;
  linkReferences: Record<string, unknown>;
  deployedLinkReferences: Record<string, unknown>;
} {
  const artifactPath = findArtifactFile(protocolArtifactsRoot, contractName);
  if (!artifactPath) {
    throw new Error(
      `Protocol artifact not found for ${contractName}. Run pnpm precompile to compile @orion-finance/protocol.`,
    );
  }

  return JSON.parse(readFileSync(artifactPath, "utf8")) as {
    abi: readonly unknown[];
    bytecode: string;
    deployedBytecode: string;
    contractName: string;
    sourceName: string;
    linkReferences: Record<string, unknown>;
    deployedLinkReferences: Record<string, unknown>;
  };
}

export async function getProtocolFactory<TContract>(contractName: string, signer?: Signer) {
  const artifact = loadProtocolArtifact(contractName);
  const factory = await ethers.getContractFactoryFromArtifact(artifact, signer);
  return factory as import("ethers").ContractFactory<TContract>;
}

export async function getProtocolContractAt<TContract>(
  contractName: string,
  address: string,
  signer?: Signer,
): Promise<TContract> {
  const artifact = loadProtocolArtifact(contractName);
  return ethers.getContractAt(artifact.abi, address, signer) as Promise<TContract>;
}
