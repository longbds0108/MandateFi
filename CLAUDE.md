# CLAUDE.md — MandateFi

Hướng dẫn cho Claude khi làm việc trong repo này. Đọc toàn bộ file trước khi viết code.

## 1. Tổng quan dự án

**MandateFi** là một DeFi vault có kiểm soát bằng policy, chạy trên **Ethereum Sepolia**. Người dùng gửi test USDC, định nghĩa giới hạn cho một AI agent, và agent chỉ được đề xuất hoặc thực thi những hành động tuân thủ các quy tắc đó.

> One-liner: MandateFi is a policy-controlled DeFi vault where AI agents can manage USDC only within limits approved by the user.

**Vấn đề:** Agent DeFi có thể theo dõi thị trường và tự động hóa hành động, nhưng trao quyền ví không giới hạn cho agent là rủi ro. Người dùng cần quy định chính xác agent được làm gì, được di chuyển bao nhiêu, dùng giao thức nào, và khi nào cần người dùng duyệt.

**Giải pháp:** Biến chỉ dẫn của người dùng thành một **Mandate on-chain**, tức bộ quy tắc có thể thực thi, chi phối mọi hành động của agent.

Mandate mẫu:

- Agent chỉ được dùng các stablecoin pool đã được duyệt.
- Rebalance tối đa: 200 test USDC mỗi giao dịch.
- Phân bổ tối đa mỗi ngày: 500 test USDC.
- Chuyển tiền về Stable Reserve khi APY giảm dưới 5%.
- Giao dịch trên 200 test USDC cần người dùng duyệt.
- Người dùng có thể pause hoặc revoke mandate bất kỳ lúc nào.

## 2. Mạng lưới — QUY TẮC CỨNG

- **Chỉ dùng Ethereum Sepolia** (chain ID `11155111`).
- **KHÔNG dùng Arc Testnet** hay bất kỳ mạng nào khác. Không `defineChain` thủ công; dùng `sepolia` từ `wagmi/chains` / `viem/chains`.
- Gas trả bằng **Sepolia ETH**.
- USDC là **ERC-20 với 6 decimals** (không phải native token). Luôn dùng `parseUnits(x, 6)` / `formatUnits(x, 6)`; trong Solidity dùng đơn vị `1e6`.
- Địa chỉ USDC của Circle trên Sepolia: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`. Test USDC lấy qua Circle Faucet.
- Explorer: `https://sepolia.etherscan.io`. Mọi link tx/address trong UI và policy trace trỏ về đây.
- Luồng nạp tiền phải là `approve` → `deposit` (không có native transfer).
- `MockUSDC.sol` chỉ dùng cho test local / Anvil. Demo testnet dùng USDC thật của Circle.

## 3. Tech stack

### Smart contracts
- Foundry (Forge, Cast, Anvil).
- Solidity **`0.8.24`** (pin cứng, không dùng `^`). Optimizer bật, `optimizer_runs = 200`, `via_ir = false`.
- OpenZeppelin qua git submodule (`lib/openzeppelin-contracts`), `forge-std` qua submodule.
- Module OZ ưu tiên: `Ownable`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `Math`.

### Frontend
- Vite + React 19 + TypeScript.
- wagmi 2 + viem 2 + RainbowKit + TanStack Query.
- framer-motion cho animation. Lint bằng oxlint.
- Deploy lên Vercel.

## 4. Cấu trúc repo

```
.
├── src/
│   ├── MandateVault.sol        # nhận test USDC, quản lý deposit/withdraw
│   ├── MandateRegistry.sol     # lưu policy và trạng thái mandate
│   ├── PolicyExecutor.sol      # kiểm tra action có khớp mandate không
│   ├── interfaces/             # IMandateVault, IMandateRegistry, IPolicyExecutor
│   ├── libraries/              # logic thuần (vd. tính daily window)
│   └── mocks/
│       ├── MockUSDC.sol        # chỉ cho local/test
│       └── MockYieldOracle.sol # APY mô phỏng, set thủ công (theo kiểu ManualTestnetOracle)
├── test/                       # *.t.sol — unit, integration, reentrancy
├── script/                     # Deploy*.s.sol
├── frontend/
│   └── src/
│       ├── config/             # wagmi.ts, contracts.ts (địa chỉ + ABI)
│       ├── hooks/              # mỗi luồng nghiệp vụ một hook
│       ├── components/
│       └── lib/
├── foundry.toml
├── remappings.txt
└── .github/workflows/test.yml
```

## 5. Thiết kế contract

### Phân tách trách nhiệm
- **MandateVault**: giữ USDC của người dùng; `deposit`, `withdraw`, và một hàm thực thi chuyển tiền chỉ `PolicyExecutor` được gọi. Người dùng luôn rút được tiền của mình, kể cả khi mandate bị pause/revoke.
- **MandateRegistry**: tạo/cập nhật mandate, trạng thái (`Active`, `Paused`, `Revoked`, `Expired`), danh sách destination được duyệt, và lưu mức đã dùng trong ngày.
- **PolicyExecutor**: nhận proposal từ agent, đánh giá theo mandate, trả về `ALLOWED` / `REQUIRES_APPROVAL` / `DENIED`, phát event policy trace, và thực thi khi được phép.

### Các trường của Mandate
- `owner`, `agent` (địa chỉ được ủy quyền đề xuất)
- `approvedDestinations` (pool/destination)
- `perTxLimit`, `dailyLimit`
- `approvalThreshold` (trên mức này cần user duyệt)
- `apyTriggerBps` (vd. 500 = 5%) và `reserveDestination` (Stable Reserve)
- `executionMode` (`AutoExecute` hoặc `RequireApproval`)
- `expiry`, `status`

### Thứ tự kiểm tra trong PolicyExecutor
Kiểm tra theo thứ tự cố định, dừng ở luật đầu tiên bị vi phạm, để trace luôn nhất quán:
1. Mandate tồn tại và `status == Active`.
2. Chưa hết hạn (`block.timestamp < expiry`).
3. Người gọi là `agent` của mandate.
4. Destination nằm trong danh sách đã duyệt.
5. `amount <= perTxLimit` → nếu vượt: `DENIED`.
6. `usedToday + amount <= dailyLimit` → nếu vượt: `DENIED`.
7. `amount > approvalThreshold` hoặc `executionMode == RequireApproval` → `REQUIRES_APPROVAL`.
8. Còn lại → `ALLOWED`.

Daily limit dùng cửa sổ theo ngày (`block.timestamp / 1 days`), reset khi sang ngày mới.

### Policy trace
Mỗi lần đánh giá phát một event chứa: `mandateId`, `proposalId`, `amount`, `destination`, luật bị kích hoạt, kết quả, `timestamp`. Frontend đọc event để hiển thị câu dễ hiểu, ví dụ:

> Denied: 500 USDC exceeds the 200 USDC rebalance limit.

### Quy ước Solidity
- Dùng **custom error có tham số**, không dùng revert string (vd. `ExceedsPerTxLimit(uint256 amount, uint256 limit)`, `DestinationNotApproved(address destination)`, `MandateNotActive(uint256 mandateId)`). Tham số phải đủ để frontend dựng lý do.
- Dùng `struct` + `enum` cho trạng thái; event index các trường quan trọng (`mandateId`, `user`, `agent`).
- Constants đặt tên rõ: `BPS_DENOMINATOR = 10_000`, thời gian dạng `1 days`.
- Mọi hàm chuyển token dùng `SafeERC20` và `nonReentrant`. Tuân theo checks-effects-interactions.
- NatSpec (`@title`, `@notice`, `@dev`) cho mọi contract và hàm public.
- Comment và NatSpec viết bằng tiếng Anh.

## 6. An toàn — KHÔNG ĐƯỢC VI PHẠM

- **Agent không bao giờ giữ private key của người dùng.** Agent chỉ là một địa chỉ có quyền đề xuất, bị giới hạn bởi mandate.
- Hành động nhạy cảm được người dùng duyệt bằng chính ví Sepolia của họ (ký giao dịch `approveProposal`).
- Người dùng có thể `pause` và `revoke` mandate ngay lập tức; khi đó mọi proposal mới đều `DENIED`.
- Agent không bao giờ được gọi `withdraw` về địa chỉ khác ngoài owner, và không được thay đổi mandate.
- Không commit `.env`, private key hay API key. Deploy script đọc từ biến môi trường.

## 7. Frontend

### Tính năng bắt buộc
1. **Wallet & deposit** — kết nối ví EVM trên Sepolia; deposit/withdraw test USDC; hiển thị số dư ví và vault.
2. **Create mandate** — chọn pool/destination được duyệt; đặt per-tx và daily limit; đặt điều kiện APY; chọn auto-execute hay require approval; đặt expiry và tùy chọn emergency pause.
3. **Agent console** — hiển thị APY hoặc dữ liệu thị trường mô phỏng; cho agent tạo proposal rebalance; kiểm tra mọi proposal với mandate đang active; trả `ALLOWED` / `REQUIRES_APPROVAL` / `DENIED`.
4. **Policy trace** — giải thích vì sao action được phép hay bị từ chối; ghi amount, destination, điều kiện kích hoạt, timestamp, kết quả.
5. **Approval & safety** — duyệt bằng ví; nút pause/revoke luôn dễ thấy.

### Config
```ts
// frontend/src/config/wagmi.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { fallback, http } from 'viem';

export const config = getDefaultConfig({
  appName: 'MandateFi',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [sepolia],
  transports: {
    [sepolia.id]: fallback([
      http(import.meta.env.VITE_SEPOLIA_RPC_URL),
      http(),
    ]),
  },
  ssr: false,
});
```

```ts
// frontend/src/config/contracts.ts
export const USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const;
export const USDC_DECIMALS = 6;
```

Địa chỉ contract đặt trong `contracts.ts`, cho phép override qua biến `VITE_*`, có hàm kiểm tra địa chỉ hợp lệ (bỏ qua địa chỉ zero).

### Quy ước code
- Mỗi luồng một custom hook (`useDeposit`, `useWithdraw`, `useCreateMandate`, `useProposal`, `usePolicyTrace`, `useMandateControls`).
- Dùng `useReadContracts`, `useWriteContract`, `useWaitForTransactionReceipt`. Giữ số tiền ở dạng `bigint` đến tận lúc hiển thị.
- Lỗi từ contract: decode custom error bằng viem (`BaseError`, `decodeErrorResult`) và chuyển thành câu tiếng Anh dễ hiểu.
- Kiểm tra `chainId === sepolia.id`; nếu sai mạng thì hiện nút chuyển mạng, không cho gửi giao dịch.

## 8. Design system

Tông tối, accent màu kem ngà **`#e8e3d5`**.

```css
:root {
  --color-bg: #0E0B14;
  --color-surface: #16121F;
  --color-surface-hover: #1D1829;
  --color-border: #2A2438;
  --color-text-primary: #F4F2F7;
  --color-text-secondary: #A79DB5;

  --color-accent: #e8e3d5;
  --color-accent-hover: #d6d0bf;          /* hover đi tối hơn, không sáng hơn */
  --color-accent-ink: #0E0B14;            /* chữ trên nền accent */
  --color-accent-soft: rgba(232, 227, 213, 0.08);

  --color-safe: #4FD1C5;                  /* ALLOWED */
  --color-warning: #E8B54C;               /* REQUIRES_APPROVAL */
  --color-danger: #E5484D;                /* DENIED */

  --font-display: 'Fraunces', serif;
  --font-body: 'Inter Tight', 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
}
```

Quy tắc dùng accent:
- Nút chính có nền accent thì chữ phải là `--color-accent-ink` (tối), không dùng chữ trắng.
- Dùng accent cho nút chính, viền focus, trạng thái active và điểm nhấn; không dùng cho chữ thường, để accent không lẫn với `--color-text-primary`.
- Ba trạng thái policy luôn dùng màu riêng (safe / warning / danger), không dùng accent.
- Số tiền, địa chỉ, hash hiển thị bằng `--font-mono`.

## 9. Lệnh thường dùng

```bash
# Contracts
forge build
forge test -vvv
forge fmt
forge snapshot
anvil

# Deploy lên Sepolia
forge script script/DeployMandateFi.s.sol:DeployMandateFi \
  --rpc-url sepolia --broadcast --verify

# Frontend
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

`foundry.toml`:
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200
via_ir = false

[rpc_endpoints]
sepolia = "${SEPOLIA_RPC_URL}"

[etherscan]
sepolia = { key = "${ETHERSCAN_API_KEY}" }
```

Biến môi trường cần có: `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, `USDC_ADDRESS`, `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_SEPOLIA_RPC_URL`.

## 10. Testing

- Test bằng Forge với `MockUSDC` 6 decimals; dùng `vm.prank`, `vm.warp`, `vm.expectRevert` với selector custom error.
- Bắt buộc có test cho: từng luật trong PolicyExecutor (cả đường ALLOWED, REQUIRES_APPROVAL, DENIED), reset daily limit khi qua ngày, pause/revoke/expiry, agent không phải owner không thể rút tiền, reentrancy, và luồng duyệt proposal.
- Deploy script có bước verify sau deploy (kiểm tra các contract đã được wire đúng), revert bằng custom error nếu sai.
- CI (GitHub Actions) chạy `forge fmt --check`, `forge build --sizes`, `forge test -vvv`.

## 11. Rialo thesis

MVP chạy trên Ethereum Sepolia vì Rialo chưa có môi trường deploy công khai. Dự án minh họa nhu cầu với các primitive native của Rialo:

- Native webcalls thay cho tích hợp price/oracle bên ngoài.
- Native timers và thực thi theo sự kiện thay cho keeper bot.
- Quyền hạn an toàn, có giới hạn bởi policy cho AI agent.
- Hướng tới chuyển sang Rialo để thực thi DeFi tự động theo thời gian thực.

Khi viết code, đánh dấu bằng comment `// RIALO:` những chỗ hiện đang dùng giải pháp tạm (oracle mô phỏng, keeper/agent off-chain gọi định kỳ) mà trên Rialo sẽ được thay bằng primitive native.

## 12. Ngôn ngữ

- Trao đổi với người dùng bằng tiếng Việt.
- Code, comment, NatSpec, thông báo lỗi và UI copy viết bằng tiếng Anh.
