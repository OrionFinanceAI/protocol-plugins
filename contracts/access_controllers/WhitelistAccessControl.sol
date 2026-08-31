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
 * @title WhitelistAccessControl
 * @notice Whitelist-based investor access control for Orion vaults
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract WhitelistAccessControl is
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl,
    Ownable2Step,
    ERC165
{
    /// @notice Mapping of addresses allowed for deposit / hold / transfer
    mapping(address => bool) public whitelist;

    /// @notice Emitted when an address is added to the whitelist
    /// @param account The address that was added to the whitelist
    event AddressWhitelisted(address indexed account);

    /// @notice Emitted when an address is removed from the whitelist
    /// @param account The address that was removed from the whitelist
    event AddressRemovedFromWhitelist(address indexed account);

    /// @notice Constructor
    /// @param initialOwner_ The address of the initial owner
    constructor(address initialOwner_) Ownable(initialOwner_) {}

    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address sender, bytes calldata) external view override returns (bool) {
        return whitelist[sender];
    }

    /// @inheritdoc IOrionHolderAccessControl
    function canHoldShares(address account) external view override returns (bool) {
        return whitelist[account];
    }

    /// @inheritdoc IOrionTransferAccessControl
    function canTransferShares(address account, bytes calldata) external view override returns (bool) {
        return whitelist[account];
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IOrionDepositAccessControl).interfaceId ||
            interfaceId == type(IOrionHolderAccessControl).interfaceId ||
            interfaceId == type(IOrionTransferAccessControl).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice Add addresses to the whitelist
     * @param accounts Array of addresses to whitelist
     * @dev Only callable by owner
     */
    function addToWhitelist(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; ++i) {
            whitelist[accounts[i]] = true;
            emit AddressWhitelisted(accounts[i]);
        }
    }

    /**
     * @notice Remove addresses from the whitelist
     * @param accounts Array of addresses to remove from the whitelist
     * @dev Only callable by owner
     */
    function removeFromWhitelist(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; ++i) {
            whitelist[accounts[i]] = false;
            emit AddressRemovedFromWhitelist(accounts[i]);
        }
    }
}
