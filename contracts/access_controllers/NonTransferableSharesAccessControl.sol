// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IOrionTransferAccessControl } from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title NonTransferableSharesAccessControl
 * @notice Blocks all P2P share transfers; redeem paths remain vault-exempt
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract NonTransferableSharesAccessControl is IOrionTransferAccessControl, ERC165 {
    /// @inheritdoc IOrionTransferAccessControl
    function canTransferShares(address, bytes calldata) external pure override returns (bool) {
        return false;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOrionTransferAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }
}
