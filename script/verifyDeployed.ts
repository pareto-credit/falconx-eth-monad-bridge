import 'dotenv/config'

import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

type SupportedNetwork = 'ethereum' | 'monad'

interface DeploymentFile {
    address: string
    args?: unknown[]
}

const DEPLOYMENTS: Record<SupportedNetwork, string> = {
    ethereum: 'FalconXAAAdapter',
    monad: 'MonadFalconXAA',
}

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }

    return value
}

function readDeployment(network: SupportedNetwork): DeploymentFile {
    const deploymentPath = path.join(process.cwd(), 'deployments', network, `${DEPLOYMENTS[network]}.json`)
    return JSON.parse(fs.readFileSync(deploymentPath, 'utf8')) as DeploymentFile
}

function normalizeArg(arg: unknown): string {
    if (typeof arg === 'string') {
        return arg
    }

    if (typeof arg === 'number' || typeof arg === 'bigint' || typeof arg === 'boolean') {
        return String(arg)
    }

    throw new Error(`Unsupported constructor argument type: ${typeof arg}`)
}

function verifyNetwork(network: SupportedNetwork) {
    const deployment = readDeployment(network)
    const args = (deployment.args || []).map(normalizeArg)
    const commandArgs = ['hardhat', 'verify', '--network', network, deployment.address, ...args]

    console.log(`Verifying ${DEPLOYMENTS[network]} on ${network}: ${deployment.address}`)

    execFileSync('npx', commandArgs, {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
    })
}

function parseTargets(argv: string[]): SupportedNetwork[] {
    if (argv.length === 0) {
        return ['ethereum', 'monad']
    }

    return argv.map((value) => {
        if (value !== 'ethereum' && value !== 'monad') {
            throw new Error(`Unsupported verification target: ${value}`)
        }

        return value
    })
}

function main() {
    requireEnv('ETHERSCAN_API_KEY')

    const targets = parseTargets(process.argv.slice(2))
    for (const target of targets) {
        verifyNetwork(target)
    }
}

main()