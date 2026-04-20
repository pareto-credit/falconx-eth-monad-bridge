import { BigNumber, Contract, constants } from 'ethers'
import { getAddress, hexlify } from 'ethers/lib/utils'
import { task, types } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

import { createGetHreByEid } from '@layerzerolabs/devtools-evm-hardhat'
import { endpointIdToNetwork } from '@layerzerolabs/lz-definitions'
import { addressToBytes32, bytes32ToEthAddress } from '@layerzerolabs/lz-v2-utilities'

import { decodeLzReceiveOptions, deploymentMetadataUrl, getOAppInfoByEid } from './utils'

const ETHEREUM_EID = 30101
const MONAD_EID = 30390
const MSG_TYPE_SEND = 1

const OAPP_READ_ABI = [
    'function endpoint() view returns (address)',
    'function peers(uint32) view returns (bytes32)',
    'function owner() view returns (address)',
    'function enforcedOptions(uint32,uint16) view returns (bytes)',
    'function token() view returns (address)',
    'function approvalRequired() view returns (bool)',
]

const ENDPOINT_READ_ABI = [
    'function getSendLibrary(address,uint32) view returns (address)',
    'function isDefaultSendLibrary(address,uint32) view returns (bool)',
    'function getReceiveLibrary(address,uint32) view returns (address,bool)',
]

const SEND_LIB_READ_ABI = [
    'function getUlnConfig(address,uint32) view returns ((uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs))',
    'function getAppUlnConfig(address,uint32) view returns ((uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs))',
    'function getExecutorConfig(address,uint32) view returns ((uint32 maxMessageSize,address executor))',
    'function executorConfigs(address,uint32) view returns (uint32 maxMessageSize,address executor)',
]

const RECEIVE_LIB_READ_ABI = [
    'function getUlnConfig(address,uint32) view returns ((uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs))',
    'function getAppUlnConfig(address,uint32) view returns ((uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs))',
]

interface BridgeSecurityArgs {
    oappConfig: string
    srcEid: number
    dstEid: number
    srcOapp?: string
    dstOapp?: string
}

interface UlnConfigView {
    confirmations: string
    requiredDVNCount: number
    optionalDVNCount: number
    optionalDVNThreshold: number
    requiredDVNs: string[]
    optionalDVNs: string[]
}

interface ExecutorConfigView {
    maxMessageSize: string
    executor: string
}

interface DvnMetadataEntry {
    id?: string
    canonicalName?: string
}

type DvnRegistry = Record<string, DvnMetadataEntry>

interface DeploymentMetadata {
    [network: string]: {
        dvns?: DvnRegistry
    }
}

interface OAppLocalInfo {
    endpoint: string
    owner?: string
    peer: string
    peerAddress?: string
    enforcedOptions?: string
    token?: string
    approvalRequired?: boolean
}

interface DirectionSecurityReport {
    sendLibrary: string
    sendLibraryIsDefault: boolean
    receiveLibrary: string
    receiveLibraryIsDefault: boolean
    sendActiveUln: UlnConfigView
    sendCustomUln: UlnConfigView
    receiveActiveUln: UlnConfigView
    receiveCustomUln: UlnConfigView
    executorActive: ExecutorConfigView
    executorCustom: ExecutorConfigView
    sendReceiveMatch: boolean
    sendReceiveMatchBasis: 'address' | 'canonical'
    peerMatch: boolean
    warnings: string[]
}

function getLabel(eid: number): string {
    return endpointIdToNetwork(eid) || `eid:${eid}`
}

function normalizeAddress(address: string): string {
    return address.toLowerCase() === constants.AddressZero ? constants.AddressZero : getAddress(address)
}

function normalizeAddressList(addresses: string[]): string[] {
    return addresses.map((address) => normalizeAddress(address))
}

function normalizeDvnRegistry(registry?: DvnRegistry): DvnRegistry | undefined {
    if (!registry) {
        return undefined
    }

    return Object.fromEntries(
        Object.entries(registry).map(([address, entry]) => [normalizeAddress(address).toLowerCase(), entry])
    )
}

function normalizeUlnConfig(config: {
    confirmations: BigNumber
    requiredDVNCount: number
    optionalDVNCount: number
    optionalDVNThreshold: number
    requiredDVNs: string[]
    optionalDVNs: string[]
}): UlnConfigView {
    return {
        confirmations: BigNumber.from(config.confirmations).toString(),
        requiredDVNCount: Number(config.requiredDVNCount),
        optionalDVNCount: Number(config.optionalDVNCount),
        optionalDVNThreshold: Number(config.optionalDVNThreshold),
        requiredDVNs: normalizeAddressList(config.requiredDVNs || []),
        optionalDVNs: normalizeAddressList(config.optionalDVNs || []),
    }
}

function normalizeExecutorConfig(config: { maxMessageSize: BigNumber; executor: string }): ExecutorConfigView {
    return {
        maxMessageSize: BigNumber.from(config.maxMessageSize).toString(),
        executor: normalizeAddress(config.executor),
    }
}

function resolveDvnLabel(address: string, registry?: DvnRegistry): string {
    const normalized = normalizeAddress(address)
    const metadata = registry?.[normalized.toLowerCase()]
    const label = metadata?.canonicalName || metadata?.id

    return label ? `${label} (${normalized})` : normalized
}

function resolveDvnIdentity(address: string, registry?: DvnRegistry): string {
    const normalized = normalizeAddress(address)
    const metadata = registry?.[normalized.toLowerCase()]

    return metadata?.id || metadata?.canonicalName?.toLowerCase() || normalized.toLowerCase()
}

function formatAddresses(addresses: string[], registry?: DvnRegistry): string {
    return addresses.length > 0 ? addresses.map((address) => resolveDvnLabel(address, registry)).join(', ') : 'none'
}

function formatUlnConfig(config: UlnConfigView, registry?: DvnRegistry): string {
    return [
        `confirmations=${config.confirmations}`,
        `required=${config.requiredDVNCount} [${formatAddresses(config.requiredDVNs, registry)}]`,
        `optional=${config.optionalDVNThreshold}/${config.optionalDVNCount} [${formatAddresses(config.optionalDVNs, registry)}]`,
    ].join(' | ')
}

function isUnsetUlnConfig(config: UlnConfigView): boolean {
    return (
        config.confirmations === '0' &&
        config.requiredDVNCount === 0 &&
        config.optionalDVNCount === 0 &&
        config.optionalDVNThreshold === 0 &&
        config.requiredDVNs.length === 0 &&
        config.optionalDVNs.length === 0
    )
}

function isUnsetExecutorConfig(config: ExecutorConfigView): boolean {
    return config.maxMessageSize === '0' && config.executor === constants.AddressZero
}

function sameAddresses(
    left: string[],
    right: string[],
    leftRegistry?: DvnRegistry,
    rightRegistry?: DvnRegistry
): boolean {
    if (left.length !== right.length) {
        return false
    }

    const leftResolved = left.map((address) => resolveDvnIdentity(address, leftRegistry)).sort()
    const rightResolved = right.map((address) => resolveDvnIdentity(address, rightRegistry)).sort()

    return leftResolved.every((address, index) => address === rightResolved[index])
}

function compareUlnConfig(
    left: UlnConfigView,
    right: UlnConfigView,
    leftRegistry?: DvnRegistry,
    rightRegistry?: DvnRegistry
): { matches: boolean; basis: 'address' | 'canonical' } {
    const basis = leftRegistry && rightRegistry ? 'canonical' : 'address'

    return {
        basis,
        matches:
            left.confirmations === right.confirmations &&
            left.requiredDVNCount === right.requiredDVNCount &&
            left.optionalDVNCount === right.optionalDVNCount &&
            left.optionalDVNThreshold === right.optionalDVNThreshold &&
            sameAddresses(left.requiredDVNs, right.requiredDVNs, leftRegistry, rightRegistry) &&
            sameAddresses(left.optionalDVNs, right.optionalDVNs, leftRegistry, rightRegistry),
    }
}

function isSortedAscending(addresses: string[]): boolean {
    const normalized = addresses.map((address) => address.toLowerCase())
    const sorted = [...normalized].sort()

    return normalized.every((address, index) => address === sorted[index])
}

function decodePeer(bytes32: string): string | undefined {
    if (!bytes32 || bytes32 === constants.HashZero) {
        return undefined
    }

    return normalizeAddress(bytes32ToEthAddress(bytes32))
}

function buildDirectionWarnings(
    sendLibraryIsDefault: boolean,
    receiveLibraryIsDefault: boolean,
    sendCustomUln: UlnConfigView,
    receiveCustomUln: UlnConfigView,
    sendActiveUln: UlnConfigView,
    receiveActiveUln: UlnConfigView,
    executorCustom: ExecutorConfigView,
    peerMatch: boolean,
    sendReceiveMatch: boolean
): string[] {
    const warnings: string[] = []

    if (!peerMatch) {
        warnings.push('Peer wiring does not match the expected remote OApp address.')
    }

    if (!sendReceiveMatch) {
        warnings.push('Send-side and receive-side ULN configs do not match. This can block messages.')
    }

    if (sendActiveUln.requiredDVNCount === 1 && sendActiveUln.optionalDVNThreshold === 0) {
        warnings.push('This direction currently accepts a single required DVN and no optional DVN threshold.')
    }

    if (sendLibraryIsDefault) {
        warnings.push('Send library is inherited from the endpoint default instead of being explicitly pinned.')
    }

    if (receiveLibraryIsDefault) {
        warnings.push('Receive library is inherited from the endpoint default instead of being explicitly pinned.')
    }

    if (isUnsetUlnConfig(sendCustomUln)) {
        warnings.push('Send ULN config is inherited from LayerZero defaults instead of being explicitly pinned.')
    }

    if (isUnsetUlnConfig(receiveCustomUln)) {
        warnings.push('Receive ULN config is inherited from LayerZero defaults instead of being explicitly pinned.')
    }

    if (isUnsetExecutorConfig(executorCustom)) {
        warnings.push('Executor config is inherited from LayerZero defaults instead of being explicitly pinned.')
    }

    if (!isSortedAscending(sendActiveUln.requiredDVNs) || !isSortedAscending(sendActiveUln.optionalDVNs)) {
        warnings.push('Send-side DVN addresses are not sorted ascending.')
    }

    if (!isSortedAscending(receiveActiveUln.requiredDVNs) || !isSortedAscending(receiveActiveUln.optionalDVNs)) {
        warnings.push('Receive-side DVN addresses are not sorted ascending.')
    }

    if (sendActiveUln.optionalDVNThreshold > sendActiveUln.optionalDVNCount) {
        warnings.push('Send-side optional DVN threshold is greater than the optional DVN count.')
    }

    if (receiveActiveUln.optionalDVNThreshold > receiveActiveUln.optionalDVNCount) {
        warnings.push('Receive-side optional DVN threshold is greater than the optional DVN count.')
    }

    return warnings
}

async function tryRead<T>(reader: () => Promise<T>): Promise<T | undefined> {
    try {
        return await reader()
    } catch {
        return undefined
    }
}

async function fetchDeploymentMetadata(): Promise<DeploymentMetadata | undefined> {
    try {
        const response = await fetch(deploymentMetadataUrl)
        if (!response.ok) {
            return undefined
        }

        return (await response.json()) as DeploymentMetadata
    } catch {
        return undefined
    }
}

function getDvnRegistryByEid(metadata: DeploymentMetadata | undefined, eid: number): DvnRegistry | undefined {
    const network = endpointIdToNetwork(eid)

    if (!network) {
        return undefined
    }

    return normalizeDvnRegistry(metadata?.[network]?.dvns)
}

async function readLocalOAppInfo(
    hre: HardhatRuntimeEnvironment,
    oappAddress: string,
    remoteEid: number
): Promise<OAppLocalInfo> {
    const oapp = new Contract(oappAddress, OAPP_READ_ABI, hre.ethers.provider)
    const [endpoint, owner, peer, enforcedOptions, token, approvalRequired] = await Promise.all([
        oapp.endpoint(),
        tryRead(() => oapp.owner()),
        oapp.peers(remoteEid),
        tryRead(() => oapp.enforcedOptions(remoteEid, MSG_TYPE_SEND)),
        tryRead(() => oapp.token()),
        tryRead(() => oapp.approvalRequired()),
    ])

    return {
        endpoint: normalizeAddress(endpoint),
        owner: owner ? normalizeAddress(owner) : undefined,
        peer,
        peerAddress: decodePeer(peer),
        enforcedOptions,
        token: token ? normalizeAddress(token) : undefined,
        approvalRequired,
    }
}

async function readDirectionSecurity(
    srcHre: HardhatRuntimeEnvironment,
    dstHre: HardhatRuntimeEnvironment,
    srcAddress: string,
    dstAddress: string,
    srcEid: number,
    dstEid: number,
    srcInfo: OAppLocalInfo,
    dstInfo: OAppLocalInfo,
    srcDvnRegistry?: DvnRegistry,
    dstDvnRegistry?: DvnRegistry
): Promise<DirectionSecurityReport> {
    const srcEndpoint = new Contract(srcInfo.endpoint, ENDPOINT_READ_ABI, srcHre.ethers.provider)
    const dstEndpoint = new Contract(dstInfo.endpoint, ENDPOINT_READ_ABI, dstHre.ethers.provider)

    const [sendLibrary, sendLibraryIsDefault, [receiveLibrary, receiveLibraryIsDefault]] = await Promise.all([
        srcEndpoint.getSendLibrary(srcAddress, dstEid),
        srcEndpoint.isDefaultSendLibrary(srcAddress, dstEid),
        dstEndpoint.getReceiveLibrary(dstAddress, srcEid),
    ])

    const sendLib = new Contract(sendLibrary, SEND_LIB_READ_ABI, srcHre.ethers.provider)
    const receiveLib = new Contract(receiveLibrary, RECEIVE_LIB_READ_ABI, dstHre.ethers.provider)

    const [
        sendActiveUlnRaw,
        sendCustomUlnRaw,
        executorActiveRaw,
        executorCustomRaw,
        receiveActiveUlnRaw,
        receiveCustomUlnRaw,
    ] = await Promise.all([
        sendLib.getUlnConfig(srcAddress, dstEid),
        sendLib.getAppUlnConfig(srcAddress, dstEid),
        sendLib.getExecutorConfig(srcAddress, dstEid),
        sendLib.executorConfigs(srcAddress, dstEid),
        receiveLib.getUlnConfig(dstAddress, srcEid),
        receiveLib.getAppUlnConfig(dstAddress, srcEid),
    ])

    const sendActiveUln = normalizeUlnConfig(sendActiveUlnRaw)
    const sendCustomUln = normalizeUlnConfig(sendCustomUlnRaw)
    const receiveActiveUln = normalizeUlnConfig(receiveActiveUlnRaw)
    const receiveCustomUln = normalizeUlnConfig(receiveCustomUlnRaw)
    const executorActive = normalizeExecutorConfig(executorActiveRaw)
    const executorCustom = normalizeExecutorConfig(executorCustomRaw)

    const peerMatch =
        srcInfo.peerAddress?.toLowerCase() === dstAddress.toLowerCase() &&
        dstInfo.peerAddress?.toLowerCase() === srcAddress.toLowerCase()

    const sendReceiveComparison = compareUlnConfig(sendActiveUln, receiveActiveUln, srcDvnRegistry, dstDvnRegistry)
    const warnings = buildDirectionWarnings(
        Boolean(sendLibraryIsDefault),
        Boolean(receiveLibraryIsDefault),
        sendCustomUln,
        receiveCustomUln,
        sendActiveUln,
        receiveActiveUln,
        executorCustom,
        peerMatch,
        sendReceiveComparison.matches
    )

    return {
        sendLibrary: normalizeAddress(sendLibrary),
        sendLibraryIsDefault: Boolean(sendLibraryIsDefault),
        receiveLibrary: normalizeAddress(receiveLibrary),
        receiveLibraryIsDefault: Boolean(receiveLibraryIsDefault),
        sendActiveUln,
        sendCustomUln,
        receiveActiveUln,
        receiveCustomUln,
        executorActive,
        executorCustom,
        sendReceiveMatch: sendReceiveComparison.matches,
        sendReceiveMatchBasis: sendReceiveComparison.basis,
        peerMatch,
        warnings,
    }
}

function printContractSummary(label: string, address: string, info: OAppLocalInfo) {
    console.log(label)
    console.log(`OApp: ${address}`)
    console.log(`Endpoint: ${info.endpoint}`)
    console.log(`Owner / delegate: ${info.owner || 'unavailable'}`)
    console.log(`Peer: ${info.peerAddress || info.peer}`)
    if (info.token) {
        console.log(`Underlying token: ${info.token}`)
    }
    if (info.approvalRequired != null) {
        console.log(`Approval required: ${info.approvalRequired}`)
    }
    if (info.enforcedOptions) {
        console.log(`Enforced options (msgType=1): ${decodeLzReceiveOptions(info.enforcedOptions)}`)
    }
    console.log('')
}

function printDirectionSummary(
    srcEid: number,
    dstEid: number,
    report: DirectionSecurityReport,
    sendDvnRegistry?: DvnRegistry,
    receiveDvnRegistry?: DvnRegistry
) {
    console.log(`${getLabel(srcEid)} -> ${getLabel(dstEid)}`)
    console.log(`Peer wiring: ${report.peerMatch ? 'OK' : 'MISMATCH'}`)
    console.log(
        `Send library: ${report.sendLibrary} (${report.sendLibraryIsDefault ? 'default / inherited' : 'custom / pinned'})`
    )
    console.log(
        `Receive library: ${report.receiveLibrary} (${report.receiveLibraryIsDefault ? 'default / inherited' : 'custom / pinned'})`
    )
    console.log(
        `Send ULN config source: ${isUnsetUlnConfig(report.sendCustomUln) ? 'default / inherited' : 'custom / pinned'}`
    )
    console.log(
        `Receive ULN config source: ${isUnsetUlnConfig(report.receiveCustomUln) ? 'default / inherited' : 'custom / pinned'}`
    )
    console.log(
        `Executor config source: ${isUnsetExecutorConfig(report.executorCustom) ? 'default / inherited' : 'custom / pinned'}`
    )
    console.log(`Send ULN active: ${formatUlnConfig(report.sendActiveUln, sendDvnRegistry)}`)
    console.log(`Receive ULN active: ${formatUlnConfig(report.receiveActiveUln, receiveDvnRegistry)}`)
    console.log(
        `Executor active: maxMessageSize=${report.executorActive.maxMessageSize} | executor=${report.executorActive.executor}`
    )
    console.log(
        `Send / receive ULN match: ${report.sendReceiveMatch ? 'OK' : 'MISMATCH'} (${report.sendReceiveMatchBasis === 'canonical' ? 'canonical DVN identity' : 'raw address comparison'})`
    )
    if (report.warnings.length > 0) {
        console.log('Warnings:')
        for (const warning of report.warnings) {
            console.log(`- ${warning}`)
        }
    } else {
        console.log('Warnings: none')
    }
    console.log('')
}

task('lz:bridge:security', 'Inspect live LayerZero DVN, executor, peer, and library security posture for a pathway')
    .addOptionalParam('oappConfig', 'Path to the LayerZero config file', 'layerzero.config.ts', types.string)
    .addOptionalParam('srcEid', 'Source endpoint ID', ETHEREUM_EID, types.int)
    .addOptionalParam('dstEid', 'Destination endpoint ID', MONAD_EID, types.int)
    .addOptionalParam('srcOapp', 'Override source OApp address', undefined, types.string)
    .addOptionalParam('dstOapp', 'Override destination OApp address', undefined, types.string)
    .setAction(async (args: BridgeSecurityArgs, hre) => {
        if (args.srcEid === args.dstEid) {
            throw new Error('srcEid and dstEid must be different')
        }

        const getHreByEid = createGetHreByEid(hre)
        const [srcHre, dstHre] = await Promise.all([getHreByEid(args.srcEid), getHreByEid(args.dstEid)])
        const [srcOApp, dstOApp] = await Promise.all([
            getOAppInfoByEid(args.srcEid, args.oappConfig, srcHre, args.srcOapp),
            getOAppInfoByEid(args.dstEid, args.oappConfig, dstHre, args.dstOapp),
        ])
        const deploymentMetadata = await fetchDeploymentMetadata()
        const srcDvnRegistry = getDvnRegistryByEid(deploymentMetadata, args.srcEid)
        const dstDvnRegistry = getDvnRegistryByEid(deploymentMetadata, args.dstEid)

        const srcAddress = normalizeAddress(srcOApp.address)
        const dstAddress = normalizeAddress(dstOApp.address)
        const expectedSrcPeer = hexlify(addressToBytes32(dstAddress))
        const expectedDstPeer = hexlify(addressToBytes32(srcAddress))

        const [srcInfo, dstInfo] = await Promise.all([
            readLocalOAppInfo(srcHre, srcAddress, args.dstEid),
            readLocalOAppInfo(dstHre, dstAddress, args.srcEid),
        ])
        const [forward, reverse] = await Promise.all([
            readDirectionSecurity(
                srcHre,
                dstHre,
                srcAddress,
                dstAddress,
                args.srcEid,
                args.dstEid,
                srcInfo,
                dstInfo,
                srcDvnRegistry,
                dstDvnRegistry
            ),
            readDirectionSecurity(
                dstHre,
                srcHre,
                dstAddress,
                srcAddress,
                args.dstEid,
                args.srcEid,
                dstInfo,
                srcInfo,
                dstDvnRegistry,
                srcDvnRegistry
            ),
        ])

        console.log('')
        console.log(`LayerZero bridge security posture: ${getLabel(args.srcEid)} <-> ${getLabel(args.dstEid)}`)
        console.log('')
        printContractSummary(`${getLabel(args.srcEid)} local contract`, srcAddress, srcInfo)
        printContractSummary(`${getLabel(args.dstEid)} local contract`, dstAddress, dstInfo)
        printDirectionSummary(args.srcEid, args.dstEid, forward, srcDvnRegistry, dstDvnRegistry)
        printDirectionSummary(args.dstEid, args.srcEid, reverse, dstDvnRegistry, srcDvnRegistry)
        console.log('Peer expectation')
        console.log(`${getLabel(args.srcEid)} peer bytes32 should equal ${expectedSrcPeer}`)
        console.log(`${getLabel(args.dstEid)} peer bytes32 should equal ${expectedDstPeer}`)
        console.log('')
    })
