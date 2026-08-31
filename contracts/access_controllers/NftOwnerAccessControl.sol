// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import {
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl
} from "@orion-finance/protocol/contracts/interfaces/IOrionAccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title NftOwnerAccessControl
 * @notice Credential NFT ownership gate for deposit, hold, and transfer
 * @author Orion Finance
 * @dev Soulbound vs transferable credentials are properties of the NFT contract.
 * @custom:security-contact security@orionfinance.ai
 */
contract NftOwnerAccessControl is
    IOrionDepositAccessControl,
    IOrionHolderAccessControl,
    IOrionTransferAccessControl,
    ERC165
{
    /// @notice Credential collection (ERC-721)
    IERC721 public immutable credential;

    /// @notice Constructor
    /// @param credential_ The ERC-721 credential contract
    constructor(IERC721 credential_) {
        if (address(credential_) == address(0)) revert InvalidCredential();
        credential = credential_;
    }

    error InvalidCredential();

    function _ok(address account) internal view returns (bool) {
        if (account == address(0)) return false;
        return credential.balanceOf(account) > 0;
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
