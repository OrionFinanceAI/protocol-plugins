// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

/**
 * @title MockIdentityRegistry
 * @notice Test stand-in for ERC-3643 IIdentityRegistry.isVerified
 * @author Orion Finance
 */
contract MockIdentityRegistry {
    mapping(address => bool) private _verified;

    /// @notice Set verification status for a wallet (collapses full ONCHAINID claim checks)
    function setVerified(address account, bool status) external {
        _verified[account] = status;
    }

    /// @notice ERC-3643 Identity Registry eligibility check
    function isVerified(address _userAddress) external view returns (bool) {
        return _verified[_userAddress];
    }
}
