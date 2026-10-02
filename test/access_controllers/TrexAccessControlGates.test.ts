import { expect } from "chai";
import { ethers } from "../helpers/hh";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  OrionTransparentVault,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";
import type { TrexAccessControl } from "../../types/ethers-contracts/index.js";
import type {
  MockIdentityRegistry,
  MockModularCompliance,
  OrionAclInterfaceIds,
} from "../../types/ethers-contracts/contracts/test/access_controllers/index.js";
import { deployUpgradeableProtocol } from "../helpers/deployUpgradeable";
import { resetNetwork } from "../helpers/resetNetwork";
import { createVaultWithGates, fundAndApprove, parseUnderlying, requestAndFulfill } from "./helpers/vaultAccessControl";

describe("TrexAccessControl", function () {
  let owner: SignerWithAddress;
  let strategist: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let mockAsset: MockUnderlyingAsset;
  let factory: TransparentVaultFactory;
  let liquidityOrchestrator: LiquidityOrchestrator;
  let identityRegistry: MockIdentityRegistry;
  let compliance: MockModularCompliance;
  let gate: TrexAccessControl;

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

    const MockIr = await ethers.getContractFactory("MockIdentityRegistry");
    identityRegistry = (await MockIr.deploy()) as unknown as MockIdentityRegistry;

    const MockMc = await ethers.getContractFactory("MockModularCompliance");
    compliance = (await MockMc.deploy()) as unknown as MockModularCompliance;

    const Trex = await ethers.getContractFactory("TrexAccessControl");
    gate = (await Trex.deploy(await identityRegistry.getAddress(), ethers.ZeroAddress)) as unknown as TrexAccessControl;
  });

  describe("construction and ERC-165", function () {
    it("reports Orion ACL interface IDs matching protocol", async function () {
      const Ids = await ethers.getContractFactory("OrionAclInterfaceIds");
      const ids = (await Ids.deploy()) as unknown as OrionAclInterfaceIds;

      expect(await gate.supportsInterface(await ids.depositInterfaceId())).to.equal(true);
      expect(await gate.supportsInterface(await ids.holderInterfaceId())).to.equal(true);
      expect(await gate.supportsInterface(await ids.transferInterfaceId())).to.equal(true);
      expect(await gate.supportsInterface("0x01ffc9a7")).to.equal(true);
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("identity-only vault gates", function () {
    let vault: OrionTransparentVault;
    let gateAddress: string;

    beforeEach(async function () {
      gateAddress = await gate.getAddress();
      vault = await createVaultWithGates(factory, owner, strategist.address, gateAddress, gateAddress, gateAddress);
    });

    it("rejects unverified depositors", async function () {
      await fundAndApprove(mockAsset, vault, user1, DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("allows verified deposit and fulfill", async function () {
      await identityRegistry.setVerified(user1.address, true);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user1.address)).to.be.gt(0n);
    });

    it("allows transfer between verified wallets", async function () {
      await identityRegistry.setVerified(user1.address, true);
      await identityRegistry.setVerified(user2.address, true);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await vault.connect(user1).transfer(user2.address, shares / 2n);
      expect(await vault.balanceOf(user2.address)).to.equal(shares / 2n);
    });

    it("blocks transfer to an unverified recipient", async function () {
      await identityRegistry.setVerified(user1.address, true);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await expect(vault.connect(user1).transfer(user2.address, shares / 2n)).to.be.revertedWithCustomError(
        vault,
        "ShareTransferNotAllowed",
      );
    });

    it("blocks transfer after sender verification is revoked", async function () {
      await identityRegistry.setVerified(user1.address, true);
      await identityRegistry.setVerified(user2.address, true);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await identityRegistry.setVerified(user1.address, false);
      await expect(vault.connect(user1).transfer(user2.address, shares / 2n)).to.be.revertedWithCustomError(
        vault,
        "ShareTransferNotAllowed",
      );
    });

    it("still allows redeem when transfer is gated", async function () {
      await identityRegistry.setVerified(user1.address, true);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await vault.connect(user1).approve(await vault.getAddress(), shares);
      await expect(vault.connect(user1).requestRedeem(shares)).to.emit(vault, "RedeemRequest");
    });
  });

  describe("optional ModularCompliance", function () {
    it("blocks transfer when canTransfer returns false", async function () {
      const Trex = await ethers.getContractFactory("TrexAccessControl");
      const gated = (await Trex.deploy(
        await identityRegistry.getAddress(),
        await compliance.getAddress(),
      )) as unknown as TrexAccessControl;
      const gateAddress = await gated.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await identityRegistry.setVerified(user1.address, true);
      await identityRegistry.setVerified(user2.address, true);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      const shares = await vault.balanceOf(user1.address);

      await compliance.setPairDenied(user1.address, user2.address, true);
      await expect(vault.connect(user1).transfer(user2.address, shares / 2n)).to.be.revertedWithCustomError(
        vault,
        "ShareTransferNotAllowed",
      );

      await compliance.setPairDenied(user1.address, user2.address, false);
      await vault.connect(user1).transfer(user2.address, shares / 2n);
      expect(await vault.balanceOf(user2.address)).to.equal(shares / 2n);
    });

    it("enforces canTransfer without relying on transfer calldata", async function () {
      const Trex = await ethers.getContractFactory("TrexAccessControl");
      const gated = (await Trex.deploy(
        await identityRegistry.getAddress(),
        await compliance.getAddress(),
      )) as unknown as TrexAccessControl;

      await identityRegistry.setVerified(user1.address, true);
      await identityRegistry.setVerified(user2.address, true);

      await compliance.setPairDenied(user1.address, user2.address, true);
      expect(await gated.canTransferShares(user1.address, user2.address, 1n, "0x")).to.equal(false);

      await compliance.setPairDenied(user1.address, user2.address, false);
      expect(await gated.canTransferShares(user1.address, user2.address, 1n, "0x")).to.equal(true);
    });
  });

  describe("direct gate views", function () {
    it("returns false for zero address and unverified accounts", async function () {
      expect(await gate.canRequestDeposit(ethers.ZeroAddress, "0x")).to.equal(false);
      expect(await gate.canHoldShares(user1.address)).to.equal(false);
      expect(await gate.canTransferShares(user1.address, user2.address, 0n, "0x")).to.equal(false);

      await identityRegistry.setVerified(user1.address, true);
      expect(await gate.canRequestDeposit(user1.address, "0x")).to.equal(true);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);
      expect(await gate.canTransferShares(user1.address, user2.address, 0n, "0x")).to.equal(true);
    });
  });
});
