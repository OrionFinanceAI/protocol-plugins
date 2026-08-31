// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IENSRegistry, IENSResolver } from "../../access_controllers/EnsSubtreeAccessControl.sol";

/**
 * @title MockEnsResolver
 * @notice Test ENS resolver
 */
contract MockEnsResolver is IENSResolver {
    mapping(bytes32 => address) public addresses;

    function setAddr(bytes32 node, address addr_) external {
        addresses[node] = addr_;
    }

    /// @inheritdoc IENSResolver
    function addr(bytes32 node) external view returns (address) {
        return addresses[node];
    }
}

/**
 * @title MockEnsRegistry
 * @notice Test ENS registry with explicit subtree relationships
 */
contract MockEnsRegistry is IENSRegistry {
    mapping(bytes32 => address) public resolvers;
    mapping(bytes32 => bytes32) public parentNode;

    function setResolver(bytes32 node, address resolver_) external {
        resolvers[node] = resolver_;
    }

    function setParent(bytes32 node, bytes32 parent) external {
        parentNode[node] = parent;
    }

    /// @inheritdoc IENSRegistry
    function resolver(bytes32 node) external view returns (address) {
        return resolvers[node];
    }

    /// @inheritdoc IENSRegistry
    function isSubnodeOf(bytes32 node, bytes32 rootNode) external view returns (bool) {
        bytes32 current = node;
        while (current != bytes32(0)) {
            if (current == rootNode) return true;
            current = parentNode[current];
        }
        return false;
    }
}
