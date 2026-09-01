// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.34;

import { IOrionDistributionRouter } from "./interfaces/IOrionDistributionRouter.sol";
import { IOrionConfig } from "@orion-finance/protocol/contracts/interfaces/IOrionConfig.sol";
import { IOrionVault } from "@orion-finance/protocol/contracts/interfaces/IOrionVault.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OrionDistributionRouter
 * @notice Protocol-wide entry for distributor-routed Orion deposits
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract OrionDistributionRouter is IOrionDistributionRouter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Orion config used to verify vault registration
    IOrionConfig public immutable config;

    error ZeroAddress();
    error ZeroAmount();
    error VaultNotAllowed(address vault);

    /// @notice Constructor
    /// @param config_ Orion config contract address
    constructor(address config_) {
        if (config_ == address(0)) revert ZeroAddress();
        config = IOrionConfig(config_);
    }

    /// @inheritdoc IOrionDistributionRouter
    function requestDepositWithDistribution(
        address vault,
        bytes32 distributorId,
        uint256 assets
    ) external nonReentrant {
        if (vault == address(0)) revert ZeroAddress();
        if (assets == 0) revert ZeroAmount();
        if (!config.isOrionVault(vault)) revert VaultNotAllowed(vault);

        address user = msg.sender;
        IERC20 asset = IERC20(IOrionVault(vault).asset());

        asset.safeTransferFrom(user, address(this), assets);
        asset.forceApprove(vault, assets);

        emit DistributionDeposit(distributorId, vault, user, assets);

        IOrionVault(vault).requestDepositFor(user, assets);
    }
}
