// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import {
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl
} from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title SignedTicketAccessControl
 * @notice Custom EIP-712 signed-ticket gate backed by a local registry
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract SignedTicketAccessControl is
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl,
    ERC165
{
    using ECDSA for bytes32;

    /// @notice Signed ticket payload submitted to the local registry
    struct SignedTicket {
        address wallet;
        bytes32 claimHash;
        uint256 expiry;
        bytes signature;
    }

    /// @notice Trusted attester that signs tickets off-chain
    address public immutable attester;
    /// @notice EIP-712 domain separator
    bytes32 public immutable domainSeparator;
    /// @notice EIP-712 type hash for SignedTicket (without signature field)
    bytes32 public constant SIGNED_TICKET_TYPEHASH =
        keccak256("SignedTicket(address wallet,bytes32 claimHash,uint256 expiry)");

    /// @notice Registry expiry per wallet
    mapping(address => uint256) public ticketExpiry;
    /// @notice Registry claim hash per wallet
    mapping(address => bytes32) public ticketClaimHash;

    /// @notice Emitted when a signed ticket is submitted to the registry
    event SignedTicketSubmitted(address indexed wallet, bytes32 claimHash, uint256 expiry);

    /// @notice Constructor
    /// @param attester_ The trusted attester address
    /// @param name_ EIP-712 domain name
    /// @param version_ EIP-712 domain version
    constructor(address attester_, string memory name_, string memory version_) {
        if (attester_ == address(0)) revert InvalidAttester();
        attester = attester_;
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name_)),
                keccak256(bytes(version_)),
                block.chainid,
                address(this)
            )
        );
    }

    error InvalidAttester();
    error InvalidTicket();

    /// @notice Submit a signed ticket to the on-chain registry
    /// @param ticket The signed ticket
    function submitSignedTicket(SignedTicket calldata ticket) external {
        if (!_verifyTicket(ticket)) revert InvalidTicket();
        ticketExpiry[ticket.wallet] = ticket.expiry;
        ticketClaimHash[ticket.wallet] = ticket.claimHash;
        emit SignedTicketSubmitted(ticket.wallet, ticket.claimHash, ticket.expiry);
    }

    function _verifyTicket(SignedTicket memory ticket) internal view returns (bool) {
        if (ticket.wallet == address(0)) return false;
        if (block.timestamp > ticket.expiry) return false;
        if (ticket.signature.length == 0) return false;

        bytes32 structHash = keccak256(
            abi.encode(SIGNED_TICKET_TYPEHASH, ticket.wallet, ticket.claimHash, ticket.expiry)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        return digest.recover(ticket.signature) == attester;
    }

    function _ok(address account) internal view returns (bool) {
        return ticketExpiry[account] > block.timestamp;
    }

    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address sender, bytes calldata) external view override returns (bool) {
        return _ok(sender);
    }

    /// @inheritdoc IOrionHolderAccessControl
    function canHoldShares(address account) external view override returns (bool) {
        return _ok(account);
    }

    /// @inheritdoc IOrionTransferAccessControl
    function canTransferShares(address sender, bytes calldata) external view override returns (bool) {
        return _ok(sender);
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
