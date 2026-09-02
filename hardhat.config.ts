import * as dotenv from "dotenv";
import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatTypechain from "@nomicfoundation/hardhat-typechain";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

dotenv.config({ quiet: true });

const config = defineConfig({
  plugins: [hardhatToolboxMochaEthers, hardhatTypechain, hardhatVerify],
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
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    ...((): object => {
      const pk = process.env.PRIVATE_KEY ?? "";
      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) return {};
      const accounts = [pk];
      const networks: Record<string, object> = {};
      const sepoliaRpc = process.env.SEPOLIA_RPC_URL ?? "";
      const genericRpc = process.env.RPC_URL ?? "";
      if (sepoliaRpc) {
        networks["sepolia"] = { type: "http", chainType: "l1", url: sepoliaRpc, accounts, chainId: 11155111 };
      }
      if (genericRpc) networks["network"] = { type: "http", chainType: "l1", url: genericRpc, accounts };
      return networks;
    })(),
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
});

export default config;
