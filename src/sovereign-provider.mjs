export const SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION = "ni:///sha-256;wzh-zYeFQCsh4zAzGS34uacNV4qJeIEmCKIUUWyRZ-M";
const CAIP10 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:[-.%a-zA-Z0-9]{1,128}$/u;
export function providerAccountFromAgentCard(card) {
  const accounts = [...new Set([card?.provider?.account, card?.provider?.id, card?.provider?.url].filter((value) => typeof value === "string" && CAIP10.test(value)))];
  if (accounts.length !== 1) throw new Error("acceptance oracle agent card must expose exactly one CAIP-10 provider account");
  return accounts[0];
}
