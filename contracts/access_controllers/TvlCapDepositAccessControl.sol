// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IOrionDepositAccessControl } from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import { IOrionVault } from "@orion-finance/protocol/contracts/interfaces/IOrionVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title TvlCapDepositAccessControl
 * @notice Reject deposit requests that would exceed a configured TVL cap
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract TvlCapDepositAccessControl is IOrionDepositAccessControl, ERC165 {
    /// @notice Maximum projected TVL in underlying asset units
    uint256 public immutable cap;

    /// @notice Constructor
    /// @param cap_ The TVL cap in underlying asset units
    constructor(uint256 cap_) {
        if (cap_ == 0) revert InvalidCap();
        cap = cap_;
    }

    error InvalidCap();

    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address, bytes calldata data) external view override returns (bool) {
        if (data.length < 36) return false;
        if (bytes4(data[:4]) != IOrionVault.requestDeposit.selector) return false;

        uint256 assets = abi.decode(data[4:], (uint256));
        IOrionVault vault = IOrionVault(msg.sender);
        uint256 projected = vault.totalAssets() + vault.pendingDeposit(type(uint256).max) + assets;
        return projected <= cap;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOrionDepositAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }
}
