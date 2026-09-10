import { expect } from "chai";
import { getAddress, ZeroAddress } from "ethers";
import { orionConfigEnvName, resolveOrionConfigAddress } from "../scripts/orion-config-env.js";

const SEPOLIA = "0xbDe3025d08681a02a1c6cf70375baBe2152DD06f";
const OTHER = "0x1111111111111111111111111111111111111111";

describe("orionConfigEnvName", function () {
  it("throws when network is unset", function () {
    expect(() => orionConfigEnvName(undefined)).to.throw(/CHAIN is required/);
    expect(() => orionConfigEnvName("  ")).to.throw(/CHAIN is required/);
  });

  it("maps mainnet vs sepolia forks", function () {
    expect(orionConfigEnvName("mainnet")).to.equal("MAINNET_ORION_CONFIG_ADDRESS");
    expect(orionConfigEnvName("sepolia")).to.equal("SEPOLIA_ORION_CONFIG_ADDRESS");
    expect(orionConfigEnvName("hardhat")).to.equal("SEPOLIA_ORION_CONFIG_ADDRESS");
    expect(orionConfigEnvName("localhost")).to.equal("SEPOLIA_ORION_CONFIG_ADDRESS");
  });

  it("rejects the generic hardhat `network` alias", function () {
    expect(() => orionConfigEnvName("network")).to.throw(/Unsupported CHAIN: network/);
  });
});

describe("resolveOrionConfigAddress", function () {
  it("returns checksummed SEPOLIA_* on sepolia", function () {
    expect(resolveOrionConfigAddress("sepolia", { SEPOLIA_ORION_CONFIG_ADDRESS: SEPOLIA.toLowerCase() })).to.equal(
      getAddress(SEPOLIA),
    );
  });

  it("returns checksummed MAINNET_* on mainnet", function () {
    expect(resolveOrionConfigAddress("mainnet", { MAINNET_ORION_CONFIG_ADDRESS: OTHER })).to.equal(getAddress(OTHER));
  });

  it("does not read the other chain var", function () {
    expect(() => resolveOrionConfigAddress("sepolia", { MAINNET_ORION_CONFIG_ADDRESS: OTHER })).to.throw(
      /SEPOLIA_ORION_CONFIG_ADDRESS is required for network sepolia/,
    );
    expect(() => resolveOrionConfigAddress("mainnet", { SEPOLIA_ORION_CONFIG_ADDRESS: SEPOLIA })).to.throw(
      /MAINNET_ORION_CONFIG_ADDRESS is required for network mainnet/,
    );
  });

  it("throws on zero address and Sepolia address on mainnet", function () {
    expect(() => resolveOrionConfigAddress("sepolia", { SEPOLIA_ORION_CONFIG_ADDRESS: ZeroAddress })).to.throw(
      /SEPOLIA_ORION_CONFIG_ADDRESS must not be the zero address/,
    );
    expect(() => resolveOrionConfigAddress("mainnet", { MAINNET_ORION_CONFIG_ADDRESS: SEPOLIA })).to.throw(
      /MAINNET_ORION_CONFIG_ADDRESS must not be the Sepolia OrionConfig/,
    );
  });

  it("ignores ORION_CONFIG_ADDRESS and DEFAULT_ORION_CONFIG", function () {
    expect(() => resolveOrionConfigAddress("sepolia", { ORION_CONFIG_ADDRESS: SEPOLIA })).to.throw(
      /SEPOLIA_ORION_CONFIG_ADDRESS is required for network sepolia/,
    );
  });
});
