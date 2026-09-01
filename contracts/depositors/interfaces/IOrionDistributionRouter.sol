// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.34;

/**
 * @title IOrionDistributionRouter
 * @notice Protocol-wide entry for distributor-routed Orion deposits
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
interface IOrionDistributionRouter {
    /// @notice Emitted when a distributor-routed deposit request is submitted.
    /// @param distributorId Distributor identifier assigned offchain.
    /// @param vault The Orion vault receiving the deposit request.
    /// @param user The end LP credited in the vault queue.
    /// @param assets Underlying amount to request-deposit.
    event DistributionDeposit(
        bytes32 indexed distributorId,
        address indexed vault,
        address indexed user,
        uint256 assets
    );

    /// @notice Route a deposit to a registered Orion vault and attribute it to a distributor.
    /// @param vault Target Orion vault.
    /// @param distributorId Distributor identifier assigned offchain.
    /// @param assets Underlying amount to request-deposit.
    function requestDepositWithDistribution(address vault, bytes32 distributorId, uint256 assets) external;
}
