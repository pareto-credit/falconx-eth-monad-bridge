// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { IOAppReceiver } from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppReceiver.sol";

contract MockEndpointV2 {
    mapping(address => address) public delegates;

    function setDelegate(address _delegate) external {
        delegates[msg.sender] = _delegate;
    }

    function callLzReceive(
        address _receiver,
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable {
        IOAppReceiver(_receiver).lzReceive{ value: msg.value }(_origin, _guid, _message, _executor, _extraData);
    }
}
