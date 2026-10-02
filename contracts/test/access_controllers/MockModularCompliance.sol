// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

/**
 * @title MockModularCompliance
 * @notice Test stand-in for ERC-3643 IModularCompliance.canTransfer
 * @author Orion Finance
 */
contract MockModularCompliance {
    bool private _allowAll = true;
    mapping(bytes32 => bool) private _pairDenied;

    /// @notice Global allow/deny for canTransfer when no pair override is set
    function setAllowAll(bool allow) external {
        _allowAll = allow;
    }

    /// @notice Deny a specific (from, to) pair regardless of allowAll
    function setPairDenied(address from, address to, bool denied) external {
        _pairDenied[keccak256(abi.encodePacked(from, to))] = denied;
    }

    /// @notice ERC-3643 ModularCompliance transfer check
    function canTransfer(address _from, address _to, uint256) external view returns (bool) {
        if (_pairDenied[keccak256(abi.encodePacked(_from, _to))]) return false;
        return _allowAll;
    }
}
