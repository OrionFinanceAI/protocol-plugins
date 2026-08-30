import * as dotenv from "dotenv";
import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatTypechain from "@nomicfoundation/hardhat-typechain";

dotenv.config({ quiet: true });

const config = defineConfig({
  plugins: [hardhatToolboxMochaEthers, hardhatTypechain],
  coverage: {
    skipFiles: ["contracts/test/**"],
  },
  defaultNetwork: "hardhat",
  solidity: {
    npmFilesToBuild: [
      "@openzeppelin/contracts/token/ERC20/IERC20.sol",
      "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol",
      "@openzeppelin/contracts/interfaces/IERC4626.sol",
    ],
    compilers: [
      {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 10,
          },
          viaIR: true,
          evmVersion: "cancun",
        },
      },
    ],
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
      initialBaseFeePerGas: 0,
      allowUnlimitedContractSize: true,
    },
  },
});

export default config;
