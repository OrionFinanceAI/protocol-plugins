import { expect } from "chai";
import { ethers } from "../helpers/hh";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LiquidityOrchestrator,
  MockUnderlyingAsset,
  TransparentVaultFactory,
} from "@orion-finance/protocol/types/ethers-contracts/index.js";
import type {
  SignedTicketAccessControl,
  EasAccessControl,
  EnsSubtreeAccessControl,
} from "../../types/ethers-contracts/index.js";
import type {
  MockEnsRegistry,
  MockEnsResolver,
  MockEAS,
} from "../../types/ethers-contracts/contracts/test/access_controllers/index.js";
import { deployUpgradeableProtocol } from "../helpers/deployUpgradeable";
import { resetNetwork } from "../helpers/resetNetwork";
import { createVaultWithGates, parseUnderlying, requestAndFulfill } from "./helpers/vaultAccessControl";
import { signSignedTicket } from "./helpers/signedTicket";
import {
  MOCK_TOTP,
  ORION_DOMAIN_HASH,
  countryCodeBytes2,
  createEmailDomainAttestation,
  createNationalityAttestation,
  createRawEmailDomainAttestation,
  encodeEmailDomainData,
} from "./helpers/easIdp";

describe("Attestation gates", function () {
  let owner: SignerWithAddress;
  let attester: SignerWithAddress;
  let idp: SignerWithAddress;
  let strategist: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let mockAsset: MockUnderlyingAsset;
  let factory: TransparentVaultFactory;
  let liquidityOrchestrator: LiquidityOrchestrator;

  const DEPOSIT_AMOUNT = parseUnderlying("100");
  const SIGNED_TICKET_DOMAIN = { name: "OrionSignedTicket", version: "1" };
  const EMAIL_DOMAIN_SCHEMA_UID = ethers.id("orion-email-domain-schema");
  const NATIONALITY_SCHEMA_UID = ethers.id("orion-nationality-schema");
  const POLICY_EMAIL_DOMAIN = 0;
  const POLICY_NATIONALITY = 1;

  before(async function () {
    await resetNetwork();
  });

  beforeEach(async function () {
    [owner, attester, idp, strategist, user1, user2] = await ethers.getSigners();
    const deployed = await deployUpgradeableProtocol(owner);
    mockAsset = deployed.underlyingAsset;
    factory = deployed.transparentVaultFactory;
    liquidityOrchestrator = deployed.liquidityOrchestrator;
  });

  describe("SignedTicketAccessControl", function () {
    it("allows deposit only after submitSignedTicket", async function () {
      const SignedTicket = await ethers.getContractFactory("SignedTicketAccessControl");
      const gate = (await SignedTicket.deploy(
        attester.address,
        SIGNED_TICKET_DOMAIN.name,
        SIGNED_TICKET_DOMAIN.version,
      )) as unknown as SignedTicketAccessControl;
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await mockAsset.mint(user2.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user2).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user2).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );

      const expiry = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
      const claimHash = ethers.keccak256(ethers.toUtf8Bytes("user@orionfinance.ai"));
      const ticket = await signSignedTicket(
        attester,
        gateAddress,
        { wallet: user1.address, claimHash, expiry },
        SIGNED_TICKET_DOMAIN,
      );

      await gate.connect(user1).submitSignedTicket(ticket);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user1.address)).to.be.gt(0n);
    });
  });

  describe("EasAccessControl — email domain + mock 2FA", function () {
    async function deployEmailDomainGate(mockEas: MockEAS): Promise<EasAccessControl> {
      const Eas = await ethers.getContractFactory("EasAccessControl");
      return (await Eas.deploy(
        owner.address,
        await mockEas.getAddress(),
        EMAIL_DOMAIN_SCHEMA_UID,
        [idp.address],
        POLICY_EMAIL_DOMAIN,
        ORION_DOMAIN_HASH,
        [],
      )) as unknown as EasAccessControl;
    }

    it("allows deposit after IdP attestation with valid 2FA and @orionfinance.ai", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailDomainGate(mockEas);
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      const uid = await createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
        email: "alice@orionfinance.ai",
        totp: MOCK_TOTP,
      });

      await gate.connect(user1).registerAttestation(uid);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user1.address)).to.be.gt(0n);
    });

    it("blocks deposit when mock 2FA fails", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailDomainGate(mockEas);
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await expect(
        createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
          email: "alice@orionfinance.ai",
          totp: "000000",
        }),
      ).to.be.rejectedWith("2FA failed");

      const failed2faData = encodeEmailDomainData(ORION_DOMAIN_HASH, false, true);
      const uid = await createRawEmailDomainAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        failed2faData,
      );
      await expect(gate.connect(user1).registerAttestation(uid)).to.be.revertedWithCustomError(gate, "PolicyDenied");

      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("blocks deposit when email domain is not @orionfinance.ai", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailDomainGate(mockEas);
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await expect(
        createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
          email: "alice@gmail.com",
          totp: MOCK_TOTP,
        }),
      ).to.be.rejectedWith("bad domain");

      const wrongDomainData = encodeEmailDomainData(ethers.id("gmail.com"));
      const uid = await createRawEmailDomainAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        wrongDomainData,
      );
      await expect(gate.connect(user1).registerAttestation(uid)).to.be.revertedWithCustomError(gate, "PolicyDenied");

      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });

    it("reverts registerAttestation when attestation data has wrong domain hash", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailDomainGate(mockEas);

      const wrongDomainData = encodeEmailDomainData(ethers.id("gmail.com"));
      const uid = await createRawEmailDomainAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        wrongDomainData,
      );

      await expect(gate.connect(user1).registerAttestation(uid)).to.be.revertedWithCustomError(gate, "PolicyDenied");
    });

    it("blocks deposit after EAS attestation is revoked", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailDomainGate(mockEas);
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      const uid = await createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
        email: "alice@orionfinance.ai",
        totp: MOCK_TOTP,
      });
      await gate.connect(user1).registerAttestation(uid);

      await mockEas.revoke(uid);

      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );
    });
  });

  describe("EasAccessControl — nationality + mock 2FA", function () {
    async function deployNationalityGate(mockEas: MockEAS): Promise<EasAccessControl> {
      const Eas = await ethers.getContractFactory("EasAccessControl");
      return (await Eas.deploy(
        owner.address,
        await mockEas.getAddress(),
        NATIONALITY_SCHEMA_UID,
        [idp.address],
        POLICY_NATIONALITY,
        ethers.ZeroHash,
        [countryCodeBytes2("IT"), countryCodeBytes2("DE")],
      )) as unknown as EasAccessControl;
    }

    it("allows deposit for allowed nationality after mock 2FA", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployNationalityGate(mockEas);
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      const uid = await createNationalityAttestation(mockEas, idp.address, user1.address, NATIONALITY_SCHEMA_UID, {
        countryCode: "IT",
        totp: MOCK_TOTP,
        allowedCountries: ["IT", "DE", "US"],
      });

      await gate.connect(user1).registerAttestation(uid);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user1.address)).to.be.gt(0n);
    });

    it("reverts registerAttestation for nationality not on gate allowlist", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployNationalityGate(mockEas);

      const uid = await createNationalityAttestation(mockEas, idp.address, user1.address, NATIONALITY_SCHEMA_UID, {
        countryCode: "US",
        totp: MOCK_TOTP,
        allowedCountries: ["IT", "DE", "US"],
      });

      await expect(gate.connect(user1).registerAttestation(uid)).to.be.revertedWithCustomError(gate, "PolicyDenied");
    });
  });

  describe("EnsSubtreeAccessControl", function () {
    it("allows deposit after registerEnsNode under the root", async function () {
      const rootNode = ethers.id("orionfinance.ai-root");
      const userNode = ethers.id("alice.orionfinance.ai");

      const MockRegistry = await ethers.getContractFactory("MockEnsRegistry");
      const registry = (await MockRegistry.deploy()) as unknown as MockEnsRegistry;
      const MockResolver = await ethers.getContractFactory("MockEnsResolver");
      const resolver = (await MockResolver.deploy()) as unknown as MockEnsResolver;

      await registry.setResolver(userNode, await resolver.getAddress());
      await registry.setParent(userNode, rootNode);
      await resolver.setAddr(userNode, user1.address);

      const EnsGate = await ethers.getContractFactory("EnsSubtreeAccessControl");
      const gate = (await EnsGate.deploy(await registry.getAddress(), rootNode)) as unknown as EnsSubtreeAccessControl;
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await mockAsset.mint(user1.address, DEPOSIT_AMOUNT);
      await mockAsset.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await expect(vault.connect(user1).requestDeposit(DEPOSIT_AMOUNT)).to.be.revertedWithCustomError(
        vault,
        "DepositNotAllowed",
      );

      await gate.connect(user1).registerEnsNode(userNode);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user1.address)).to.be.gt(0n);
    });

    it("denies access when ENS resolution changes after registration", async function () {
      const rootNode = ethers.id("orionfinance.ai-root");
      const userNode = ethers.id("alice.orionfinance.ai");

      const MockRegistry = await ethers.getContractFactory("MockEnsRegistry");
      const registry = (await MockRegistry.deploy()) as unknown as MockEnsRegistry;
      const MockResolver = await ethers.getContractFactory("MockEnsResolver");
      const resolver = (await MockResolver.deploy()) as unknown as MockEnsResolver;

      await registry.setResolver(userNode, await resolver.getAddress());
      await registry.setParent(userNode, rootNode);
      await resolver.setAddr(userNode, user1.address);

      const EnsGate = await ethers.getContractFactory("EnsSubtreeAccessControl");
      const gate = (await EnsGate.deploy(await registry.getAddress(), rootNode)) as unknown as EnsSubtreeAccessControl;
      const gateAddress = await gate.getAddress();

      const vault = await createVaultWithGates(
        factory,
        owner,
        strategist.address,
        gateAddress,
        gateAddress,
        gateAddress,
      );

      await gate.connect(user1).registerEnsNode(userNode);
      await requestAndFulfill(mockAsset, liquidityOrchestrator, vault, user1, DEPOSIT_AMOUNT);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);

      await resolver.setAddr(userNode, user2.address);
      expect(await gate.canHoldShares(user1.address)).to.equal(false);

      await resolver.setAddr(userNode, user1.address);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);

      await registry.setParent(userNode, ethers.id("other-root"));
      expect(await gate.canHoldShares(user1.address)).to.equal(false);

      await registry.setParent(userNode, rootNode);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);

      await registry.setResolver(userNode, ethers.ZeroAddress);
      expect(await gate.canHoldShares(user1.address)).to.equal(false);
    });
  });
});
