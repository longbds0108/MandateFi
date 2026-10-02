export const USDC_DECIMALS = 6;

const env = import.meta.env;

export const CONTRACTS = {
  usdc: (env.VITE_USDC_ADDRESS ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238") as `0x${string}`,
  vault: env.VITE_MANDATE_VAULT_ADDRESS as `0x${string}` | undefined,
  registry: env.VITE_MANDATE_REGISTRY_ADDRESS as `0x${string}` | undefined,
  executor: env.VITE_POLICY_EXECUTOR_ADDRESS as `0x${string}` | undefined,
};

export function isValid(addr: `0x${string}` | undefined): addr is `0x${string}` {
  if (!addr) return false;
  if (!addr.startsWith("0x") || addr.length !== 42) return false;
  if (/^0x0{40}$/i.test(addr)) return false;
  return true;
}
