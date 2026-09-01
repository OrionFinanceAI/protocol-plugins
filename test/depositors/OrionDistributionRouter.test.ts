import { expect } from "chai";
import { ethers } from "../helpers/hh";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  OrionConfig,
  OrionTransparentVault,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";
import type { OrionDistributionRouter, WhitelistAccessControl } from "../../types/ethers-contracts/index.js";
import { deployUpgradeableProtocol } from "../helpers/deployUpgradeable";
import { resetNetwork } from "../helpers/resetNetwork";
import { createVaultWithGates, impersonateLo, parseUnderlying } from "../access_controllers/helpers/vaultAccessControl";

describe("OrionDistributionRouter", function () {
  let owner: SignerWithAddress;
  let strategist: SignerWithAddress;
  let user: SignerWithAddress;
  let outsider: SignerWithAddress;

  let mockAsset: MockUnderlyingAsset;
  let orionConfig: OrionConfig;
  let factory: TransparentVaultFactory;
  let liquidityOrchestrator: LiquidityOrchestrator;
  let vault: OrionTransparentVault;
  let router: OrionDistributionRouter;

  const DEPOSIT_AMOUNT = parseUnderlying("100");
  const DISTRIBUTOR_ID = ethers.id("partner-a");

  before(async function () {
    await resetNetwork();
  });

  beforeEach(async function () {
    [owner, strategist, user, , outsider] = await ethers.getSigners();
    const deployed = await deployUpgradeableProtocol(owner);
    mockAsset = deployed.underlyingAsset;
    orionConfig = deployed.orionConfig;
    factory = deployed.transparentVaultFactory;
    liquidityOrchestrator = deployed.liquidityOrchestrator;

    vault = await createVaultWithGates(factory, owner, strategist.address);

    const Router = await ethers.getContractFactory("OrionDistributionRouter");
    router = (await Router.deploy(await orionConfig.getAddress())) as unknown as OrionDistributionRouter;
  });

  async function fundUserForRouter(account: SignerWithAddress, amount: bigint) {
    await mockAsset.mint(account.address, amount);
    await mockAsset.connect(account).approve(await router.getAddress(), amount);
  }

  it("emits DistributionDeposit and credits the user queue via requestDepositFor", async function () {
    await fundUserForRouter(user, DEPOSIT_AMOUNT);
    const vaultAddress = await vault.getAddress();

    await expect(router.connect(user).requestDepositWithDistribution(vaultAddress, DISTRIBUTOR_ID, DEPOSIT_AMOUNT))
      .to.emit(router, "DistributionDeposit")
      .withArgs(DISTRIBUTOR_ID, vaultAddress, user.address, DEPOSIT_AMOUNT)
      .to.emit(vault, "DepositRequest")
      .withArgs(user.address, DEPOSIT_AMOUNT);

    const loSigner = await impersonateLo(liquidityOrchestrator);
    await vault.connect(loSigner).fulfillDeposit(DEPOSIT_AMOUNT);

    expect(await vault.balanceOf(user.address)).to.be.gt(0n);
    expect(await vault.balanceOf(await router.getAddress())).to.equal(0n);
  });

  it("routes deposits to multiple registered vaults from one router", async function () {
    const vault2 = await createVaultWithGates(
      factory,
      owner,
      strategist.address,
      undefined,
      undefined,
      undefined,
      "Vault 2",
      "VLT2",
    );

    await fundUserForRouter(user, DEPOSIT_AMOUNT * 2n);

    await expect(
      router.connect(user).requestDepositWithDistribution(await vault.getAddress(), DISTRIBUTOR_ID, DEPOSIT_AMOUNT),
    ).to.emit(vault, "DepositRequest");

    await expect(
      router.connect(user).requestDepositWithDistribution(await vault2.getAddress(), DISTRIBUTOR_ID, DEPOSIT_AMOUNT),
    ).to.emit(vault2, "DepositRequest");
  });

  it("reverts for unregistered vault addresses", async function () {
    await fundUserForRouter(user, DEPOSIT_AMOUNT);

    await expect(
      router.connect(user).requestDepositWithDistribution(outsider.address, DISTRIBUTOR_ID, DEPOSIT_AMOUNT),
    ).to.be.revertedWithCustomError(router, "VaultNotAllowed");
  });

  it("respects whitelist deposit access on the beneficiary", async function () {
    const Whitelist = await ethers.getContractFactory("WhitelistAccessControl");
    const whitelist = (await Whitelist.deploy(owner.address)) as unknown as WhitelistAccessControl;
    await whitelist.addToWhitelist([user.address]);

    await vault.connect(owner).setDepositAccessControl(await whitelist.getAddress());
    await vault.connect(owner).setHolderAccessControl(await whitelist.getAddress());

    await fundUserForRouter(user, DEPOSIT_AMOUNT);
    await expect(
      router.connect(user).requestDepositWithDistribution(await vault.getAddress(), DISTRIBUTOR_ID, DEPOSIT_AMOUNT),
    ).to.emit(vault, "DepositRequest");

    await fundUserForRouter(outsider, DEPOSIT_AMOUNT);
    await expect(
      router.connect(outsider).requestDepositWithDistribution(await vault.getAddress(), DISTRIBUTOR_ID, DEPOSIT_AMOUNT),
    ).to.be.revertedWithCustomError(vault, "DepositNotAllowed");
  });

  it("returns cancelled underlying to the beneficiary, not the router", async function () {
    await fundUserForRouter(user, DEPOSIT_AMOUNT);
    await router.connect(user).requestDepositWithDistribution(await vault.getAddress(), DISTRIBUTOR_ID, DEPOSIT_AMOUNT);

    const userBalanceBeforeCancel = await mockAsset.balanceOf(user.address);
    const routerBalanceBeforeCancel = await mockAsset.balanceOf(await router.getAddress());

    await expect(vault.connect(user).cancelDepositRequest(DEPOSIT_AMOUNT))
      .to.emit(vault, "DepositRequestCancelled")
      .withArgs(user.address, DEPOSIT_AMOUNT);

    expect(await mockAsset.balanceOf(user.address)).to.equal(userBalanceBeforeCancel + DEPOSIT_AMOUNT);
    expect(await mockAsset.balanceOf(await router.getAddress())).to.equal(routerBalanceBeforeCancel);
  });

  it("reverts on zero vault address", async function () {
    await fundUserForRouter(user, DEPOSIT_AMOUNT);
    await expect(
      router.connect(user).requestDepositWithDistribution(ethers.ZeroAddress, DISTRIBUTOR_ID, DEPOSIT_AMOUNT),
    ).to.be.revertedWithCustomError(router, "ZeroAddress");
  });

  it("reverts on zero assets", async function () {
    await expect(
      router.connect(user).requestDepositWithDistribution(await vault.getAddress(), DISTRIBUTOR_ID, 0n),
    ).to.be.revertedWithCustomError(router, "ZeroAmount");
  });

  it("reverts when the user has not approved the router", async function () {
    await mockAsset.mint(user.address, DEPOSIT_AMOUNT);
    await expect(
      router.connect(user).requestDepositWithDistribution(await vault.getAddress(), DISTRIBUTOR_ID, DEPOSIT_AMOUNT),
    ).to.be.revertedWithCustomError(mockAsset, "ERC20InsufficientAllowance");
  });
});
