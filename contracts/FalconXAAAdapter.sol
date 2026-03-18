// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { OFTAdapter } from '@layerzerolabs/oft-evm/contracts/OFTAdapter.sol';

/// @title FalconXAAAdapter
/// @notice Escrows the canonical Pareto AA Tranche - FalconXUSDC token on Ethereum for LayerZero bridging.
contract FalconXAAAdapter is OFTAdapter {
    /// @notice Initializes the Ethereum adapter for the canonical Pareto AA Tranche - FalconXUSDC token.
    /// @param token_ The canonical Pareto AA Tranche - FalconXUSDC ERC20 on Ethereum.
    /// @param lzEndpoint_ The local LayerZero EndpointV2 address.
    /// @param delegate_ The owner and LayerZero delegate for admin configuration.
    constructor(address token_, address lzEndpoint_, address delegate_)
        OFTAdapter(token_, lzEndpoint_, delegate_)
        Ownable(delegate_)
    {}
}