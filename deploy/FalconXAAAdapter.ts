import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'

const contractName = 'FalconXAAAdapter'
const ethereumNetworkName = 'ethereum'
const falconXAATranche = '0xC26A6Fa2C37b38E549a4a1807543801Db684f99C'

const deploy: DeployFunction = async (hre) => {
    const { getNamedAccounts, deployments, network } = hre

    if (network.name !== ethereumNetworkName) {
        return
    }

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    const bridgeOwner = process.env.BRIDGE_OWNER || deployer
    const endpointV2Deployment = await hre.deployments.get('EndpointV2')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)
    console.log(`Bridge owner: ${bridgeOwner}`)

    const { address } = await deploy(contractName, {
        from: deployer,
        args: [falconXAATranche, endpointV2Deployment.address, bridgeOwner],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed contract: ${contractName}, network: ${hre.network.name}, address: ${address}`)
}

deploy.tags = [contractName]

export default deploy