// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.34;

import { IOrionTransparentVault } from "@orion-finance/protocol/contracts/interfaces/IOrionTransparentVault.sol";
import { IOrionConfig } from "@orion-finance/protocol/contracts/interfaces/IOrionConfig.sol";
import { IPriceAdapterRegistry } from "@orion-finance/protocol/contracts/interfaces/IPriceAdapterRegistry.sol";
import { IOrionStrategist } from "@orion-finance/protocol/contracts/interfaces/IOrionStrategist.sol";
import { ErrorsLib } from "@orion-finance/protocol/contracts/libraries/ErrorsLib.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title KBestTvlWeightedAverage
 * @notice Selects the top-K assets by TVL from the protocol whitelist and allocates proportionally.
 * @author Orion Finance
 * @custom:security-contact security@orionfinance.ai
 */
contract KBestTvlWeightedAverage is IOrionStrategist, ERC165, Ownable2Step, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Minimum age a checkpoint must reach before it is refreshed, mirroring
    /// @notice KBestApyStrategist.MIN_WINDOW. Ranking always reads the checkpoint recorded at the
    /// @notice END of the previous submitIntent() call, never the live value at ranking time -- so an
    /// @notice attacker inflating an asset's totalAssets() immediately before this call cannot affect
    /// @notice this cycle's ranking, only a checkpoint that will not take effect for at least this long.
    uint256 internal constant MIN_WINDOW = 1 hours;

    /// @dev Packed into one storage slot (128 + 48 = 176 bits), mirroring KBestApyStrategist.Checkpoint.
    struct Checkpoint {
        uint128 tvl;
        uint48 timestamp;
    }

    /// @notice The Orion configuration contract.
    IOrionConfig public immutable CONFIG;
    /// @notice Protocol underlying asset cached at deployment.
    address public immutable PROTOCOL_UNDERLYING;
    /// @notice Price adapter decimals cached at deployment.
    uint8 public immutable PRICE_DECIMALS;
    /// @notice Price registry cached at deployment.
    IPriceAdapterRegistry public immutable PRICE_REGISTRY;

    /// @notice The number of top assets to select.
    uint16 public k;

    /// @notice The vault this strategist is linked to. Set once via setVault; never changes.
    address private _vault;

    mapping(address => Checkpoint) private _checkpoints;

    /// @notice Assets whitelisted as of our last submitIntent (or construction). Used to detect when
    /// @notice an asset is newly whitelisted or re-listed after removal, so its checkpoint is reset
    /// @notice instead of bootstrapping ranking from a stale, pre-delisting TVL.
    EnumerableSet.AddressSet private _trackedAssets;

    /// @notice Emitted when a TVL checkpoint is recorded for an asset (end of submitIntent).
    /// @param asset The address of the asset for which the checkpoint is recorded.
    /// @param tvl The normalized TVL value at the checkpoint.
    /// @param timestamp The timestamp when the checkpoint was recorded.
    event CheckpointRecorded(address indexed asset, uint128 indexed tvl, uint48 indexed timestamp);

    /// @notice Constructor to initialize the strategist with owner, config address, and number of top assets.
    /// @param owner_ Owner of this contract (can update k).
    /// @param config_ The Orion configuration contract address.
    /// @param k_ Number of top assets to select.
    constructor(address owner_, address config_, uint16 k_) Ownable(owner_) {
        if (config_ == address(0)) revert ErrorsLib.ZeroAddress();
        CONFIG = IOrionConfig(config_);
        PROTOCOL_UNDERLYING = address(CONFIG.underlyingAsset());
        PRICE_DECIMALS = CONFIG.priceAdapterDecimals();
        PRICE_REGISTRY = IPriceAdapterRegistry(CONFIG.priceAdapterRegistry());
        k = k_;

        // Deliberately do NOT pre-record TVL checkpoints here, unlike KBestApyStrategist's
        // share-price baseline (meaningful even for a freshly-deployed, empty vault since a share is
        // worth the same regardless of how much is deposited). TVL is an absolute size, so a snapshot
        // taken before any real deposits exist would just capture a near-empty vault -- and because
        // checkpoints only refresh after MIN_WINDOW, the first real submitIntent() call would then be
        // stuck ranking against that meaningless baseline instead of bootstrapping from live TVLs.
        // Only the tracked-asset set is seeded, so relisting is still detected correctly later.
        address[] memory assets = CONFIG.getAllWhitelistedAssets();
        uint16 n = uint16(assets.length);
        for (uint16 i = 0; i < n; ++i) {
            // slither-disable-next-line unused-return
            _trackedAssets.add(assets[i]);
        }
    }

    /// @inheritdoc IOrionStrategist
    function setVault(address vault_) external {
        if (vault_ == address(0)) revert ErrorsLib.ZeroAddress();
        if (_vault == vault_) return; // idempotent for same address
        if (_vault != address(0)) revert ErrorsLib.StrategistVaultAlreadyLinked();
        if (msg.sender != vault_) revert ErrorsLib.NotAuthorized();
        _vault = vault_;
    }

    /// @inheritdoc IOrionStrategist
    function submitIntent() external override onlyOwner nonReentrant {
        if (k == 0) revert ErrorsLib.OrderIntentCannotBeEmpty();
        address vault_ = _vault;
        if (vault_ == address(0)) revert ErrorsLib.ZeroAddress();

        address[] memory assets = CONFIG.getAllWhitelistedAssets();
        uint16 n = uint16(assets.length);
        _syncTrackedAssets(assets, n);

        uint256[] memory tvls = _getAssetTVLs(assets, n);

        uint16 kActual = uint16(Math.min(k, n));
        if (kActual == 0) revert ErrorsLib.OrderIntentCannotBeEmpty();
        (address[] memory tokens, uint256[] memory topTvls) = _selectTopKAssets(assets, tvls, n, kActual);

        IOrionTransparentVault.IntentPosition[] memory intent = _calculatePositions(tokens, topTvls, kActual);

        // slither-disable-start reentrancy-no-eth
        IOrionTransparentVault(vault_).submitIntent(intent);
        _recordCheckpointsForAssets(assets, n);
        // slither-disable-end reentrancy-no-eth
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IOrionStrategist).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @notice Update the number of top assets to select.
    /// @param kNew The new k value.
    function updateParameters(uint16 kNew) external onlyOwner {
        k = kNew;
    }

    /// @dev Returns each asset's checkpointed TVL, normalized to a common price unit so that ERC4626
    ///      vaults backed by different underlying tokens (and different decimals) are directly
    ///      comparable. Ranking reads the checkpoint recorded at the end of the PREVIOUS
    ///      submitIntent() call (never the live value at ranking time), so a same-block TVL inflation
    ///      cannot influence this cycle's selection or weights. An asset with no checkpoint yet
    ///      (first-ever call, or the call right after it was newly listed / re-listed) bootstraps from
    ///      the live value instead, since there is no prior snapshot to fall back to.
    function _getAssetTVLs(address[] memory assets, uint16 n) internal view returns (uint256[] memory tvls) {
        tvls = new uint256[](n);
        for (uint16 i = 0; i < n; ++i) {
            Checkpoint memory cp = _checkpoints[assets[i]];
            // slither-disable-next-line incorrect-equality
            tvls[i] = cp.timestamp == 0 ? _normalizedTvl(assets[i]) : uint256(cp.tvl);
        }
    }

    /// @dev Returns the TVL of a single ERC4626 asset expressed in a common price unit.
    ///      normalizedTvl = rawTvl * underlyingPrice / 10^underlyingDecimals
    ///      where underlyingPrice is sourced from the protocol price registry and is already
    ///      in priceAdapterDecimals precision, making all results directly comparable.
    function _normalizedTvl(address asset) private view returns (uint256) {
        uint256 rawTvl = 0;
        try IERC4626(asset).totalAssets() returns (uint256 tvl) {
            rawTvl = tvl;
        } catch {
            return 1;
        }

        address vaultUnderlying = address(0);
        try IERC4626(asset).asset() returns (address u) {
            vaultUnderlying = u;
        } catch {
            return 1;
        }

        if (vaultUnderlying == address(0)) return 1;

        uint8 underlyingDecimals = 0;
        try IERC20Metadata(vaultUnderlying).decimals() returns (uint8 d) {
            underlyingDecimals = d;
        } catch {
            return 1;
        }

        uint256 underlyingPrice = 0;

        if (vaultUnderlying == PROTOCOL_UNDERLYING) {
            // TVL is already in protocol underlying units; use unit price in priceDecimals precision.
            underlyingPrice = 10 ** PRICE_DECIMALS;
        } else {
            try PRICE_REGISTRY.getPrice(vaultUnderlying) returns (uint256 p) {
                underlyingPrice = p;
            } catch {
                return 1;
            }
        }

        uint256 normalized = Math.mulDiv(rawTvl, underlyingPrice, 10 ** underlyingDecimals);
        return normalized == 0 ? 1 : normalized;
    }

    /// @dev Records checkpoints for a fixed asset list.
    function _recordCheckpointsForAssets(address[] memory assets, uint16 n) internal {
        for (uint16 i = 0; i < n; ++i) {
            _recordCheckpoint(assets[i]);
        }
    }

    /// @dev Skips if the existing checkpoint is less than MIN_WINDOW old, so ranking always reads a
    ///      value that is at least MIN_WINDOW stale relative to whatever triggered the refresh.
    function _recordCheckpoint(address asset) internal {
        Checkpoint memory existing = _checkpoints[asset];
        if (existing.timestamp != 0 && block.timestamp - uint256(existing.timestamp) < MIN_WINDOW) return;
        uint256 tvl = _normalizedTvl(asset);
        if (tvl > type(uint128).max) return;
        uint48 now_ = uint48(block.timestamp);
        _checkpoints[asset] = Checkpoint({ tvl: uint128(tvl), timestamp: now_ });
        emit CheckpointRecorded(asset, uint128(tvl), now_);
    }

    /// @dev Resets the checkpoint for any asset not seen as whitelisted on our last call -- covers
    ///      both genuinely new assets and assets re-listed after removal, so ranking never bootstraps
    ///      a re-listed asset from a stale, pre-delisting TVL. Also drops bookkeeping for assets no
    ///      longer whitelisted, so a future re-list is detected the same way.
    function _syncTrackedAssets(address[] memory assets, uint16 n) internal {
        for (uint16 i = 0; i < n; ++i) {
            if (_trackedAssets.add(assets[i])) {
                // `add` returns true only when newly inserted: first time seen, or a relist.
                delete _checkpoints[assets[i]];
            }
        }

        uint256 trackedIdx = _trackedAssets.length();
        while (trackedIdx > 0) {
            --trackedIdx;
            address tracked = _trackedAssets.at(trackedIdx);
            bool stillWhitelisted = false;
            for (uint16 j = 0; j < n; ++j) {
                if (assets[j] == tracked) {
                    stillWhitelisted = true;
                    break;
                }
            }
            if (!stillWhitelisted) {
                // slither-disable-next-line unused-return
                _trackedAssets.remove(tracked);
            }
        }
    }

    function _selectTopKAssets(
        address[] memory assets,
        uint256[] memory tvls,
        uint16 n,
        uint16 kActual
    ) internal pure returns (address[] memory tokens, uint256[] memory topTvls) {
        tokens = new address[](kActual);
        topTvls = new uint256[](kActual);
        bool[] memory used = new bool[](n);
        for (uint16 idx = 0; idx < kActual; ++idx) {
            uint256 maxTVL = 0;
            uint256 maxIndex = 0;
            for (uint16 j = 0; j < n; ++j) {
                if (!used[j] && tvls[j] > maxTVL) {
                    maxTVL = tvls[j];
                    maxIndex = j;
                }
            }
            used[maxIndex] = true;
            tokens[idx] = assets[maxIndex];
            topTvls[idx] = tvls[maxIndex];
        }
    }

    /// @dev Converts TVL values to proportional weights summing exactly to 10^intentDecimals.
    ///      Any rounding residual is added to the first position.
    function _calculatePositions(
        address[] memory tokens,
        uint256[] memory topTvls,
        uint16 kActual
    ) internal view returns (IOrionTransparentVault.IntentPosition[] memory intent) {
        uint256 totalTVL = 0;
        for (uint16 i = 0; i < kActual; ++i) {
            totalTVL += topTvls[i];
        }

        uint32 intentScale = uint32(10 ** CONFIG.strategistIntentDecimals());
        intent = new IOrionTransparentVault.IntentPosition[](kActual);

        uint32 sumWeights = 0;
        for (uint16 i = 0; i < kActual; ++i) {
            uint32 weight = uint32((topTvls[i] * intentScale) / totalTVL);
            intent[i] = IOrionTransparentVault.IntentPosition({ token: tokens[i], weight: weight });
            sumWeights += weight;
        }

        // Assign rounding residual to first position to guarantee exact sum.
        if (sumWeights < intentScale) {
            intent[0].weight += intentScale - sumWeights;
        }
    }
}
