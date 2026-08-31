// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import {
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl
} from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IEAS
 * @notice Minimal Ethereum Attestation Service interface for Orion access gates
 * @author Orion Finance
 */
interface IEAS {
    /// @notice Empty attestation UID sentinel
    function EMPTY_UID() external view returns (bytes32);

    /// @notice On-chain attestation record
    struct Attestation {
        bytes32 uid;
        bytes32 schema;
        bytes32 refUID;
        uint64 time;
        uint64 expirationTime;
        uint64 revocationTime;
        address recipient;
        address attester;
        bool revocable;
        bytes data;
    }

    /// @notice Fetch an attestation by UID
    /// @param uid The attestation UID
    function getAttestation(bytes32 uid) external view returns (Attestation memory);
}

/**
 * @title EasAccessControl
 * @notice EAS-backed investor gate with email-domain or nationality policy decoding
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract EasAccessControl is
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl,
    Ownable2Step,
    ERC165
{
    /// @notice Policy mode for decoding attestation.data
    enum PolicyMode {
        EmailDomain,
        Nationality
    }

    /// @notice EAS contract
    IEAS public immutable eas;
    /// @notice Required schema UID
    bytes32 public immutable schemaUID;
    /// @notice Active policy decoder
    PolicyMode public immutable policyMode;
    /// @notice Required email domain hash (EmailDomain mode); zero skips domain check
    bytes32 public immutable requiredEmailDomainHash;

    /// @notice Allowed ISO 3166-1 alpha-2 country codes (Nationality)
    bytes2[] public allowedCountryCodes;
    /// @notice Trusted attester allowlist
    mapping(address => bool) public trustedAttester;
    /// @notice Registered EAS UID per wallet
    mapping(address => bytes32) public attestationUid;

    /// @notice Emitted when a wallet registers an EAS attestation UID
    /// @param wallet The registered wallet
    /// @param uid The EAS attestation UID
    event AttestationRegistered(address indexed wallet, bytes32 indexed uid);

    /// @notice Emitted when a trusted attester is added or removed
    /// @param attester The attester address
    /// @param trusted True to trust, false to revoke
    event TrustedAttesterSet(address indexed attester, bool trusted);

    /// @notice Constructor
    /// @param initialOwner_ The address of the initial owner
    /// @param eas_ The EAS contract
    /// @param schemaUID_ The schema UID for this product
    /// @param trustedAttesters_ IdP attester allowlist
    /// @param policyMode_ EmailDomain or Nationality decode mode
    /// @param requiredEmailDomainHash_ keccak256(domain) for EmailDomain mode; zero to skip
    /// @param allowedCountryCodes_ ISO country codes for Nationality; empty to skip
    constructor(
        address initialOwner_,
        IEAS eas_,
        bytes32 schemaUID_,
        address[] memory trustedAttesters_,
        PolicyMode policyMode_,
        bytes32 requiredEmailDomainHash_,
        bytes2[] memory allowedCountryCodes_
    ) Ownable(initialOwner_) {
        if (address(eas_) == address(0)) revert InvalidEas();
        if (schemaUID_ == bytes32(0)) revert InvalidSchema();
        if (trustedAttesters_.length == 0) revert InvalidAttester();

        eas = eas_;
        schemaUID = schemaUID_;
        policyMode = policyMode_;
        requiredEmailDomainHash = requiredEmailDomainHash_;

        uint256 attesterLength = trustedAttesters_.length;
        for (uint256 i = 0; i < attesterLength; ++i) {
            if (trustedAttesters_[i] == address(0)) revert InvalidAttester();
            trustedAttester[trustedAttesters_[i]] = true;
        }

        uint256 countryLength = allowedCountryCodes_.length;
        for (uint256 i = 0; i < countryLength; ++i) {
            allowedCountryCodes.push(allowedCountryCodes_[i]);
        }
    }

    error InvalidEas();
    error InvalidSchema();
    error InvalidAttester();
    error InvalidAttestation();
    error InvalidRecipient();
    error UntrustedAttester();
    error PolicyDenied();

    /// @notice Add or remove a trusted attester
    /// @param attester The attester address
    /// @param trusted True to trust, false to revoke
    function setTrustedAttester(address attester, bool trusted) external onlyOwner {
        if (attester == address(0)) revert InvalidAttester();
        trustedAttester[attester] = trusted;
        emit TrustedAttesterSet(attester, trusted);
    }

    /// @notice Register an EAS attestation UID for msg.sender
    /// @param uid The EAS attestation UID
    function registerAttestation(bytes32 uid) external {
        IEAS.Attestation memory attestation = eas.getAttestation(uid);
        if (attestation.uid == eas.EMPTY_UID()) revert InvalidAttestation();
        if (attestation.schema != schemaUID) revert InvalidSchema();
        if (attestation.recipient != msg.sender) revert InvalidRecipient();
        if (!trustedAttester[attestation.attester]) revert UntrustedAttester();
        if (!_isValid(attestation)) revert InvalidAttestation();
        if (!_policyAllows(attestation.data)) revert PolicyDenied();
        attestationUid[msg.sender] = uid;
        emit AttestationRegistered(msg.sender, uid);
    }

    function _isValid(IEAS.Attestation memory attestation) internal view returns (bool) {
        if (attestation.revocationTime != 0) return false;
        if (attestation.expirationTime != 0 && !(block.timestamp < attestation.expirationTime)) return false;
        return true;
    }

    function _attestationOk(address account) internal view returns (bool) {
        bytes32 uid = attestationUid[account];
        if (uid == bytes32(0)) return false;

        IEAS.Attestation memory attestation = eas.getAttestation(uid);
        if (attestation.uid == eas.EMPTY_UID()) return false;
        if (attestation.recipient != account) return false;
        if (attestation.schema != schemaUID) return false;
        if (!trustedAttester[attestation.attester]) return false;
        if (!_isValid(attestation)) return false;
        return _policyAllows(attestation.data);
    }

    function _policyAllows(bytes memory data) internal view returns (bool) {
        if (policyMode == PolicyMode.EmailDomain) {
            return _emailDomainPolicyAllows(data);
        }
        return _nationalityPolicyAllows(data);
    }

    function _emailDomainPolicyAllows(bytes memory data) internal view returns (bool) {
        if (data.length == 0) return false;
        (bytes32 emailDomainHash, bool twoFactorVerified, bool eligible) = abi.decode(data, (bytes32, bool, bool));
        if (requiredEmailDomainHash != bytes32(0) && emailDomainHash != requiredEmailDomainHash) return false;
        if (!twoFactorVerified || !eligible) return false;
        return true;
    }

    function _nationalityPolicyAllows(bytes memory data) internal view returns (bool) {
        if (data.length == 0) return false;
        (bytes2 countryCode, bool accredited, bool twoFactorVerified) = abi.decode(data, (bytes2, bool, bool));
        if (!accredited || !twoFactorVerified) return false;
        if (allowedCountryCodes.length == 0) return true;
        return _countryAllowed(countryCode);
    }

    function _countryAllowed(bytes2 countryCode) internal view returns (bool) {
        uint256 length = allowedCountryCodes.length;
        for (uint256 i = 0; i < length; ++i) {
            if (allowedCountryCodes[i] == countryCode) return true;
        }
        return false;
    }

    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address sender, bytes calldata) external view override returns (bool) {
        return _attestationOk(sender);
    }

    /// @inheritdoc IOrionHolderAccessControl
    function canHoldShares(address account) external view override returns (bool) {
        return _attestationOk(account);
    }

    /// @inheritdoc IOrionTransferAccessControl
    function canTransferShares(address sender, bytes calldata) external view override returns (bool) {
        return _attestationOk(sender);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IOrionDepositAccessControl).interfaceId ||
            interfaceId == type(IOrionHolderAccessControl).interfaceId ||
            interfaceId == type(IOrionTransferAccessControl).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
