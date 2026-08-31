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
import { createVaultWithGates, impersonateLo, parseUnderlying, requestAndFulfill } from "./helpers/vaultAccessControl";

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
    });
  });

  describe("TvlCapDepositAccessControl", function () {
    it("denies deposits when TVL is at cap", async function () {
      const vault = await createVaultWithGates(factory, owner, strategist.address);
      const cap = DEPOSIT_AMOUNT;

      const TvlCap = await ethers.getContractFactory("TvlCapDepositAccessControl");
      const depositGate = (await TvlCap.deploy(cap)) as unknown as TvlCapDepositAccessControl;
      await vault.connect(owner).setDepositAccessControl(await depositGate.getAddress());

      const loSigner = await impersonateLo(liquidityOrchestrator);
      await vault.connect(loSigner).updateVaultState([], [], cap);

      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });
  });
});
