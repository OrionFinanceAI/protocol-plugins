import { expect } from "chai";
import { ethers } from "../helpers/hh";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  OrionTransparentVault,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";
import type { WhitelistAccessControl } from "../../types/ethers-contracts/index.js";
import { deployUpgradeableProtocol } from "../helpers/deployUpgradeable";
import { resetNetwork } from "../helpers/resetNetwork";
import { createVaultWithGates, impersonateLo, parseUnderlying, requestAndFulfill } from "./helpers/vaultAccessControl";

describe("WhitelistAccessControl", function () {
  let owner: SignerWithAddress;
  let strategist: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let mockAsset: MockUnderlyingAsset;
  let factory: TransparentVaultFactory;
  let liquidityOrchestrator: LiquidityOrchestrator;
  let accessControl: WhitelistAccessControl;

  const DEPOSIT_AMOUNT = parseUnderlying("1000");

  before(async function () {
    await resetNetwork();
  });

  beforeEach(async function () {
    [owner, strategist, user1, user2, user3] = await ethers.getSigners();

    const deployed = await deployUpgradeableProtocol(owner);
    mockAsset = deployed.underlyingAsset;
    factory = deployed.transparentVaultFactory;
    liquidityOrchestrator = deployed.liquidityOrchestrator;

    const WhitelistAccessControlFactory = await ethers.getContractFactory("WhitelistAccessControl");
    accessControl = (await WhitelistAccessControlFactory.deploy(owner.address)) as unknown as WhitelistAccessControl;
  });

  describe("Permissionless Mode (address(0))", function () {
    let vault: OrionTransparentVault;

    beforeEach(async function () {
      vault = await createVaultWithGates(factory, owner, strategist.address);
    });

    it("Should allow any user to deposit when access control is zero address", async function () {
      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.mint(user2.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await mockAsset.connect(user2).approve(await vault.getAddress(), DEPOSIT_AMOUNT);

      await vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT);
      await vault.connect(user2).requestDeposit(DEPOSIT_AMOUNT);
    });

    it("Should return zero address for all gate slots", async function () {
      expect(await vault.depositAccessControl()).to.equal(ethers.ZeroAddress);
      expect(await vault.holderAccessControl()).to.equal(ethers.ZeroAddress);
      expect(await vault.transferAccessControl()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Deposit gate only", function () {
    let vault: OrionTransparentVault;

    beforeEach(async function () {
      const aclAddress = await accessControl.getAddress();
      vault = await createVaultWithGates(factory, owner, strategist.address, aclAddress);
    });

    it("Should allow whitelisted user to deposit", async function () {
      await accessControl.addToWhitelist([user1.address]);
      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT);
    });

    it("Should reject non-whitelisted user deposit", async function () {
      await mockAsset.mint(user2.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user2).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user2).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("Should leave share transfers unrestricted when holder/transfer gates are unset", async function () {
      await accessControl.addToWhitelist([user1.address]);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await vault.connect(user1).transfer(user2.address, shares / 2n);
      expect(await vault.balanceOf(user2.address)).to.equal(shares / 2n);
    });
  });

  describe("All gates enabled", function () {
    let vault: OrionTransparentVault;

    beforeEach(async function () {
      const aclAddress = await accessControl.getAddress();
      vault = await createVaultWithGates(factory, owner, strategist.address, aclAddress, aclAddress, aclAddress);
      await accessControl.addToWhitelist([user1.address, user2.address]);
    });

    it("Should allow whitelisted to whitelisted transfer", async function () {
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).transfer(user2.address, shares / 4n);
      expect(await vault.balanceOf(user2.address)).to.equal(shares / 4n);
    });

    it("Should reject transfer to non-whitelisted recipient", async function () {
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);
      await expect(vault.connect(user1).transfer(user3.address, shares / 4n)).to.be.revertedWithCustomError(
        vault,
        "ShareTransferNotAllowed",
      );
    });

    it("Should allow redeem with share gates set", async function () {
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await vault.connect(user1).approve(await vault.getAddress(), shares);
      await vault.connect(user1).requestRedeem(shares);

      const loSigner = await impersonateLo(liquidityOrchestrator);
      await mockAsset.mint(await liquidityOrchestrator.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(loSigner).fulfillRedeem(DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user1.address)).to.equal(0n);
    });

    it("Should return maxDeposit 0 when holder gate denies", async function () {
      await accessControl.removeFromWhitelist([user1.address]);
      expect(await vault.maxDeposit(user1.address)).to.equal(0n);
    });
  });

  describe("Manager Can Update Access Control", function () {
    let vault: OrionTransparentVault;

    beforeEach(async function () {
      vault = await createVaultWithGates(factory, owner, strategist.address);
    });

    it("Should allow manager to set all gate slots", async function () {
      const aclAddress = await accessControl.getAddress();
      await vault.connect(owner).setDepositAccessControl(aclAddress);
      await vault.connect(owner).setHolderAccessControl(aclAddress);
      await vault.connect(owner).setTransferAccessControl(aclAddress);

      expect(await vault.depositAccessControl()).to.equal(aclAddress);
      expect(await vault.holderAccessControl()).to.equal(aclAddress);
      expect(await vault.transferAccessControl()).to.equal(aclAddress);
    });

    it("Should reject non-manager attempts to set access control", async function () {
      await expect(
        vault.connect(user1).setDepositAccessControl(await accessControl.getAddress()),
      ).to.be.revertedWithCustomError(vault, "NotAuthorized");
    });
  });

  describe("Access Control Contract Behavior", function () {
    it("Should allow owner to transfer ownership", async function () {
      await accessControl.connect(owner).transferOwnership(user1.address);
      await accessControl.connect(user1).acceptOwnership();
      expect(await accessControl.owner()).to.equal(user1.address);
    });
  });
});
