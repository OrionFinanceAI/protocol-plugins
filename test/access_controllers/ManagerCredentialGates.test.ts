import { expect } from "chai";
import { ethers } from "../helpers/hh";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";
import type {
  ManagerOnlyDepositAccessControl,
  NonTransferableSharesAccessControl,
  NftOwnerAccessControl,
  BlacklistRejectAccessControl,
} from "../../types/ethers-contracts/index.js";
import type {
  MockCredential721,
  MockBlacklistable,
} from "../../types/ethers-contracts/contracts/test/access_controllers/index.js";
import { deployUpgradeableProtocol } from "../helpers/deployUpgradeable";
import { resetNetwork } from "../helpers/resetNetwork";
import { createVaultWithGates, parseUnderlying, requestAndFulfill } from "./helpers/vaultAccessControl";

describe("Manager and credential gates", function () {
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

  describe("ManagerOnlyDepositAccessControl", function () {
    it("allows only the vault manager to request deposits", async function () {
      const vault = await createVaultWithGates(factory, owner, strategist.address);
      const ManagerOnly = await ethers.getContractFactory("ManagerOnlyDepositAccessControl");
      const depositGate = (await ManagerOnly.deploy()) as unknown as ManagerOnlyDepositAccessControl;

      await vault.connect(owner).setDepositAccessControl(await depositGate.getAddress());

      await mockAsset.mint(owner.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(owner).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(owner).requestDeposit(DEPOSIT_AMOUNT)).to.emit(vault, "DepositRequest");

      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });
  });

  describe("NftOwnerAccessControl", function () {
    it("allows only NFT credential holders", async function () {
      const MockNft = await ethers.getContractFactory("MockCredential721");
      const nft = (await MockNft.deploy()) as unknown as MockCredential721;
      const NftGate = await ethers.getContractFactory("NftOwnerAccessControl");
      const gate = (await NftGate.deploy(await nft.getAddress())) as unknown as NftOwnerAccessControl;
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await nft.mint(user1.address);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);

      await mockAsset.mint(user2.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user2).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user2).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });
  });

  describe("BlacklistRejectAccessControl", function () {
    it("rejects blacklisted accounts", async function () {
      const MockDenylist = await ethers.getContractFactory("MockBlacklistable");
      const denylist = (await MockDenylist.deploy()) as unknown as MockBlacklistable;
      const BlacklistGate = await ethers.getContractFactory("BlacklistRejectAccessControl");
      const gate = (await BlacklistGate.deploy(await denylist.getAddress())) as unknown as BlacklistRejectAccessControl;
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await denylist.setBlacklisted(user1.address, true);
      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );

      await denylist.setBlacklisted(user2.address, false);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user2, DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user2.address)).to.be.gt(0n);
    });
  });

  describe("NonTransferableSharesAccessControl", function () {
    it("blocks P2P transfers but allows redeem", async function () {
      const Whitelist = await ethers.getContractFactory("WhitelistAccessControl");
      const whitelist = await Whitelist.deploy(owner.address);
      await whitelist.addToWhitelist([user1.address, user2.address]);

      const NonTransferable = await ethers.getContractFactory("NonTransferableSharesAccessControl");
      const transferGate = (await NonTransferable.deploy()) as unknown as NonTransferableSharesAccessControl;

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        await whitelist.getAddress(),
        await whitelist.getAddress(),
        await transferGate.getAddress(),
      );

      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await expect(vault.connect(user1).transfer(user2.address, shares / 2n)).to.be.revertedWithCustomError(
        vault,
        "ShareTransferNotAllowed",
      );

      await vault.connect(user1).approve(await vault.getAddress(), shares);
      await expect(vault.connect(user1).requestRedeem(shares)).to.emit(vault, "RedeemRequest");
    });
  });
});
