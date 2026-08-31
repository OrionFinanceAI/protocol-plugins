import { ethers } from "../../helpers/hh";

export interface SignedTicket {
  wallet: string;
  claimHash: string;
  expiry: bigint;
  signature: string;
}

export async function signSignedTicket(
  attester: { signTypedData: (...args: unknown[]) => Promise<string> },
  verifyingContract: string,
  ticket: { wallet: string; claimHash: string; expiry: bigint },
  domain: { name: string; version: string },
): Promise<SignedTicket> {
  const network = await ethers.provider.getNetwork();
  const signature = await attester.signTypedData(
    {
      name: domain.name,
      version: domain.version,
      chainId: network.chainId,
      verifyingContract,
    },
    {
      SignedTicket: [
        { name: "wallet", type: "address" },
        { name: "claimHash", type: "bytes32" },
        { name: "expiry", type: "uint256" },
      ],
    },
    {
      wallet: ticket.wallet,
      claimHash: ticket.claimHash,
      expiry: ticket.expiry,
    },
  );

  return {
    wallet: ticket.wallet,
    claimHash: ticket.claimHash,
    expiry: ticket.expiry,
    signature,
  };
}
