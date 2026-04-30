// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  TrustChainACL
 * @notice Extended role-based access control for TrustChain.
 *         Roles: DEFAULT_ADMIN_ROLE, HANDLER_ROLE, AUDITOR_ROLE
 */
contract TrustChainACL is AccessControl, Pausable {

    bytes32 public constant HANDLER_ROLE = keccak256("HANDLER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(HANDLER_ROLE, admin);
    }

    function grantHandler(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(HANDLER_ROLE, account);
    }

    function grantAuditor(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(AUDITOR_ROLE, account);
    }

    function isHandler(address account) external view returns (bool) {
        return hasRole(HANDLER_ROLE, account);
    }

    function isAuditor(address account) external view returns (bool) {
        return hasRole(AUDITOR_ROLE, account);
    }
}
