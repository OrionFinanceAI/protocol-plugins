// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.34;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockCredential721
 * @notice Test ERC-721 credential for NftOwnerAccessControl
 */
contract MockCredential721 is ERC721 {
    uint256 private _nextTokenId;

    constructor() ERC721("Mock Credential", "CRED") {}

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
    }
}
