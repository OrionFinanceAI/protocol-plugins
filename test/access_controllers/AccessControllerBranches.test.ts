import { expect } from "chai";
import { ethers } from "../helpers/hh";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  AllOfDepositAccessControl,
  BlacklistRejectAccessControl,
  EasAccessControl,
  EnsSubtreeAccessControl,
  NftOwnerAccessControl,
  SignedTicketAccessControl,
  TvlCapDepositAccessControl,
} from "../../types/ethers-contracts/index.js";
import type {
  MockBlacklistable,
  MockCredential721,
  MockEAS,
  MockEnsRegistry,
  MockEnsResolver,
} from "../../types/ethers-contracts/contracts/test/access_controllers/index.js";
import { resetNetwork } from "../helpers/resetNetwork";
import { signSignedTicket } from "./helpers/signedTicket";
import {
  MOCK_TOTP,
  ORION_DOMAIN_HASH,
  createEmailDomainAttestation,
  createNationalityAttestation,
  createRawAttestation,
  createRawEmailDomainAttestation,
  encodeEmailDomainData,
  encodeNationalityData,
} from "./helpers/easIdp";

const EMAIL_DOMAIN_SCHEMA_UID = ethers.id("orion-email-domain-schema");
const NATIONALITY_SCHEMA_UID = ethers.id("orion-nationality-schema");
const POLICY_EMAIL_DOMAIN = 0;
const POLICY_NATIONALITY = 1;
const SIGNED_TICKET_DOMAIN = { name: "OrionSignedTicket", version: "1" };

describe("Access controller branch coverage", function () {
  let owner: SignerWithAddress;
  let idp: SignerWithAddress;
  let attester: SignerWithAddress;
  let user1: SignerWithAddress;
  let stranger: SignerWithAddress;

  before(async function () {
    await resetNetwork();
  });

  beforeEach(async function () {
    [owner, idp, attester, user1, stranger] = await ethers.getSigners();
  });

  describe("EasAccessControl", function () {
    async function deployEmailGate(
      mockEas: MockEAS,
      domainHash: string = ORION_DOMAIN_HASH,
    ): Promise<EasAccessControl> {
      const Eas = await ethers.getContractFactory("EasAccessControl");
      return (await Eas.deploy(
        owner.address,
        await mockEas.getAddress(),
        EMAIL_DOMAIN_SCHEMA_UID,
        [idp.address],
        POLICY_EMAIL_DOMAIN,
        domainHash,
        [],
      )) as unknown as EasAccessControl;
    }

    it("reverts on invalid constructor args", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const Eas = await ethers.getContractFactory("EasAccessControl");

      await expect(
        Eas.deploy(
          owner.address,
          ethers.ZeroAddress,
          EMAIL_DOMAIN_SCHEMA_UID,
          [idp.address],
          POLICY_EMAIL_DOMAIN,
          ORION_DOMAIN_HASH,
          [],
        ),
      ).to.be.revertedWithCustomError(Eas, "InvalidEas");

      await expect(
        Eas.deploy(
          owner.address,
          await mockEas.getAddress(),
          ethers.ZeroHash,
          [idp.address],
          POLICY_EMAIL_DOMAIN,
          ORION_DOMAIN_HASH,
          [],
        ),
      ).to.be.revertedWithCustomError(Eas, "InvalidSchema");

      await expect(
        Eas.deploy(
          owner.address,
          await mockEas.getAddress(),
          EMAIL_DOMAIN_SCHEMA_UID,
          [],
          POLICY_EMAIL_DOMAIN,
          ORION_DOMAIN_HASH,
          [],
        ),
      ).to.be.revertedWithCustomError(Eas, "InvalidAttester");

      await expect(
        Eas.deploy(
          owner.address,
          await mockEas.getAddress(),
          EMAIL_DOMAIN_SCHEMA_UID,
          [ethers.ZeroAddress],
          POLICY_EMAIL_DOMAIN,
          ORION_DOMAIN_HASH,
          [],
        ),
      ).to.be.revertedWithCustomError(Eas, "InvalidAttester");
    });

    it("reverts registerAttestation for empty, wrong schema, wrong recipient, untrusted attester", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailGate(mockEas);

      await expect(gate.connect(user1).registerAttestation(ethers.ZeroHash)).to.be.revertedWithCustomError(
        gate,
        "InvalidAttestation",
      );

      const wrongSchemaUid = await createRawEmailDomainAttestation(
        mockEas,
        idp.address,
        user1.address,
        ethers.id("other-schema"),
        encodeEmailDomainData(),
      );
      await expect(gate.connect(user1).registerAttestation(wrongSchemaUid)).to.be.revertedWithCustomError(
        gate,
        "InvalidSchema",
      );

      const otherRecipientUid = await createEmailDomainAttestation(
        mockEas,
        idp.address,
        stranger.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        { email: "bob@orionfinance.ai", totp: MOCK_TOTP },
      );
      await expect(gate.connect(user1).registerAttestation(otherRecipientUid)).to.be.revertedWithCustomError(
        gate,
        "InvalidRecipient",
      );

      const untrustedUid = await createRawEmailDomainAttestation(
        mockEas,
        stranger.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        encodeEmailDomainData(),
      );
      await expect(gate.connect(user1).registerAttestation(untrustedUid)).to.be.revertedWithCustomError(
        gate,
        "UntrustedAttester",
      );
    });

    it("rejects expired attestations and incomplete email-domain policy data", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailGate(mockEas);

      const past = BigInt((await ethers.provider.getBlock("latest"))!.timestamp - 1);
      const expiredUid = await createRawAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        encodeEmailDomainData(),
        Number(past),
      );
      await expect(gate.connect(user1).registerAttestation(expiredUid)).to.be.revertedWithCustomError(
        gate,
        "InvalidAttestation",
      );

      const emptyDataUid = await createRawAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        "0x",
      );
      await expect(gate.connect(user1).registerAttestation(emptyDataUid)).to.be.revertedWithCustomError(
        gate,
        "PolicyDenied",
      );

      const no2faUid = await createRawEmailDomainAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        encodeEmailDomainData(ORION_DOMAIN_HASH, false, true),
      );
      await expect(gate.connect(user1).registerAttestation(no2faUid)).to.be.revertedWithCustomError(
        gate,
        "PolicyDenied",
      );

      const ineligibleUid = await createRawEmailDomainAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        encodeEmailDomainData(ORION_DOMAIN_HASH, true, false),
      );
      await expect(gate.connect(user1).registerAttestation(ineligibleUid)).to.be.revertedWithCustomError(
        gate,
        "PolicyDenied",
      );
    });

    it("skips email domain check when required hash is zero and covers holder/transfer views", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailGate(mockEas, ethers.ZeroHash);

      const uid = await createRawEmailDomainAttestation(
        mockEas,
        idp.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        encodeEmailDomainData(ethers.id("any.domain")),
      );
      await gate.connect(user1).registerAttestation(uid);

      expect(await gate.canRequestDeposit(user1.address, "0x")).to.equal(true);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);
      expect(await gate.canTransferShares(user1.address, "0x")).to.equal(true);
      expect(await gate.canHoldShares(stranger.address)).to.equal(false);

      const depositIface = "0x" + ethers.id("canRequestDeposit(address,bytes)").slice(2, 10);
      expect(await gate.supportsInterface(depositIface)).to.equal(true);
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });

    it("covers nationality empty-data, flags, unrestricted countries, and holder views", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const Eas = await ethers.getContractFactory("EasAccessControl");

      const unrestricted = (await Eas.deploy(
        owner.address,
        await mockEas.getAddress(),
        NATIONALITY_SCHEMA_UID,
        [idp.address],
        POLICY_NATIONALITY,
        ethers.ZeroHash,
        [],
      )) as unknown as EasAccessControl;

      const emptyUid = await createRawAttestation(mockEas, idp.address, user1.address, NATIONALITY_SCHEMA_UID, "0x");
      await expect(unrestricted.connect(user1).registerAttestation(emptyUid)).to.be.revertedWithCustomError(
        unrestricted,
        "PolicyDenied",
      );

      const notAccreditedUid = await createRawAttestation(
        mockEas,
        idp.address,
        user1.address,
        NATIONALITY_SCHEMA_UID,
        encodeNationalityData("IT", false, true),
      );
      await expect(unrestricted.connect(user1).registerAttestation(notAccreditedUid)).to.be.revertedWithCustomError(
        unrestricted,
        "PolicyDenied",
      );

      const okUid = await createNationalityAttestation(mockEas, idp.address, user1.address, NATIONALITY_SCHEMA_UID, {
        countryCode: "FR",
        totp: MOCK_TOTP,
      });
      await unrestricted.connect(user1).registerAttestation(okUid);
      expect(await unrestricted.canHoldShares(user1.address)).to.equal(true);
      expect(await unrestricted.canTransferShares(user1.address, "0x")).to.equal(true);
    });

    it("denies views when a registered attestation is corrupted on EAS", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailGate(mockEas);

      const uid = await createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
        email: "alice@orionfinance.ai",
        totp: MOCK_TOTP,
      });
      await gate.connect(user1).registerAttestation(uid);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);

      await mockEas.corruptAttestation(uid, ethers.ZeroHash, EMAIL_DOMAIN_SCHEMA_UID, user1.address, idp.address);
      expect(await gate.canHoldShares(user1.address)).to.equal(false);

      const uid2 = await createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
        email: "alice@orionfinance.ai",
        totp: MOCK_TOTP,
      });
      await gate.connect(user1).registerAttestation(uid2);
      await mockEas.corruptAttestation(uid2, uid2, EMAIL_DOMAIN_SCHEMA_UID, stranger.address, idp.address);
      expect(await gate.canHoldShares(user1.address)).to.equal(false);

      const uid3 = await createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
        email: "alice@orionfinance.ai",
        totp: MOCK_TOTP,
      });
      await gate.connect(user1).registerAttestation(uid3);
      await mockEas.corruptAttestation(uid3, uid3, ethers.id("other-schema"), user1.address, idp.address);
      expect(await gate.canHoldShares(user1.address)).to.equal(false);

      const uid4 = await createEmailDomainAttestation(mockEas, idp.address, user1.address, EMAIL_DOMAIN_SCHEMA_UID, {
        email: "alice@orionfinance.ai",
        totp: MOCK_TOTP,
      });
      await gate.connect(user1).registerAttestation(uid4);
      await mockEas.corruptAttestation(uid4, uid4, EMAIL_DOMAIN_SCHEMA_UID, user1.address, stranger.address);
      expect(await gate.canHoldShares(user1.address)).to.equal(false);
    });

    it("allows owner to add and revoke trusted attesters", async function () {
      const MockEas = await ethers.getContractFactory("MockEAS");
      const mockEas = (await MockEas.deploy()) as unknown as MockEAS;
      const gate = await deployEmailGate(mockEas);

      await expect(gate.connect(stranger).setTrustedAttester(stranger.address, true))
        .to.be.revertedWithCustomError(gate, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);

      await expect(gate.connect(owner).setTrustedAttester(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        gate,
        "InvalidAttester",
      );

      await expect(gate.connect(owner).setTrustedAttester(stranger.address, true))
        .to.emit(gate, "TrustedAttesterSet")
        .withArgs(stranger.address, true);

      const uid = await createRawEmailDomainAttestation(
        mockEas,
        stranger.address,
        user1.address,
        EMAIL_DOMAIN_SCHEMA_UID,
        encodeEmailDomainData(),
      );
      await gate.connect(user1).registerAttestation(uid);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);

      await expect(gate.connect(owner).setTrustedAttester(stranger.address, false))
        .to.emit(gate, "TrustedAttesterSet")
        .withArgs(stranger.address, false);

      expect(await gate.canHoldShares(user1.address)).to.equal(false);

      await expect(gate.connect(user1).registerAttestation(uid)).to.be.revertedWithCustomError(
        gate,
        "UntrustedAttester",
      );
    });
  });

  describe("EnsSubtreeAccessControl", function () {
    it("reverts on invalid constructor and invalid registration", async function () {
      const MockRegistry = await ethers.getContractFactory("MockEnsRegistry");
      const registry = (await MockRegistry.deploy()) as unknown as MockEnsRegistry;
      const EnsGate = await ethers.getContractFactory("EnsSubtreeAccessControl");
      const rootNode = ethers.id("root");

      await expect(EnsGate.deploy(ethers.ZeroAddress, rootNode)).to.be.revertedWithCustomError(
        EnsGate,
        "InvalidRegistry",
      );
      await expect(EnsGate.deploy(await registry.getAddress(), ethers.ZeroHash)).to.be.revertedWithCustomError(
        EnsGate,
        "InvalidRootNode",
      );

      const gate = (await EnsGate.deploy(await registry.getAddress(), rootNode)) as unknown as EnsSubtreeAccessControl;

      await expect(gate.connect(user1).registerEnsNode(ethers.ZeroHash)).to.be.revertedWithCustomError(
        gate,
        "InvalidEnsNode",
      );

      const outsideNode = ethers.id("outside");
      await expect(gate.connect(user1).registerEnsNode(outsideNode)).to.be.revertedWithCustomError(
        gate,
        "InvalidEnsNode",
      );

      const noResolverNode = ethers.id("alice.orion");
      await registry.setParent(noResolverNode, rootNode);
      await expect(gate.connect(user1).registerEnsNode(noResolverNode)).to.be.revertedWithCustomError(
        gate,
        "InvalidEnsNode",
      );

      const MockResolver = await ethers.getContractFactory("MockEnsResolver");
      const resolver = (await MockResolver.deploy()) as unknown as MockEnsResolver;
      const wrongOwnerNode = ethers.id("bob.orion");
      await registry.setParent(wrongOwnerNode, rootNode);
      await registry.setResolver(wrongOwnerNode, await resolver.getAddress());
      await resolver.setAddr(wrongOwnerNode, stranger.address);
      await expect(gate.connect(user1).registerEnsNode(wrongOwnerNode)).to.be.revertedWithCustomError(
        gate,
        "InvalidEnsNode",
      );

      expect(await gate.canHoldShares(user1.address)).to.equal(false);
      expect(await gate.canTransferShares(user1.address, "0x")).to.equal(false);
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("SignedTicketAccessControl", function () {
    it("reverts on zero attester and invalid tickets; covers holder/transfer views", async function () {
      const SignedTicket = await ethers.getContractFactory("SignedTicketAccessControl");
      await expect(
        SignedTicket.deploy(ethers.ZeroAddress, SIGNED_TICKET_DOMAIN.name, SIGNED_TICKET_DOMAIN.version),
      ).to.be.revertedWithCustomError(SignedTicket, "InvalidAttester");

      const gate = (await SignedTicket.deploy(
        attester.address,
        SIGNED_TICKET_DOMAIN.name,
        SIGNED_TICKET_DOMAIN.version,
      )) as unknown as SignedTicketAccessControl;
      const gateAddress = await gate.getAddress();
      const expiry = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
      const claimHash = ethers.keccak256(ethers.toUtf8Bytes("claim"));

      await expect(
        gate.submitSignedTicket({
          wallet: ethers.ZeroAddress,
          claimHash,
          expiry,
          signature: "0x",
        }),
      ).to.be.revertedWithCustomError(gate, "InvalidTicket");

      const pastExpiry = BigInt((await ethers.provider.getBlock("latest"))!.timestamp - 1);
      const expired = await signSignedTicket(
        attester,
        gateAddress,
        { wallet: user1.address, claimHash, expiry: pastExpiry },
        SIGNED_TICKET_DOMAIN,
      );
      await expect(gate.submitSignedTicket(expired)).to.be.revertedWithCustomError(gate, "InvalidTicket");

      await expect(
        gate.submitSignedTicket({
          wallet: user1.address,
          claimHash,
          expiry,
          signature: "0x",
        }),
      ).to.be.revertedWithCustomError(gate, "InvalidTicket");

      const forged = await signSignedTicket(
        stranger,
        gateAddress,
        { wallet: user1.address, claimHash, expiry },
        SIGNED_TICKET_DOMAIN,
      );
      await expect(gate.submitSignedTicket(forged)).to.be.revertedWithCustomError(gate, "InvalidTicket");

      const valid = await signSignedTicket(
        attester,
        gateAddress,
        { wallet: user1.address, claimHash, expiry },
        SIGNED_TICKET_DOMAIN,
      );
      await gate.submitSignedTicket(valid);
      expect(await gate.canHoldShares(user1.address)).to.equal(true);
      expect(await gate.canTransferShares(user1.address, "0x")).to.equal(true);
      expect(await gate.canHoldShares(stranger.address)).to.equal(false);
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });

    it("rejects stale tickets that would reduce an existing expiry", async function () {
      const SignedTicket = await ethers.getContractFactory("SignedTicketAccessControl");
      const gate = (await SignedTicket.deploy(
        attester.address,
        SIGNED_TICKET_DOMAIN.name,
        SIGNED_TICKET_DOMAIN.version,
      )) as unknown as SignedTicketAccessControl;
      const gateAddress = await gate.getAddress();
      const baseExpiry = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 7200);
      const claimHashA = ethers.keccak256(ethers.toUtf8Bytes("claim-a"));
      const claimHashB = ethers.keccak256(ethers.toUtf8Bytes("claim-b"));

      const initial = await signSignedTicket(
        attester,
        gateAddress,
        { wallet: user1.address, claimHash: claimHashA, expiry: baseExpiry },
        SIGNED_TICKET_DOMAIN,
      );
      await gate.submitSignedTicket(initial);
      expect(await gate.ticketExpiry(user1.address)).to.equal(baseExpiry);
      expect(await gate.ticketClaimHash(user1.address)).to.equal(claimHashA);

      const sameExpiry = await signSignedTicket(
        attester,
        gateAddress,
        { wallet: user1.address, claimHash: claimHashB, expiry: baseExpiry },
        SIGNED_TICKET_DOMAIN,
      );
      await expect(gate.submitSignedTicket(sameExpiry)).to.be.revertedWithCustomError(gate, "StaleTicket");

      const shorterExpiry = await signSignedTicket(
        attester,
        gateAddress,
        { wallet: user1.address, claimHash: claimHashB, expiry: baseExpiry - 1n },
        SIGNED_TICKET_DOMAIN,
      );
      await expect(gate.submitSignedTicket(shorterExpiry)).to.be.revertedWithCustomError(gate, "StaleTicket");

      const extendedExpiry = await signSignedTicket(
        attester,
        gateAddress,
        { wallet: user1.address, claimHash: claimHashB, expiry: baseExpiry + 3600n },
        SIGNED_TICKET_DOMAIN,
      );
      await expect(gate.submitSignedTicket(extendedExpiry))
        .to.emit(gate, "SignedTicketSubmitted")
        .withArgs(user1.address, claimHashB, baseExpiry + 3600n);
      expect(await gate.ticketExpiry(user1.address)).to.equal(baseExpiry + 3600n);
      expect(await gate.ticketClaimHash(user1.address)).to.equal(claimHashB);
    });
  });

  describe("BlacklistRejectAccessControl", function () {
    it("covers zero address, reverting denylist, and supportsInterface", async function () {
      const BlacklistGate = await ethers.getContractFactory("BlacklistRejectAccessControl");
      await expect(BlacklistGate.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        BlacklistGate,
        "InvalidDenylist",
      );

      const MockDenylist = await ethers.getContractFactory("MockBlacklistable");
      const denylist = (await MockDenylist.deploy()) as unknown as MockBlacklistable;
      const gate = (await BlacklistGate.deploy(await denylist.getAddress())) as unknown as BlacklistRejectAccessControl;

      expect(await gate.canHoldShares(ethers.ZeroAddress)).to.equal(false);
      expect(await gate.canTransferShares(user1.address, "0x")).to.equal(true);

      await denylist.setShouldRevert(true);
      expect(await gate.canRequestDeposit(user1.address, "0x")).to.equal(false);
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("NftOwnerAccessControl", function () {
    it("covers zero credential, zero account, and supportsInterface", async function () {
      const NftGate = await ethers.getContractFactory("NftOwnerAccessControl");
      await expect(NftGate.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(NftGate, "InvalidCredential");

      const MockNft = await ethers.getContractFactory("MockCredential721");
      const nft = (await MockNft.deploy()) as unknown as MockCredential721;
      const gate = (await NftGate.deploy(await nft.getAddress())) as unknown as NftOwnerAccessControl;

      expect(await gate.canHoldShares(ethers.ZeroAddress)).to.equal(false);
      expect(await gate.canTransferShares(user1.address, "0x")).to.equal(false);
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("AllOfDepositAccessControl", function () {
    it("reverts on empty gates and reports supportsInterface", async function () {
      const AllOf = await ethers.getContractFactory("AllOfDepositAccessControl");
      await expect(AllOf.deploy([])).to.be.revertedWithCustomError(AllOf, "EmptyGates");

      const Whitelist = await ethers.getContractFactory("WhitelistAccessControl");
      const whitelist = await Whitelist.deploy(owner.address);
      const gate = (await AllOf.deploy([await whitelist.getAddress()])) as unknown as AllOfDepositAccessControl;
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("TvlCapDepositAccessControl", function () {
    it("reverts on zero cap and reports supportsInterface", async function () {
      const TvlCap = await ethers.getContractFactory("TvlCapDepositAccessControl");
      await expect(TvlCap.deploy(0)).to.be.revertedWithCustomError(TvlCap, "InvalidCap");

      const gate = (await TvlCap.deploy(1000n)) as unknown as TvlCapDepositAccessControl;
      expect(await gate.supportsInterface("0xffffffff")).to.equal(false);
    });
  });
});
