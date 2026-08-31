// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import { IEAS } from "../../access_controllers/EasAccessControl.sol";

/**
 * @title MockEAS
 * @notice Test double for IEAS attestation storage
 */
contract MockEAS is IEAS {
    bytes32 public constant EMPTY_UID = bytes32(0);

    uint256 private _nonce;
    mapping(bytes32 => Attestation) internal _attestations;

    /// @notice Create an attestation and return its UID
    function createAttestation(
        bytes32 schema,
        address recipient,
        address attester,
        bytes calldata data,
        uint64 expirationTime,
        bool revocable
    ) external returns (bytes32 uid) {
        _nonce++;
        uid = keccak256(abi.encode(recipient, attester, schema, _nonce));
        _attestations[uid] = Attestation({
            uid: uid,
            schema: schema,
            refUID: EMPTY_UID,
            time: uint64(block.timestamp),
            expirationTime: expirationTime,
            revocationTime: 0,
            recipient: recipient,
            attester: attester,
            revocable: revocable,
            data: data
        });
    }

    /// @notice Revoke an attestation
    function revoke(bytes32 uid) external {
        Attestation storage attestation = _attestations[uid];
        if (attestation.uid == EMPTY_UID) return;
        attestation.revocationTime = uint64(block.timestamp);
    }

    /// @notice Test helper: overwrite stored attestation fields after registration
    function corruptAttestation(
        bytes32 uid,
        bytes32 newUid,
        bytes32 newSchema,
        address newRecipient,
        address newAttester
    ) external {
        Attestation storage attestation = _attestations[uid];
        attestation.uid = newUid;
        attestation.schema = newSchema;
        attestation.recipient = newRecipient;
        attestation.attester = newAttester;
    }

    /// @inheritdoc IEAS
    function getAttestation(bytes32 uid) external view returns (Attestation memory) {
        return _attestations[uid];
    }
}
