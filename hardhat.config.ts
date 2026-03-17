// Get the environment configuration from .env file
//
// To make use of automatic environment setup:
// - Duplicate .env.example file and name it .env
// - Fill in the environment variables
import 'dotenv/config'

import 'hardhat-deploy'
import 'hardhat-contract-sizer'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'
import '@layerzerolabs/toolbox-hardhat'
import { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'

import { EndpointId } from '@layerzerolabs/lz-definitions'

import './tasks/index'

const MONAD_MAINNET_EID = 30390

// Optional software-signing configuration for raw Hardhat tasks.
// The main deploy-and-wire flow uses a Ledger signer from script/deployAndWire.ts.
const MNEMONIC = process.env.MNEMONIC

const PRIVATE_KEY = process.env.PRIVATE_KEY
const LEDGER_ADDRESS = process.env.LEDGER_ADDRESS
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ''
const defaultFrom = LEDGER_ADDRESS || undefined

const accounts: HttpNetworkAccountsUserConfig | undefined = MNEMONIC
    ? { mnemonic: MNEMONIC }
    : PRIVATE_KEY
      ? [PRIVATE_KEY]
      : undefined

if (accounts == null && LEDGER_ADDRESS == null) {
    console.warn(
        'Could not find MNEMONIC, PRIVATE_KEY, or LEDGER_ADDRESS. Read-only tasks will work, but transaction execution is not configured.'
    )
}

const config: HardhatUserConfig = {
    paths: {
        cache: 'cache/hardhat',
    },
    solidity: {
        compilers: [
            {
                version: '0.8.22',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: {
        ethereum: {
            eid: EndpointId.ETHEREUM_V2_MAINNET,
            url: process.env.RPC_URL_ETHEREUM || 'https://ethereum-rpc.publicnode.com',
            accounts,
            from: defaultFrom,
        },
        monad: {
            eid: MONAD_MAINNET_EID,
            url: process.env.RPC_URL_MONAD || '',
            accounts,
            from: defaultFrom,
        },
        hardhat: {
            // Need this for testing because TestHelperOz5.sol is exceeding the compiled contract size limit
            allowUnlimitedContractSize: true,
        },
    },
    namedAccounts: {
        deployer: {
            default: 0, // wallet address of index[0], of the mnemonic in .env
        },
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
        customChains: [
            {
                network: 'ethereum',
                chainId: 1,
                urls: {
                    apiURL: 'https://api.etherscan.io/v2/api?chainid=1',
                    browserURL: 'https://etherscan.io',
                },
            },
            {
                network: 'monad',
                chainId: 143,
                urls: {
                    apiURL: 'https://api.etherscan.io/v2/api?chainid=143',
                    browserURL: 'https://monadscan.com',
                },
            },
        ],
    },
}

export default config
