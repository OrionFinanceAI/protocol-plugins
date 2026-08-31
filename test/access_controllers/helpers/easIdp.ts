import { ethers } from "../../helpers/hh";
import type { MockEAS } from "../../../types/ethers-contracts/contracts/test/access_controllers/MockEAS.js";

export const MOCK_TOTP = "123456";
export const ORION_DOMAIN_HASH = ethers.keccak256(ethers.toUtf8Bytes("orionfinance.ai"));

export function encodeEmailDomainData(
  emailDomainHash: string = ORION_DOMAIN_HASH,
  twoFactorVerified = true,
  eligible = true,
): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bool", "bool"],
    [emailDomainHash, twoFactorVerified, eligible],
  );
}

export function countryCodeBytes2(countryCode: string): string {
  return ethers.hexlify(ethers.toUtf8Bytes(countryCode.padEnd(2, "\0")).slice(0, 2));
}

export function encodeNationalityData(countryCode: string, accredited = true, twoFactorVerified = true): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes2", "bool", "bool"],
    [countryCodeBytes2(countryCode), accredited, twoFactorVerified],
  );
}

export interface EmailDomainAttestParams {
  email: string;
  totp: string;
  emailDomainHash?: string;
  twoFactorVerified?: boolean;
  eligible?: boolean;
}

function validateEmailDomainIdp(params: EmailDomainAttestParams): void {
  if (params.totp !== MOCK_TOTP) {
    throw new Error("2FA failed");
  }
  const domain = params.email.split("@")[1];
  if (domain !== "orionfinance.ai") {
    throw new Error("bad domain");
  }
}

async function mintAttestation(
  mockEas: MockEAS,
  schemaUID: string,
  recipient: string,
  idp: string,
  data: string,
  expirationTime = 0,
): Promise<string> {
  const uid = await mockEas.createAttestation.staticCall(schemaUID, recipient, idp, data, expirationTime, true);
  await mockEas.createAttestation(schemaUID, recipient, idp, data, expirationTime, true);
  return uid;
}

export async function createRawAttestation(
  mockEas: MockEAS,
  idp: string,
  recipient: string,
  schemaUID: string,
  data: string,
  expirationTime = 0,
): Promise<string> {
  return mintAttestation(mockEas, schemaUID, recipient, idp, data, expirationTime);
}

export async function createEmailDomainAttestation(
  mockEas: MockEAS,
  idp: string,
  recipient: string,
  schemaUID: string,
  params: EmailDomainAttestParams,
): Promise<string> {
  validateEmailDomainIdp(params);
  const data = encodeEmailDomainData(
    params.emailDomainHash ?? ORION_DOMAIN_HASH,
    params.twoFactorVerified ?? true,
    params.eligible ?? true,
  );
  return mintAttestation(mockEas, schemaUID, recipient, idp, data);
}

export interface NationalityAttestParams {
  countryCode: string;
  totp: string;
  accredited?: boolean;
  twoFactorVerified?: boolean;
  allowedCountries?: string[];
}

export async function createNationalityAttestation(
  mockEas: MockEAS,
  idp: string,
  recipient: string,
  schemaUID: string,
  params: NationalityAttestParams,
): Promise<string> {
  if (params.totp !== MOCK_TOTP) {
    throw new Error("2FA failed");
  }
  if (params.allowedCountries && !params.allowedCountries.includes(params.countryCode)) {
    throw new Error("country not allowed by IdP");
  }

  const data = encodeNationalityData(params.countryCode, params.accredited ?? true, params.twoFactorVerified ?? true);
  return mintAttestation(mockEas, schemaUID, recipient, idp, data);
}

export async function createRawEmailDomainAttestation(
  mockEas: MockEAS,
  idp: string,
  recipient: string,
  schemaUID: string,
  data: string,
): Promise<string> {
  return mintAttestation(mockEas, schemaUID, recipient, idp, data);
}
