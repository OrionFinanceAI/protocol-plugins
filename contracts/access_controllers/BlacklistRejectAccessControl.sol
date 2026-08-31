// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import {
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl
} from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IBlacklistable
 * @notice External denylist surface (e.g. USDC FiatToken)
 */
interface IBlacklistable {
    function isBlacklisted(address account) external view returns (bool);
}

/**
 * @title BlacklistRejectAccessControl
 * @notice Rejects accounts flagged on an external denylist
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract BlacklistRejectAccessControl is
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl,
    ERC165
{
    /// @notice External denylist contract
    IBlacklistable public immutable denylist;

    /// @notice Constructor
    /// @param denylist_ The external blacklist contract
    constructor(IBlacklistable denylist_) {
        if (address(denylist_) == address(0)) revert InvalidDenylist();
        denylist = denylist_;
    }

    error InvalidDenylist();

    function _ok(address account) internal view returns (bool) {
        if (account == address(0)) return false;
        try denylist.isBlacklisted(account) returns (bool banned) {
            return !banned;
        } catch {
            return false;
        }
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
    function canTransferShares(address account, bytes calldata) external view override returns (bool) {
        return _ok(account);
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
