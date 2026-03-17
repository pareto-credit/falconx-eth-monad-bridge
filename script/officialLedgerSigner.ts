import Eth from '@ledgerhq/hw-app-eth'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import { ethers } from 'ethers'

const DEFAULT_LEDGER_RETRY_COUNT = 50
const DEFAULT_LEDGER_RETRY_DELAY_MS = 100

let sharedEthPromise: Promise<Eth> | undefined

function wait(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function getSharedEth(): Promise<Eth> {
    if (!sharedEthPromise) {
        sharedEthPromise = TransportNodeHid.open(undefined).then((transport) => new Eth(transport))
    }

    return sharedEthPromise
}

async function withRetry<T>(callback: (eth: Eth) => Promise<T>): Promise<T> {
    const eth = await getSharedEth()

    for (let attempt = 0; attempt < DEFAULT_LEDGER_RETRY_COUNT; attempt += 1) {
        try {
            return await callback(eth)
        } catch (error) {
            const errorWithId = error as { id?: string }
            if (errorWithId.id !== 'TransportLocked') {
                throw error
            }

            await wait(DEFAULT_LEDGER_RETRY_DELAY_MS)
        }
    }

    throw new Error('Timed out waiting for Ledger device access')
}

export class OfficialLedgerSigner extends ethers.Signer {
    readonly provider?: ethers.providers.Provider
    readonly derivationPath: string

    constructor(provider?: ethers.providers.Provider, derivationPath = "m/44'/60'/0'/0/0") {
        super()
        this.provider = provider
        this.derivationPath = derivationPath
    }

    async getAddress(): Promise<string> {
        const account = await withRetry((eth) => eth.getAddress(this.derivationPath))
        return ethers.utils.getAddress(account.address)
    }

    async signMessage(message: ethers.utils.Bytes | string): Promise<string> {
        const messageBytes = typeof message === 'string' ? ethers.utils.toUtf8Bytes(message) : message
        const messageHex = ethers.utils.hexlify(messageBytes).slice(2)
        const signature = await withRetry((eth) => eth.signPersonalMessage(this.derivationPath, messageHex))

        return ethers.utils.joinSignature({
            r: `0x${signature.r}`,
            s: `0x${signature.s}`,
            v: signature.v,
        })
    }

    async signTransaction(transaction: ethers.providers.TransactionRequest): Promise<string> {
        const resolved = await ethers.utils.resolveProperties(transaction)
        const unsignedTransaction: ethers.utils.UnsignedTransaction = {
            type: resolved.type ?? undefined,
            chainId: resolved.chainId ?? undefined,
            to: resolved.to ?? undefined,
            nonce: resolved.nonce == null ? undefined : ethers.BigNumber.from(resolved.nonce).toNumber(),
            gasLimit: resolved.gasLimit ?? undefined,
            gasPrice: resolved.gasPrice ?? undefined,
            maxFeePerGas: resolved.maxFeePerGas ?? undefined,
            maxPriorityFeePerGas: resolved.maxPriorityFeePerGas ?? undefined,
            data: resolved.data ?? undefined,
            value: resolved.value ?? undefined,
            accessList: resolved.accessList ?? undefined,
        }

        const rawTransaction = ethers.utils.serializeTransaction(unsignedTransaction).slice(2)
        const signature = await withRetry((eth) => eth.signTransaction(this.derivationPath, rawTransaction, null))

        return ethers.utils.serializeTransaction(unsignedTransaction, {
            r: `0x${signature.r}`,
            s: `0x${signature.s}`,
            v: ethers.BigNumber.from(`0x${signature.v}`).toNumber(),
        })
    }

    connect(provider: ethers.providers.Provider): ethers.Signer {
        return new OfficialLedgerSigner(provider, this.derivationPath)
    }
}