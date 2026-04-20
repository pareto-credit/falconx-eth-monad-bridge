// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { MessagingFee, MessagingReceipt, Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { OFTReceipt, SendParam } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

/// @title MonadFalconXAA
/// @notice LayerZero OFT representation of the Pareto AA Tranche - FalconXUSDC token on Monad.
contract MonadFalconXAA is OFT, Pausable {
    /// @notice Initializes the Monad wrapped token contract for Pareto AA Tranche - FalconXUSDC.
    /// @param name_ ERC20 name for the wrapped token.
    /// @param symbol_ ERC20 symbol for the wrapped token.
    /// @param lzEndpoint_ The local LayerZero EndpointV2 address.
    /// @param delegate_ The owner and LayerZero delegate for admin configuration.
    constructor(string memory name_, string memory symbol_, address lzEndpoint_, address delegate_) 
        OFT(name_, symbol_, lzEndpoint_, delegate_) 
        Ownable(delegate_) 
    {}

    /// @notice Halts all bridge sends and receives until unpaused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Restores normal bridge operation after an incident.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Sends tokens to a remote chain while the bridge is live.
    function send(
        SendParam calldata _sendParam,
        MessagingFee calldata _fee,
        address _refundAddress
    )
        external
        payable
        override
        whenNotPaused
        returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt)
    {
        return _send(_sendParam, _fee, _refundAddress);
    }

    /// @notice Processes verified inbound messages while the bridge is live.
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override whenNotPaused {
        super._lzReceive(_origin, _guid, _message, _executor, _extraData);
    }
}
