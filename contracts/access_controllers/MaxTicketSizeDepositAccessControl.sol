// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IOrionDepositAccessControl } from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import { IOrionVault } from "@orion-finance/protocol/contracts/interfaces/IOrionVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title MaxTicketSizeDepositAccessControl
 * @notice Reject deposit requests that would exceed a per-depositor cumulative ticket size
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract MaxTicketSizeDepositAccessControl is IOrionDepositAccessControl, ERC165 {
    /// @notice Maximum cumulative depositor exposure in underlying asset units
    uint256 public immutable maxTicketSize;

    /// @notice Constructor
    /// @param maxTicketSize_ The max ticket size in underlying asset units
    constructor(uint256 maxTicketSize_) {
        if (maxTicketSize_ == 0) revert InvalidMaxTicketSize();
        maxTicketSize = maxTicketSize_;
    }

    error InvalidMaxTicketSize();

    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address sender, bytes calldata data) external view override returns (bool) {
        if (data.length < 4) return false;

        uint256 assets;
        bytes4 selector = bytes4(data[:4]);

        if (selector == IOrionVault.requestDeposit.selector) {
            if (data.length < 36) return false;
            assets = abi.decode(data[4:], (uint256));
        } else if (selector == IOrionVault.requestDepositFor.selector) {
            if (data.length < 68) return false;
            (, assets) = abi.decode(data[4:], (address, uint256));
        } else {
            return false;
        }

        IOrionVault vault = IOrionVault(msg.sender);
        uint256 projected = assets + vault.pendingDepositOf(sender) + vault.convertToAssets(vault.balanceOf(sender));
        return projected <= maxTicketSize;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOrionDepositAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }
}
