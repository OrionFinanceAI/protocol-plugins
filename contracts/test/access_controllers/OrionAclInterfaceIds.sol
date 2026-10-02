// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.34;

import {
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl
} from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";

/**
 * @title OrionAclInterfaceIds
 * @notice Exposes Orion ACL ERC-165 interface IDs for TrexAccessControl tests
 * @author Orion Finance
 */
contract OrionAclInterfaceIds {
    function depositInterfaceId() external pure returns (bytes4) {
        return type(IOrionDepositAccessControl).interfaceId;
    }

    function holderInterfaceId() external pure returns (bytes4) {
        return type(IOrionHolderAccessControl).interfaceId;
    }

    function transferInterfaceId() external pure returns (bytes4) {
        return type(IOrionTransferAccessControl).interfaceId;
    }
}
