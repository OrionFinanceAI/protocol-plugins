// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.34;

import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { SafeErc4626 } from "../libraries/SafeErc4626.sol";

/**
 * @title SafeErc4626Harness
 * @notice Test-only helpers to compare stipended vs unbounded ERC-4626 probes.
 */
contract SafeErc4626Harness {
    function gasUsedSafeTotalAssets(address target) external view returns (uint256 used, bool ok, uint256 value) {
        uint256 g0 = gasleft();
        (ok, value) = SafeErc4626.totalAssets(target);
        used = g0 - gasleft();
    }

    function gasUsedSafeAsset(address target) external view returns (uint256 used, bool ok, address value) {
        uint256 g0 = gasleft();
        (ok, value) = SafeErc4626.asset(target);
        used = g0 - gasleft();
    }

    /// @dev Reproduces the pre-fix pattern: unbounded try/catch on totalAssets.
    function gasUsedUnsafeTotalAssets(address target) external view returns (uint256 used, uint256 value) {
        uint256 g0 = gasleft();
        try IERC4626(target).totalAssets() returns (uint256 tvl) {
            value = tvl;
        } catch {
            value = 1;
        }
        used = g0 - gasleft();
    }
}
