// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IOrionDepositAccessControl } from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import { IOrionVault } from "@orion-finance/protocol/contracts/interfaces/IOrionVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title ManagerOnlyDepositAccessControl
 * @notice Allows only the calling vault's manager to request deposits
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract ManagerOnlyDepositAccessControl is IOrionDepositAccessControl, ERC165 {
    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address sender, bytes calldata) external view override returns (bool) {
        return sender == IOrionVault(msg.sender).manager();
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOrionDepositAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }
}
