// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IOrionDepositAccessControl } from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title AllOfDepositAccessControl
 * @notice AND-composes multiple deposit access controllers
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract AllOfDepositAccessControl is IOrionDepositAccessControl, ERC165 {
    /// @notice Composed deposit gates
    IOrionDepositAccessControl[] public gates;

    /// @notice Constructor
    /// @param gates_ Deposit gates that must all allow
    constructor(IOrionDepositAccessControl[] memory gates_) {
        if (gates_.length == 0) revert EmptyGates();
        gates = gates_;
    }

    error EmptyGates();

    /// @inheritdoc IOrionDepositAccessControl
    function canRequestDeposit(address sender, bytes calldata data) external view override returns (bool) {
        uint256 length = gates.length;
        for (uint256 i = 0; i < length; ++i) {
            if (!gates[i].canRequestDeposit(sender, data)) return false;
        }
        return true;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOrionDepositAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }
}
