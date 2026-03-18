import 'dotenv/config'
import 'hardhat-deploy'
import '@nomiclabs/hardhat-ethers'

import hre from 'hardhat'
import { ethers } from 'ethers'
import type { HardhatRuntimeEnvironment } from 'hardhat/types/runtime'
import type { ExtendedArtifact } from 'hardhat-deploy/types'

import { createGetHreByEid } from '@layerzerolabs/devtools-evm-hardhat'
import { EndpointId } from '@layerzerolabs/lz-definitions'

import { OfficialLedgerSigner } from './officialLedgerSigner'
import { wireWithLedger } from './wireLayerZero'

const ETHEREUM_EID = EndpointId.ETHEREUM_V2_MAINNET
const MONAD_EID = 30390

const FALCONX_AA_TRANCHE = '0xC26A6Fa2C37b38E549a4a1807543801Db684f99C'
const ETHEREUM_CONTRACT_NAME = 'FalconXAAAdapter'
const MONAD_CONTRACT_NAME = 'MonadFalconXAA'
const DEFAULT_LEDGER_DERIVATION_PATH = "m/44'/60'/0'/0/0"

type DeployReceipt = Awaited<ReturnType<ethers.Contract['deployTransaction']['wait']>>

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

function getLedgerDerivationPath(): string {
    return process.env.LEDGER_DERIVATION_PATH || DEFAULT_LEDGER_DERIVATION_PATH
}

function getExpectedLedgerAddress(): string {
    return ethers.utils.getAddress(requireEnv('LEDGER_ADDRESS'))
}

function getBridgeOwner(): string {
    return ethers.utils.getAddress(process.env.BRIDGE_OWNER || getExpectedLedgerAddress())
}

function serializeReceipt(receipt: DeployReceipt, contractAddress: string) {
    return {
        from: receipt.from,
        to: receipt.to ?? undefined,
        contractAddress,
        transactionHash: receipt.transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        transactionIndex: receipt.transactionIndex,
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
        gasUsed: receipt.gasUsed.toString(),
        logs: receipt.logs.map((log) => ({
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex,
            logIndex: log.logIndex,
            removed: log.removed,
            address: log.address,
            topics: [...log.topics],
            data: log.data,
        })),
        logsBloom: receipt.logsBloom,
        byzantium: receipt.byzantium,
        status: receipt.status,
        confirmations: receipt.confirmations,
    }
}

async function getVerifiedLedgerSigner(provider: ethers.providers.Provider): Promise<OfficialLedgerSigner> {
    const signer = new OfficialLedgerSigner(provider, getLedgerDerivationPath())
    const actualAddress = ethers.utils.getAddress(await signer.getAddress())
    const expectedAddress = getExpectedLedgerAddress()

    if (actualAddress !== expectedAddress) {
        throw new Error(
            `Connected Ledger address ${actualAddress} does not match LEDGER_ADDRESS ${expectedAddress}. Check LEDGER_DERIVATION_PATH.`
        )
    }

    return signer
}

async function getReusableDeployment(hreForNetwork: HardhatRuntimeEnvironment, contractName: string) {
    const deployment = await hreForNetwork.deployments.getOrNull(contractName)

    if (!deployment) {
        return undefined
    }

    const code = await hreForNetwork.ethers.provider.getCode(deployment.address)
    if (code === '0x') {
        return undefined
    }

    return deployment
}

async function saveDeployment(
    hreForNetwork: HardhatRuntimeEnvironment,
    contractName: string,
    artifact: ExtendedArtifact,
    address: string,
    args: unknown[],
    receipt: DeployReceipt
) {
    await hreForNetwork.deployments.save(contractName, {
        address,
        abi: artifact.abi,
        transactionHash: receipt.transactionHash,
        receipt: serializeReceipt(receipt, address),
        args,
        solcInput: artifact.solcInput,
        solcInputHash: artifact.solcInputHash,
        metadata: artifact.metadata,
        bytecode: artifact.bytecode,
        deployedBytecode: await hreForNetwork.ethers.provider.getCode(address),
        userdoc: artifact.userdoc,
        devdoc: artifact.devdoc,
        methodIdentifiers: artifact.methodIdentifiers,
        storageLayout: artifact.storageLayout,
    })
}

async function deployContract(
    hreForNetwork: HardhatRuntimeEnvironment,
    contractName: string,
    args: unknown[]
): Promise<string> {
    const existing = await getReusableDeployment(hreForNetwork, contractName)
    if (existing) {
        console.log(`Reusing ${contractName} on ${hreForNetwork.network.name}: ${existing.address}`)
        return existing.address
    }

    const artifact = await hreForNetwork.deployments.getExtendedArtifact(contractName)
    const signer = await getVerifiedLedgerSigner(hreForNetwork.ethers.provider)
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer)

    console.log(`Deploying ${contractName} on ${hreForNetwork.network.name} from ${await signer.getAddress()}`)
    const contract = await factory.deploy(...args)
    console.log(`Sent deployment tx for ${contractName}: ${contract.deployTransaction.hash}`)

    const receipt = await contract.deployTransaction.wait()
    await saveDeployment(hreForNetwork, contractName, artifact, contract.address, args, receipt)

    console.log(`Deployed ${contractName} on ${hreForNetwork.network.name}: ${contract.address}`)
    return contract.address
}

async function main() {
    requireEnv('RPC_URL_ETHEREUM')
    requireEnv('RPC_URL_MONAD')

    console.log(`Ledger deployer: ${getExpectedLedgerAddress()}`)
    console.log(`Ledger derivation path: ${getLedgerDerivationPath()}`)
    console.log(`Bridge owner: ${getBridgeOwner()}`)

    await hre.run('compile')

    const getHreByEid = createGetHreByEid(hre)
    const ethereumHre = await getHreByEid(ETHEREUM_EID)
    const monadHre = await getHreByEid(MONAD_EID)

    const ethereumEndpoint = await ethereumHre.deployments.get('EndpointV2')
    const monadEndpoint = await monadHre.deployments.get('EndpointV2')

    await deployContract(ethereumHre, ETHEREUM_CONTRACT_NAME, [
        FALCONX_AA_TRANCHE,
        ethereumEndpoint.address,
        getBridgeOwner(),
    ])

    await deployContract(monadHre, MONAD_CONTRACT_NAME, ['Pareto AA Tranche - FalconXUSDC', 'AA_FalconXUSDC', monadEndpoint.address, getBridgeOwner()])

    await wireWithLedger(hre)

    await hre.run('lz:oapp:peers:get', { oappConfig: 'layerzero.config.ts' })
    await hre.run('lz:bridge:info')
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})