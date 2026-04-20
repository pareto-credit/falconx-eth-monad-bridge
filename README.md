## Monad Pareto FalconX Credit Vault Bridge

Production bridge for the Pareto AA Tranche - FalconXUSDC token from Ethereum to Monad.

- Canonical token on Ethereum: `0xC26A6Fa2C37b38E549a4a1807543801Db684f99C`
- Ethereum EID: `30101`
- Monad EID: `30390`
- Contracts deployed by this repo:
  - `FalconXAAAdapter` on Ethereum
  - `MonadFalconXAA` on Monad

## Required Setup

1. Copy `.env.example` to `.env`
2. Set `LEDGER_ADDRESS`
3. Set `RPC_URL_ETHEREUM`
4. Set `RPC_URL_MONAD`
5. Optionally set `LEDGER_DERIVATION_PATH`
6. Optionally set `BRIDGE_OWNER`; if unset, `LEDGER_ADDRESS` is used
7. Set `ETHERSCAN_API_KEY` for Etherscan and MonadScan verification

Before deploying:

- use Node 20+
- open the Ethereum app on the Ledger
- enable blind signing in the Ledger Ethereum app
- fund the Ledger address on both Ethereum and Monad

## Deploy

Compile:

```bash
npm run compile:hardhat
```

Deploy and wire everything:

```bash
npm run deploy:all
```

This will:

- deploy the Ethereum adapter
- deploy the Monad OFT
- save deployment files under `deployments/`
- wire the LayerZero peer configuration
- print the deployment and bridge info

## Verify

Print the deployed addresses and commands:

```bash
npx hardhat lz:bridge:info
```

Check peer wiring:

```bash
npx hardhat lz:oapp:peers:get --oapp-config layerzero.config.ts
```

Check the live LayerZero security posture:

```bash
npx hardhat lz:bridge:security --oapp-config layerzero.config.ts
npx hardhat lz:oapp:config:get --oapp-config layerzero.config.ts
```

Verify the deployed contracts:

```bash
npm run verify:all
```

Verify one network only:

```bash
npm run verify:ethereum
npm run verify:monad
```

## Bridge

Ethereum to Monad:

```bash
npx hardhat lz:oft:send --src-eid 30101 --dst-eid 30390 --amount 1 --to YOUR_MONAD_ADDRESS --oapp-config layerzero.config.ts
```

Monad to Ethereum:

```bash
npx hardhat lz:oft:send --src-eid 30390 --dst-eid 30101 --amount 1 --to YOUR_ETHEREUM_ADDRESS --oapp-config layerzero.config.ts
```

## Go-Live Notes

- Approve the Pareto AA Tranche - FalconXUSDC token to the deployed Ethereum adapter before the first Ethereum to Monad transfer.
- The Monad token is only the wrapped bridge representation.
- `RPC_URL_MONAD` must point to the intended production Monad RPC; there is no fallback in this repo.
