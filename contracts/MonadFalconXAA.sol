// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { OFT } from '@layerzerolabs/oft-evm/contracts/OFT.sol';

/// @title MonadFalconXAA
/// @notice LayerZero OFT representation of the FalconX AA tranche token on Monad.
contract MonadFalconXAA is OFT {
    /// @notice Initializes the Monad wrapped token contract.
    /// @param name_ ERC20 name for the wrapped token.
    /// @param symbol_ ERC20 symbol for the wrapped token.
    /// @param lzEndpoint_ The local LayerZero EndpointV2 address.
    /// @param delegate_ The owner and LayerZero delegate for admin configuration.
    constructor(string memory name_, string memory symbol_, address lzEndpoint_, address delegate_)
        OFT(name_, symbol_, lzEndpoint_, delegate_)
        Ownable(delegate_)
    {}
}