import { expect } from "chai";
import { ethers } from "../helpers/hh";
import { deployUpgradeableProtocol } from "../helpers/deployUpgradeable";
import { getProtocolContractAt } from "../helpers/protocolArtifacts";
import { resetNetwork } from "../helpers/resetNetwork";
import type { OrionTransparentVault } from "@orion-finance/protocol/types/ethers-contracts/index.js";

describe("Strategist constructors", function () {
  before(async function () {
    await resetNetwork();
  });

  it("KBest constructors reject zero config / zero k; idempotent setVault", async function () {
    const [owner] = await ethers.getSigners();
    const deployed = await deployUpgradeableProtocol(owner);
    const tvlFactory = await ethers.getContractFactory("KBestTvlWeightedAverage");
    const apyFactory = await ethers.getContractFactory("KBestApyStrategist");

    await expect(tvlFactory.deploy(owner.address, ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(
      deployed.orionConfig,
      "ZeroAddress",
    );
    await expect(apyFactory.deploy(owner.address, ethers.ZeroAddress, 1, 0)).to.be.revertedWithCustomError(
      deployed.orionConfig,
      "ZeroAddress",
    );
    await expect(
      apyFactory.deploy(owner.address, await deployed.orionConfig.getAddress(), 0, 0),
    ).to.be.revertedWithCustomError(deployed.orionConfig, "InvalidArguments");

    const tvl = await tvlFactory.deploy(owner.address, await deployed.orionConfig.getAddress(), 1);
    const tx = await deployed.transparentVaultFactory.createVault(owner.address, "K", "K", 0, 0, 0, ethers.ZeroAddress);
    const receipt = await tx.wait();
    const log = receipt!.logs.find((l) => {
      try {
        return deployed.transparentVaultFactory.interface.parseLog(l)?.name === "OrionVaultCreated";
      } catch {
        return false;
      }
    });
    const vaultAddr = deployed.transparentVaultFactory.interface.parseLog(log!)!.args[0] as string;
    const vault = (await getProtocolContractAt("OrionTransparentVault", vaultAddr)) as unknown as OrionTransparentVault;

    await vault.connect(owner).updateStrategist(await tvl.getAddress());
    await tvl.setVault(vaultAddr); // idempotent same-address path

    const apy = await apyFactory.deploy(owner.address, await deployed.orionConfig.getAddress(), 1, 0);
    await vault.connect(owner).updateStrategist(await apy.getAddress());
    await apy.setVault(vaultAddr);
  });
});
