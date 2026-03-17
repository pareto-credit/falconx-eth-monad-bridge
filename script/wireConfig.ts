import 'dotenv/config'
import 'hardhat-deploy'
import '@nomiclabs/hardhat-ethers'

import hre from 'hardhat'

import { wireWithLedger } from './wireLayerZero'

async function main() {
    if (!process.env.RPC_URL_ETHEREUM) {
        throw new Error('Missing required environment variable: RPC_URL_ETHEREUM')
    }

    if (!process.env.RPC_URL_MONAD) {
        throw new Error('Missing required environment variable: RPC_URL_MONAD')
    }

    await hre.run('compile')
    await wireWithLedger(hre)
    await hre.run('lz:oapp:peers:get', { oappConfig: 'layerzero.config.ts' })
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})