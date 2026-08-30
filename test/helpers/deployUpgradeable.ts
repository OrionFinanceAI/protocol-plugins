import type { Signer } from "ethers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  OrionConfig,
  OrionTransparentVault,
  OrionUpgradeableBeacon,
  PriceAdapterRegistry,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";
import { getProtocolFactory } from "./protocolArtifacts";

export interface UpgradeableProtocolContracts {
  orionConfig: OrionConfig;
  priceAdapterRegistry: PriceAdapterRegistry;
  liquidityOrchestrator: LiquidityOrchestrator;
  transparentVaultFactory: TransparentVaultFactory;
  vaultBeacon: OrionUpgradeableBeacon;
  underlyingAsset: MockUnderlyingAsset;
}

export async function deployUUPSProxy<TContract>(
  contractName: string,
  initializeArgs: unknown[],
  signer: Signer | SignerWithAddress,
): Promise<TContract> {
  const implFactory = await getProtocolFactory(contractName, signer);
  const implementation = await implFactory.deploy();
  await implementation.waitForDeployment();

  const initData = implFactory.interface.encodeFunctionData("initialize", initializeArgs);
  const proxyFactory = await getProtocolFactory("OrionERC1967Proxy", signer);
  const proxy = await proxyFactory.deploy(await implementation.getAddress(), initData);
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  return implFactory.attach(proxyAddress).connect(signer) as unknown as TContract;
}

export async function deployUpgradeableProtocol(
  owner: SignerWithAddress,
  underlyingAsset?: MockUnderlyingAsset,
  automationRegistry?: SignerWithAddress,
): Promise<UpgradeableProtocolContracts> {
  const automationReg = automationRegistry || owner;

  let underlying = underlyingAsset;
  if (!underlying) {
    const MockUnderlyingAssetFactory = await getProtocolFactory<MockUnderlyingAsset>("MockUnderlyingAsset");
    underlying = (await MockUnderlyingAssetFactory.deploy(6)) as unknown as MockUnderlyingAsset;
    await underlying.waitForDeployment();
  }

  const orionConfig = await deployUUPSProxy<OrionConfig>(
    "OrionConfig",
    [owner.address, await underlying.getAddress()],
    owner,
  );

  const priceAdapterRegistry = await deployUUPSProxy<PriceAdapterRegistry>(
    "PriceAdapterRegistry",
    [owner.address, await orionConfig.getAddress()],
    owner,
  );

  await orionConfig.setPriceAdapterRegistry(await priceAdapterRegistry.getAddress());

  const SP1VerifierGatewayFactory = await getProtocolFactory("SP1VerifierGateway", owner);
  const sp1VerifierGateway = await SP1VerifierGatewayFactory.deploy(owner.address);
  await sp1VerifierGateway.waitForDeployment();

  const SP1VerifierFactory = await getProtocolFactory("SP1Verifier", owner);
  const sp1VerifierGroth16 = await SP1VerifierFactory.deploy();
  await sp1VerifierGroth16.waitForDeployment();

  await sp1VerifierGateway.addRoute(await sp1VerifierGroth16.getAddress());

  const vKey = "0x007ccff4696ddd1d62fec2a106aa50309ba0fdee8fc2bcbc9c0b5ea68fe200f3";

  const liquidityOrchestrator = await deployUUPSProxy<LiquidityOrchestrator>(
    "LiquidityOrchestrator",
    [owner.address, await orionConfig.getAddress(), automationReg.address, await sp1VerifierGateway.getAddress(), vKey],
    owner,
  );

  await orionConfig.setLiquidityOrchestrator(await liquidityOrchestrator.getAddress());

  const VaultImplFactory = await getProtocolFactory("OrionTransparentVault", owner);
  const vaultImpl = await VaultImplFactory.deploy();
  await vaultImpl.waitForDeployment();

  const BeaconFactory = await getProtocolFactory("OrionUpgradeableBeacon", owner);
  const vaultBeacon = (await BeaconFactory.deploy(
    await vaultImpl.getAddress(),
    owner.address,
  )) as unknown as OrionUpgradeableBeacon;
  await vaultBeacon.waitForDeployment();

  const transparentVaultFactory = await deployUUPSProxy<TransparentVaultFactory>(
    "TransparentVaultFactory",
    [owner.address, await orionConfig.getAddress(), await vaultBeacon.getAddress()],
    owner,
  );

  await orionConfig.setVaultFactory(await transparentVaultFactory.getAddress());

  return {
    orionConfig,
    priceAdapterRegistry,
    liquidityOrchestrator,
    transparentVaultFactory,
    vaultBeacon,
    underlyingAsset: underlying,
  };
}

export async function attachToVault(vaultAddress: string): Promise<OrionTransparentVault> {
  const VaultFactory = await getProtocolFactory<OrionTransparentVault>("OrionTransparentVault");
  return VaultFactory.attach(vaultAddress) as unknown as OrionTransparentVault;
}
