// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IBlacklistable } from "../../access_controllers/BlacklistRejectAccessControl.sol";

/**
 * @title MockBlacklistable
 * @notice Test denylist for BlacklistRejectAccessControl
 */
contract MockBlacklistable is IBlacklistable {
    mapping(address => bool) public blacklisted;

    function setBlacklisted(address account, bool status) external {
        blacklisted[account] = status;
    }

    /// @inheritdoc IBlacklistable
    function isBlacklisted(address account) external view returns (bool) {
        return blacklisted[account];
    }
}
