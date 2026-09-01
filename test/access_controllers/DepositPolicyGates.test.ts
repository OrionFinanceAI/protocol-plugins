import { expect } from "chai";
import { ethers } from "../helpers/hh";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";
import type {
  AllOfDepositAccessControl,
  TvlCapDepositAccessControl,
  WhitelistAccessControl,
  BlacklistRejectAccessControl,
} from "../../types/ethers-contracts/index.js";
import type { MockBlacklistable } from "../../types/ethers-contracts/contracts/test/access_controllers/index.js";
import { deployUpgradeableProtocol } from "../helpers/deployUpgradeable";
import { resetNetwork } from "../helpers/resetNetwork";
import {
  createVaultWithGates,
  fundAndApprove,
  impersonateLo,
  parseUnderlying,
  requestAndFulfill,
} from "./helpers/vaultAccessControl";

describe("Deposit policy gates", function () {
  let owner: SignerWithAddress;
  let strategist: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let mockAsset: MockUnderlyingAsset;
  let factory: TransparentVaultFactory;
  let liquidityOrchestrator: LiquidityOrchestrator;

  const DEPOSIT_AMOUNT = parseUnderlying("100");

  before(async function () {
    await resetNetwork();
  });

  beforeEach(async function () {
    [owner, strategist, user1, user2] = await ethers.getSigners();
    const deployed = await deployUpgradeableProtocol(owner);
    mockAsset = deployed.underlyingAsset;
    factory = deployed.transparentVaultFactory;
    liquidityOrchestrator = deployed.liquidityOrchestrator;
  });

  describe("AllOfDepositAccessControl (whitelist AND blacklist)", function () {
    it("allows only whitelisted and non-blacklisted accounts to deposit", async function () {
      const Whitelist = await ethers.getContractFactory("WhitelistAccessControl");
      const whitelist = (await Whitelist.deploy(owner.address)) as unknown as WhitelistAccessControl;
      await whitelist.addToWhitelist([user1.address, user2.address]);

      const MockDenylist = await ethers.getContractFactory("MockBlacklistable");
      const denylist = (await MockDenylist.deploy()) as unknown as MockBlacklistable;
      const BlacklistGate = await ethers.getContractFactory("BlacklistRejectAccessControl");
      const blacklist = (await BlacklistGate.deploy(
        await denylist.getAddress(),
      )) as unknown as BlacklistRejectAccessControl;

      const AllOfDeposit = await ethers.getContractFactory("AllOfDepositAccessControl");
      const depositGate = (await AllOfDeposit.deploy([
        await whitelist.getAddress(),
        await blacklist.getAddress(),
      ])) as unknown as AllOfDepositAccessControl;

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        await depositGate.getAddress(),
        await whitelist.getAddress(),
        await whitelist.getAddress(),
      );

      await denylist.setBlacklisted(user1.address, true);
      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );

      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user2, DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user2.address)).to.be.gt(0n);

      const [, , , , outsider] = await ethers.getSigners();
      await mockAsset.mint(outsider.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(outsider).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(outsider).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });
  });

  describe("TvlCapDepositAccessControl", function () {
    async function deployTvlCapVault(cap: bigint) {
      const vault = await createVaultWithGates(factory, owner, strategist.address);
      const TvlCap = await ethers.getContractFactory("TvlCapDepositAccessControl");
      const depositGate = (await TvlCap.deploy(cap)) as unknown as TvlCapDepositAccessControl;
      await vault.connect(owner).setDepositAccessControl(await depositGate.getAddress());
      return { vault, depositGate };
    }

    it("denies deposits when TVL is at cap", async function () {
      const cap = DEPOSIT_AMOUNT;
      const { vault } = await deployTvlCapVault(cap);

      const loSigner = await impersonateLo(liquidityOrchestrator);
      await vault.connect(loSigner).updateVaultState([], [], cap);

      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("denies a single deposit request far above the cap at zero TVL", async function () {
      const cap = DEPOSIT_AMOUNT;
      const { vault } = await deployTvlCapVault(cap);
      const overshoot = parseUnderlying("100000");

      await fundAndApprove(mockAsset, vault, user1, overshoot);
      await expect(vault.connect(user1).requestDeposit(overshoot)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("allows a deposit request that exactly fills the cap at zero TVL", async function () {
      const cap = DEPOSIT_AMOUNT;
      const { vault } = await deployTvlCapVault(cap);

      await fundAndApprove(mockAsset, vault, user1, cap);
      await expect(vault.connect(user1).requestDeposit(cap)).to.emit(vault, "DepositRequest");
    });

    it("denies a deposit that would exceed cap given partial settled TVL", async function () {
      const cap = DEPOSIT_AMOUNT;
      const settledTvl = parseUnderlying("40");
      const requestAmount = parseUnderlying("70");
      const { vault } = await deployTvlCapVault(cap);

      const loSigner = await impersonateLo(liquidityOrchestrator);
      await vault.connect(loSigner).updateVaultState([], [], settledTvl);

      await fundAndApprove(mockAsset, vault, user1, requestAmount);
      await expect(vault.connect(user1).requestDeposit(requestAmount)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("denies a second queued deposit when pending plus request exceeds cap", async function () {
      const cap = DEPOSIT_AMOUNT;
      const queueAmount = parseUnderlying("90");
      const { vault } = await deployTvlCapVault(cap);

      await fundAndApprove(mockAsset, vault, user1, queueAmount);
      await expect(vault.connect(user1).requestDeposit(queueAmount)).to.emit(vault, "DepositRequest");

      await fundAndApprove(mockAsset, vault, user2, queueAmount);
      await expect(vault.connect(user2).requestDeposit(queueAmount)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("allows requestDepositFor from a router when the deposit fits the cap", async function () {
      const cap = DEPOSIT_AMOUNT;
      const { vault } = await deployTvlCapVault(cap);
      const router = user2;

      await mockAsset.mint(router.address, cap);
      await mockAsset.connect(router).approve(await vault.getAddress(), cap);

      await expect(vault.connect(router).requestDepositFor(user1.address, cap))
        .to.emit(vault, "DepositRequest")
        .withArgs(user1.address, cap);
    });

    it("denies requestDepositFor from a router when the deposit exceeds the cap", async function () {
      const cap = DEPOSIT_AMOUNT;
      const { vault } = await deployTvlCapVault(cap);
      const overshoot = parseUnderlying("100000");
      const router = user2;

      await mockAsset.mint(router.address, overshoot);
      await mockAsset.connect(router).approve(await vault.getAddress(), overshoot);

      await expect(vault.connect(router).requestDepositFor(user1.address, overshoot)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("allows router-routed deposits that exactly fill the cap", async function () {
      const cap = DEPOSIT_AMOUNT;
      const { vault } = await deployTvlCapVault(cap);

      const Router = await ethers.getContractFactory("OrionDistributionRouter");
      const orionConfigAddress = await vault.config();
      const router = await Router.deploy(orionConfigAddress);

      await mockAsset.mint(user1.address, cap);
      await mockAsset.connect(user1).approve(await router.getAddress(), cap);

      await expect(
        router.connect(user1).requestDepositWithDistribution(await vault.getAddress(), ethers.id("partner-a"), cap),
      )
        .to.emit(vault, "DepositRequest")
        .withArgs(user1.address, cap);
    });

    it("denies router-routed deposits that exceed the cap", async function () {
      const cap = DEPOSIT_AMOUNT;
      const { vault } = await deployTvlCapVault(cap);
      const overshoot = parseUnderlying("100000");

      const Router = await ethers.getContractFactory("OrionDistributionRouter");
      const orionConfigAddress = await vault.config();
      const router = await Router.deploy(orionConfigAddress);

      await mockAsset.mint(user1.address, overshoot);
      await mockAsset.connect(user1).approve(await router.getAddress(), overshoot);

      await expect(
        router
          .connect(user1)
          .requestDepositWithDistribution(await vault.getAddress(), ethers.id("partner-a"), overshoot),
      ).to.be.revertedWithCustomError(vault, "DepositNotAllowed");
    });
  });
});
