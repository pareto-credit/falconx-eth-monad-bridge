import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { TwoWayConfig, generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption } from '@layerzerolabs/toolbox-hardhat'

import type { OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

const MONAD_MAINNET_EID = 30390

const ethereumContract: OmniPointHardhat = {
    eid: EndpointId.ETHEREUM_V2_MAINNET,
    contractName: 'FalconXAAAdapter',
}

const monadContract: OmniPointHardhat = {
    eid: MONAD_MAINNET_EID,
    contractName: 'MonadFalconXAA',
}

// Ethereum <-> Monad

// For this example's simplicity, we will use the same enforced options values for sending to all chains
// For production, you should ensure `gas` is set to the correct value through profiling the gas usage of calling OFT._lzReceive(...) on the destination chain
// To learn more, read https://docs.layerzero.network/v2/concepts/applications/oapp-standard#execution-options-and-enforced-settings
const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 120000,
        value: 0,
    },
]

const BRIDGE_DVNS: string[] = ['BitGo', 'Deutsche Telekom', 'Horizen', 'LayerZero Labs', 'Nethermind']
const BRIDGE_DVN_THRESHOLD = 3
const ETHEREUM_TO_MONAD_CONFIRMATIONS = 32
const MONAD_TO_ETHEREUM_CONFIRMATIONS = 32

// With the config generator, pathways declared are automatically bidirectional
// i.e. if you declare A,B there's no need to declare B,A
const pathways: TwoWayConfig[] = [
    [
        ethereumContract,
        monadContract,
        [[], [BRIDGE_DVNS, BRIDGE_DVN_THRESHOLD]], // [ requiredDVN[], [ optionalDVN[], threshold ] ]
        [ETHEREUM_TO_MONAD_CONFIRMATIONS, MONAD_TO_ETHEREUM_CONFIRMATIONS], // [A to B confirmations, B to A confirmations]
        [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS], // Chain B enforcedOptions, Chain A enforcedOptions
    ],
]

export default async function () {
    // Generate the connections config based on the pathways
    const connections = await generateConnectionsConfig(pathways)
    return {
        contracts: [{ contract: ethereumContract }, { contract: monadContract }],
        connections,
    }
}
