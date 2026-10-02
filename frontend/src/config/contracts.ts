export const USDC_DECIMALS = 6;

const env = import.meta.env;

// Sepolia deployment checked into deployments/sepolia.json. Environment variables
// deliberately take precedence so a future redeploy never requires a frontend patch.
const DEPLOYED = {
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  vault: "0x31222a3b809c7c2eFCa9eE443A9F745b20DBA281",
  registry: "0x7De7Eea8ea210592F72eAFE6B637849227F8bA6b",
  executor: "0xA5a656F266c75Cb491e365BcB5F6B5b1409bD1C4",
} as const;

export const CONTRACTS = {
  usdc: (env.VITE_USDC_ADDRESS ?? DEPLOYED.usdc) as `0x${string}`,
  vault: (env.VITE_MANDATE_VAULT_ADDRESS ?? DEPLOYED.vault) as `0x${string}`,
  registry: (env.VITE_MANDATE_REGISTRY_ADDRESS ?? DEPLOYED.registry) as `0x${string}`,
  executor: (env.VITE_POLICY_EXECUTOR_ADDRESS ?? DEPLOYED.executor) as `0x${string}`,
};

export function isValid(addr: `0x${string}` | undefined): addr is `0x${string}` {
  if (!addr) return false;
  if (!addr.startsWith("0x") || addr.length !== 42) return false;
  if (/^0x0{40}$/i.test(addr)) return false;
  return true;
}
