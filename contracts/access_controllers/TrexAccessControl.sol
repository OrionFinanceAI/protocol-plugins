// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.17;

import { IIdentityRegistry } from "@erc3643org/erc-3643/contracts/registry/interface/IIdentityRegistry.sol";
import { IModularCompliance } from "@erc3643org/erc-3643/contracts/compliance/modular/IModularCompliance.sol";

/**
 * @title TrexAccessControl
 * @notice Orion vault ACL bridge to official ERC-3643 Identity Registry (+ optional ModularCompliance)
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract TrexAccessControl {
    /// @notice Official ERC-3643 Identity Registry (ONCHAINID-backed eligibility)
    IIdentityRegistry public immutable identityRegistry; // solhint-disable-line immutable-vars-naming

    /// @notice Optional ModularCompliance; address(0) = identity-only gating
    IModularCompliance public immutable modularCompliance; // solhint-disable-line immutable-vars-naming

    /// @dev Orion `IOrionDepositAccessControl` interfaceId (`canRequestDeposit(address,bytes)`)
    bytes4 private constant _DEPOSIT_IFACE = 0x81e8f5a6;
    /// @dev Orion `IOrionHolderAccessControl` interfaceId (`canHoldShares(address)`)
    bytes4 private constant _HOLDER_IFACE = 0x0e695800;
    /// @dev Orion `IOrionTransferAccessControl` interfaceId (`canTransferShares(address,address,uint256,bytes)`)
    bytes4 private constant _TRANSFER_IFACE = 0x4111eca7;
    /// @dev ERC-165
    bytes4 private constant _ERC165_IFACE = 0x01ffc9a7;

    /// @notice Constructor
    /// @param identityRegistry_ ERC-3643 Identity Registry
    /// @param modularCompliance_ Stateless ModularCompliance or address(0) for identity-only
    constructor(address identityRegistry_, address modularCompliance_) {
        identityRegistry = IIdentityRegistry(identityRegistry_);
        modularCompliance = IModularCompliance(modularCompliance_);
    }

    /// @notice Whether `account` is verified on the Identity Registry (fail closed)
    /// @param account Wallet to check
    /// @return True if verified
    function _isVerified(address account) internal view returns (bool) {
        if (account == address(0)) return false;
        try identityRegistry.isVerified(account) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @notice Optional ModularCompliance check using vault-passed transfer triple
    /// @param from Share sender
    /// @param to Share recipient
    /// @param value Share amount
    /// @return True if compliance allows the transfer
    function _complianceAllows(address from, address to, uint256 value) internal view returns (bool) {
        if (address(modularCompliance) == address(0)) return true;
        try modularCompliance.canTransfer(from, to, value) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @notice Orion deposit gate — Identity Registry `isVerified`
    /// @param sender Address requesting the deposit
    /// @return True if the deposit request is allowed
    function canRequestDeposit(address sender, bytes calldata) external view returns (bool) {
        return _isVerified(sender);
    }

    /// @notice Orion holder gate — Identity Registry `isVerified`
    /// @param account Prospective share holder
    /// @return True if the account may hold shares
    function canHoldShares(address account) external view returns (bool) {
        return _isVerified(account);
    }

    /// @notice Orion transfer gate — `isVerified(from)` and optional `canTransfer(from,to,value)`
    /// @param from Share sender
    /// @param to Share recipient
    /// @param value Share amount
    /// @return True if the transfer is allowed
    function canTransferShares(address from, address to, uint256 value, bytes calldata) external view returns (bool) {
        if (!_isVerified(from)) return false;
        return _complianceAllows(from, to, value);
    }

    /// @notice ERC-165 discovery for Orion ACL interface IDs
    /// @param interfaceId Interface identifier
    /// @return True if supported
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == _DEPOSIT_IFACE ||
            interfaceId == _HOLDER_IFACE ||
            interfaceId == _TRANSFER_IFACE ||
            interfaceId == _ERC165_IFACE;
    }
}
