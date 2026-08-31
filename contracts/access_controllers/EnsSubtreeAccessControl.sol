// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import {
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl
} from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IENSResolver
 * @notice Minimal ENS resolver surface
 */
interface IENSResolver {
    function addr(bytes32 node) external view returns (address);
}

/**
 * @title IENSRegistry
 * @notice Minimal ENS registry with subtree helper
 */
interface IENSRegistry {
    function resolver(bytes32 node) external view returns (address);
    function isSubnodeOf(bytes32 node, bytes32 rootNode) external view returns (bool);
}

/**
 * @title EnsSubtreeAccessControl
 * @notice Wallet must resolve from an ENS node under a trusted root
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract EnsSubtreeAccessControl is
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl,
    ERC165
{
    /// @notice ENS registry
    IENSRegistry public immutable ensRegistry;
    /// @notice Trusted root node (e.g. namehash of "orionfinance.ai")
    bytes32 public immutable rootNode;
    /// @notice Wallets verified via registerEnsNode
    mapping(address => bool) public registeredAccounts;

    /// @notice Emitted when a wallet registers an ENS node under the root
    event EnsNodeRegistered(address indexed account, bytes32 indexed node);

    /// @notice Constructor
    /// @param ensRegistry_ The ENS registry
    /// @param rootNode_ The trusted root node
    constructor(IENSRegistry ensRegistry_, bytes32 rootNode_) {
        if (address(ensRegistry_) == address(0)) revert InvalidRegistry();
        if (rootNode_ == bytes32(0)) revert InvalidRootNode();
        ensRegistry = ensRegistry_;
        rootNode = rootNode_;
    }

    error InvalidRegistry();
    error InvalidRootNode();
    error InvalidEnsNode();

    /// @notice Register the caller after proving control of a node under the root
    /// @param node The ENS node that must resolve to msg.sender
    function registerEnsNode(bytes32 node) external {
        if (!_verifyNode(msg.sender, node)) revert InvalidEnsNode();
        registeredAccounts[msg.sender] = true;
        emit EnsNodeRegistered(msg.sender, node);
    }

    function _resolve(bytes32 node) internal view returns (address) {
        address resolverAddress = ensRegistry.resolver(node);
        if (resolverAddress == address(0)) return address(0);
        return IENSResolver(resolverAddress).addr(node);
    }

    function _verifyNode(address account, bytes32 node) internal view returns (bool) {
        if (node == bytes32(0)) return false;
        if (!ensRegistry.isSubnodeOf(node, rootNode)) return false;
        return _resolve(node) == account;
    }

    function _ok(address account) internal view returns (bool) {
        return registeredAccounts[account];
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
