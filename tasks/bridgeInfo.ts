import fs from 'fs'
import path from 'path'

import { task, types } from 'hardhat/config'

import { EndpointId } from '@layerzerolabs/lz-definitions'

const ETHEREUM_EID = EndpointId.ETHEREUM_V2_MAINNET
const MONAD_EID = 30390
const FALCONX_AA_TRANCHE = '0xC26A6Fa2C37b38E549a4a1807543801Db684f99C'
const ETHEREUM_CONTRACT_NAME = 'FalconXAAAdapter'
const MONAD_CONTRACT_NAME = 'MonadFalconXAA'

interface BridgeInfoArgs {
    oappConfig: string
    amount: string
    ethereumRecipient: string
    monadRecipient: string
}

function resolveDeploymentInfo(root: string, networkName: string, contractName: string): { address?: string; error?: string } {
    const deploymentPath = path.join(root, 'deployments', networkName, `${contractName}.json`)

    if (!fs.existsSync(deploymentPath)) {
        return { error: `No deployment file found at ${deploymentPath}` }
    }

    try {
        const raw = fs.readFileSync(deploymentPath, 'utf8')
        const deployment = JSON.parse(raw) as { address?: string }
        return { address: deployment.address }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

task('lz:bridge:info', 'Print deployment info and copy-paste bridge commands for Pareto AA Tranche - FalconXUSDC')
    .addOptionalParam('oappConfig', 'Path to the LayerZero config file', 'layerzero.config.ts', types.string)
    .addOptionalParam('amount', 'Human-readable amount to use in sample send commands', '1', types.string)
    .addOptionalParam(
        'ethereumRecipient',
        'Recipient address placeholder for Monad to Ethereum transfers',
        'YOUR_ETHEREUM_ADDRESS',
        types.string
    )
    .addOptionalParam(
        'monadRecipient',
        'Recipient address placeholder for Ethereum to Monad transfers',
        'YOUR_MONAD_ADDRESS',
        types.string
    )
    .setAction(async (args: BridgeInfoArgs, hre) => {
        const [ethereumInfo, monadInfo] = [
            resolveDeploymentInfo(hre.config.paths.root, 'ethereum', ETHEREUM_CONTRACT_NAME),
            resolveDeploymentInfo(hre.config.paths.root, 'monad', MONAD_CONTRACT_NAME),
        ]

        const projectRoot = path.relative(process.cwd(), hre.config.paths.root) || '.'
        const configArg = `--oapp-config ${args.oappConfig}`
        const ethereumToMonad = `npx hardhat lz:oft:send --src-eid ${ETHEREUM_EID} --dst-eid ${MONAD_EID} --amount ${args.amount} --to ${args.monadRecipient} ${configArg}`
        const monadToEthereum = `npx hardhat lz:oft:send --src-eid ${MONAD_EID} --dst-eid ${ETHEREUM_EID} --amount ${args.amount} --to ${args.ethereumRecipient} ${configArg}`

        console.log('')
        console.log('Monad Pareto AA Tranche Bridge')
        console.log('')
        console.log(`Project root: ${projectRoot}`)
        console.log(`Pareto AA Tranche - FalconXUSDC: ${FALCONX_AA_TRANCHE}`)
        console.log(`Ethereum EID: ${ETHEREUM_EID}`)
        console.log(`Monad EID: ${MONAD_EID}`)
        console.log('')
        console.log('Deployments')
        console.log(`Ethereum adapter contract: ${ETHEREUM_CONTRACT_NAME}`)
        console.log(`Ethereum adapter address: ${ethereumInfo.address || '<not deployed>'}`)
        if (ethereumInfo.error) {
            console.log(`Ethereum lookup note: ${ethereumInfo.error}`)
        }
        console.log(`Monad OFT contract: ${MONAD_CONTRACT_NAME}`)
        console.log(`Monad OFT address: ${monadInfo.address || '<not deployed>'}`)
        if (monadInfo.error) {
            console.log(`Monad lookup note: ${monadInfo.error}`)
        }
        console.log('')
        console.log('Deploy commands')
            console.log('npm run deploy:all')
            console.log('')
            console.log('Software-signer fallback commands')
            console.log('npx hardhat deploy --tags FalconXAAAdapter --network ethereum')
            console.log('npx hardhat deploy --tags MonadFalconXAA --network monad')
        console.log('')
        console.log('Wiring commands')
        console.log(`npx hardhat lz:oapp:wire ${configArg}`)
        console.log(`npx hardhat lz:oapp:peers:get ${configArg}`)
        console.log('')
        console.log('Security checks')
        console.log(`npx hardhat lz:bridge:security ${configArg}`)
        console.log(`npx hardhat lz:oapp:config:get ${configArg}`)
        console.log('')
        console.log('Bridge commands')
        console.log(`Ethereum -> Monad: ${ethereumToMonad}`)
        console.log(`Monad -> Ethereum: ${monadToEthereum}`)
        console.log('')

        if (ethereumInfo.address) {
            console.log('Approval note')
            console.log(
                `Approve Pareto AA Tranche - FalconXUSDC to the Ethereum adapter before the first Ethereum -> Monad transfer. Adapter: ${ethereumInfo.address}`
            )
            console.log('')
        }

        console.log('Ledger note')
        console.log('Set LEDGER_ADDRESS and RPC_URL_ETHEREUM/RPC_URL_MONAD before running npm run deploy:all.')
        console.log('')
    })
