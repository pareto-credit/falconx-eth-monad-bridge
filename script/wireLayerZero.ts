import { HardhatRuntimeEnvironment } from 'hardhat/types/runtime'
import { ethers } from 'ethers'

import {
    createConfigExecuteFlow,
    createConfigLoadFlow,
    createSignAndSendFlow,
    createWireFlow,
    type OmniSignerFactory,
} from '@layerzerolabs/devtools'
import { OmniSignerEVM } from '@layerzerolabs/devtools-evm'
import {
    createConnectedContractFactory,
    createGetHreByEid,
    createOmniGraphHardhatTransformer,
    createProviderFactory,
} from '@layerzerolabs/devtools-evm-hardhat'
import { configureOApp, type OAppEdgeConfig, type OAppNodeConfig, type OAppOmniGraph } from '@layerzerolabs/ua-devtools'
import { createOAppFactory } from '@layerzerolabs/ua-devtools-evm'
import { OAppOmniGraphHardhatSchema, type OAppOmniGraphHardhat } from '@layerzerolabs/ua-devtools-evm-hardhat'

import { OfficialLedgerSigner } from './officialLedgerSigner'

const DEFAULT_LEDGER_DERIVATION_PATH = "m/44'/60'/0'/0/0"

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

export async function wireWithLedger(rootHre: HardhatRuntimeEnvironment, configPath = 'layerzero.config.ts') {
    const getHreByEid = createGetHreByEid(rootHre)
    const providerFactory = createProviderFactory(getHreByEid)
    const loadConfig = createConfigLoadFlow<OAppOmniGraphHardhat>({ configSchema: OAppOmniGraphHardhatSchema })
    const hardhatGraph = await loadConfig({ configPath })
    const transformGraph = createOmniGraphHardhatTransformer<OAppNodeConfig | undefined, OAppEdgeConfig | undefined>()
    const graph: OAppOmniGraph = await transformGraph(hardhatGraph)

    const sdkFactory = createOAppFactory(createConnectedContractFactory(undefined, providerFactory))
    const executeConfig = createConfigExecuteFlow({
        configurator: configureOApp,
        sdkFactory,
    })

    const signerCache = new Map<number, Promise<OmniSignerEVM>>()
    const createSigner: OmniSignerFactory = async (eid) => {
        if (!signerCache.has(eid)) {
            signerCache.set(
                eid,
                (async () => {
                    const provider = await providerFactory(eid)
                    const signer = await getVerifiedLedgerSigner(provider)
                    return new OmniSignerEVM(eid, signer)
                })()
            )
        }

        return signerCache.get(eid) as Promise<OmniSignerEVM>
    }

    const signAndSend = createSignAndSendFlow({ createSigner })
    const wireFlow = createWireFlow({ executeConfig, signAndSend })
    const assertOnly = ['1', 'true', 'yes'].includes((process.env.LZ_ASSERT_ONLY || '').toLowerCase())
    const [, errors, pending] = await wireFlow({ graph, assert: assertOnly })

    if (errors.length > 0) {
        throw new Error(`LayerZero wiring produced ${errors.length} failed transaction(s).`)
    }

    if (pending.length > 0) {
        throw new Error(`LayerZero wiring left ${pending.length} pending transaction(s).`)
    }
}