import {getDefaultConfig} from "@rainbow-me/rainbowkit";
import {sepolia} from "wagmi/chains";
import {fallback, http} from "viem";

const RPC = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;

export const wagmiConfig = getDefaultConfig({
  appName: "MandateFi",
  projectId: (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string) || "MANDATEFI_DEMO",
  chains: [sepolia],
  transports: {
    [sepolia.id]: fallback([
      ...(RPC ? [http(RPC)] : []),
      http(),
    ]),
  },
  ssr: false,
});
