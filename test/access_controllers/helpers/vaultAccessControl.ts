import { ethers, networkHelpers } from "../../helpers/hh";
import { getProtocolContractAt } from "../../helpers/protocolArtifacts";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  OrionTransparentVault,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";

export const UNDERLYING_DECIMALS = 6;

export function parseUnderlying(amount: string): bigint {
  return ethers.parseUnits(amount, UNDERLYING_DECIMALS);
}

export async function impersonateLo(liquidityOrchestrator: LiquidityOrchestrator) {
  const loAddress = await liquidityOrchestrator.getAddress();
  await networkHelpers.impersonateAccount(loAddress);
  await networkHelpers.setBalance(loAddress, ethers.parseEther("1"));
  return ethers.getSigner(loAddress);
}

export async function createVaultWithGates(
  factory: TransparentVaultFactory,
  owner: SignerWithAddress,
  strategist: string,
  depositAcl: string = ethers.ZeroAddress,
  holderAcl: string = ethers.ZeroAddress,
  transferAcl: string = ethers.ZeroAddress,
  name = "ACL Vault",
  symbol = "ACLV",
): Promise<OrionTransparentVault> {
  const tx = await factory
    .connect(owner)
    .createVault(strategist, name, symbol, 0, 0, 0, depositAcl, holderAcl, transferAcl);
  const receipt = await tx.wait();
  const log = receipt?.logs.find((l) => {
    try {
      return factory.interface.parseLog(l)?.name === "OrionVaultCreated";
    } catch {
      return false;
    }
  });
  const vaultAddress = factory.interface.parseLog(log!)?.args[0] as string;
  return (await getProtocolContractAt("OrionTransparentVault", vaultAddress)) as unknown as OrionTransparentVault;
}

export async function fundAndApprove(
  underlyingAsset: MockUnderlyingAsset,
  vault: OrionTransparentVault,
  account: SignerWithAddress,
  assets: bigint,
): Promise<void> {
  await underlyingAsset.mint(account.address, assets);
  await underlyingAsset.connect(account).approve(await vault.getAddress(), assets);
}

export async function requestAndFulfill(
  underlyingAsset: MockUnderlyingAsset,
  liquidityOrchestrator: LiquidityOrchestrator,
  vault: OrionTransparentVault,
  account: SignerWithAddress,
  assets: bigint,
): Promise<void> {
  await fundAndApprove(underlyingAsset, vault, account, assets);
  await vault.connect(account).requestDeposit(assets);
  const loSigner = await impersonateLo(liquidityOrchestrator);
  await vault.connect(loSigner).fulfillDeposit(assets);
}
