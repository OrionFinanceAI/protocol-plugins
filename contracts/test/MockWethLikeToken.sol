// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.34;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockWethLikeToken
 * @notice ERC-20 whose payable fallback/receive write storage (WETH-like).
 * @dev Unbounded `try IERC4626(...).totalAssets()` under STATICCALL burns nearly all
 *      forwarded gas before reverting with StateChangeDuringStaticCall. Used to regression-test
 *      stipended SafeErc4626 probes.
 */
contract MockWethLikeToken is ERC20 {
    /// @dev Incremented by deposit paths; triggers StateChangeDuringStaticCall under staticcall.
    uint256 public depositCount;

    constructor() ERC20("Mock WETH", "mWETH") {}

    /// @notice Mint for tests that need balances / whitelist adapters.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    receive() external payable {
        depositCount++;
    }

    fallback() external payable {
        depositCount++;
    }
}
