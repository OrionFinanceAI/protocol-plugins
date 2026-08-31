// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IOrionDepositAccessControl } from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title TvlCapDepositAccessControl
 * @notice Veto deposits when the calling vault's TVL is at or above a capacity limit
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract TvlCapDepositAccessControl is IOrionDepositAccessControl, ERC165 {
    /// @notice Maximum total assets before deposits are rejected
    uint256 public immutable cap;

    /// @notice Constructor
    /// @param cap_ The TVL cap in underlying asset units
    constructor(uint256 cap_) {
        if (cap_ == 0) revert InvalidCap();
        cap = cap_;
    }

    error InvalidCap();

    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address, bytes calldata) external view override returns (bool) {
        return IERC4626(msg.sender).totalAssets() < cap;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOrionDepositAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }
}
