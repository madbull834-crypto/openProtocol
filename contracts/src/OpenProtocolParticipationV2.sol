// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OpenProtocolParticipation} from "./OpenProtocolParticipation.sol";

/// @notice Upgrade test implementation. It demonstrates that the proxy can
/// adopt new logic without changing its address or losing existing state.
contract OpenProtocolParticipationV2 is OpenProtocolParticipation {
    function version() external pure returns (uint256) {
        return 2;
    }
}
