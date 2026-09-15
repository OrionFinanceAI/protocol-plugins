// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.34;

/**
 * @title SafeErc4626
 * @notice Gas-bounded staticcall probes for ERC-4626 view methods.
 * @author Orion Finance
 */
library SafeErc4626 {
    /// @dev Enough for a simple `asset()` / `decimals()` getter.
    uint256 internal constant PROBE_GAS = 100_000;
    /// @dev Enough for typical ERC-4626 `totalAssets` / `convertToAssets` views.
    uint256 internal constant VIEW_GAS = 500_000;

    /// @notice Probe `asset()` with `PROBE_GAS`.
    /// @param target Contract to probe.
    /// @return ok True if the call succeeded and the return word is a clean address.
    /// @return value Decoded underlying asset address, or zero on failure.
    function asset(address target) internal view returns (bool ok, address value) {
        (bool success, bytes memory data) = target.staticcall{ gas: PROBE_GAS }(abi.encodeWithSignature("asset()"));
        if (!success || data.length < 32) return (false, address(0));
        uint256 word = abi.decode(data, (uint256));
        if (word > type(uint160).max) return (false, address(0));
        return (true, address(uint160(word)));
    }

    /// @notice Probe `totalAssets()` with `VIEW_GAS`.
    /// @param target Contract to probe.
    /// @return ok True if the call succeeded with at least one ABI word of returndata.
    /// @return value Decoded total assets, or zero on failure.
    function totalAssets(address target) internal view returns (bool ok, uint256 value) {
        (bool success, bytes memory data) = target.staticcall{ gas: VIEW_GAS }(
            abi.encodeWithSignature("totalAssets()")
        );
        if (!success || data.length < 32) return (false, 0);
        value = abi.decode(data, (uint256));
        return (true, value);
    }

    /// @notice Probe `decimals()` with `PROBE_GAS`.
    /// @param target Contract to probe.
    /// @return ok True if the call succeeded and the return word fits in uint8.
    /// @return value Decoded decimals, or zero on failure.
    function decimals(address target) internal view returns (bool ok, uint8 value) {
        (bool success, bytes memory data) = target.staticcall{ gas: PROBE_GAS }(abi.encodeWithSignature("decimals()"));
        if (!success || data.length < 32) return (false, 0);
        uint256 word = abi.decode(data, (uint256));
        if (word > type(uint8).max) return (false, 0);
        return (true, uint8(word));
    }

    /// @notice Probe `convertToAssets(shares)` with `VIEW_GAS`.
    /// @param target Contract to probe.
    /// @param shares Share amount passed to `convertToAssets`.
    /// @return ok True if the call succeeded with at least one ABI word of returndata.
    /// @return value Decoded asset amount, or zero on failure.
    function convertToAssets(address target, uint256 shares) internal view returns (bool ok, uint256 value) {
        (bool success, bytes memory data) = target.staticcall{ gas: VIEW_GAS }(
            abi.encodeWithSignature("convertToAssets(uint256)", shares)
        );
        if (!success || data.length < 32) return (false, 0);
        value = abi.decode(data, (uint256));
        return (true, value);
    }
}
