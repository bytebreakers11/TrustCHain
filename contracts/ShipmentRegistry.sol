// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  ShipmentRegistry
 * @notice TrustChain — Perishable Goods Tracking & Tamper-Prevention System
 * @dev    Append-only, role-controlled shipment registry.
 *         Stores Proof of Custody, Condition, and Integrity for each shipment.
 * @author TrustChain Team
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ShipmentRegistry is Ownable, Pausable, ReentrancyGuard {

    // ─────────────────────────────────────────────
    // STRUCTS
    // ─────────────────────────────────────────────

    /**
     * @notice Represents one custody handoff event.
     * @dev    imageHash should be an IPFS CID or SHA-256 hex string.
     */
    struct Handoff {
        address handler;      // Who performed the handoff
        string  location;     // GPS coord or warehouse name
        uint256 temperature;  // Celsius × 100 (e.g., 210 = 2.10°C) — avoids floats
        string  imageHash;    // IPFS CID or SHA-256 of condition photo
        uint256 timestamp;    // block.timestamp
    }

    /**
     * @notice Full shipment record stored on-chain.
     */
    struct Shipment {
        string   id;            // Unique shipment ID (e.g., "SHP-2025-001")
        string   product;       // Product name/description
        address  creator;       // Who created this shipment
        bool     exists;        // Guard flag — prevents re-creation
        bool     finalized;     // Once finalized, no more handoffs allowed
        string   documentHash;  // SHA-256 of primary shipping document
        Handoff[] handoffs;     // Append-only custody chain
    }

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────

    /// @notice All shipments keyed by string ID
    mapping(string => Shipment) private shipments;

    /// @notice Authorized handlers (role-based access)
    mapping(address => bool) public authorizedHandlers;

    /// @notice Authorized vendors (access to deep audit data)
    mapping(address => bool) public authorizedVendors;

    /// @notice Track total shipments for statistics
    uint256 public totalShipments;

    // ─────────────────────────────────────────────
    // EVENTS (indexed fields for off-chain querying)
    // ─────────────────────────────────────────────

    event ShipmentCreated(
        string  indexed id,
        string          product,
        address indexed creator,
        uint256         timestamp
    );

    event HandoffRecorded(
        string  indexed id,
        address indexed handler,
        string          location,
        uint256         temperature,
        string          imageHash,
        uint256         timestamp
    );

    event DocumentAnchored(
        string  indexed id,
        string          docHash,
        address indexed anchoredBy,
        uint256         timestamp
    );

    event ShipmentFinalized(
        string  indexed id,
        address indexed finalizedBy,
        uint256         timestamp
    );

    event HandlerAuthorized(address indexed handler, address indexed by);
    event HandlerRevoked(address indexed handler, address indexed by);
    
    event VendorAuthorized(address indexed vendor, address indexed by);
    event VendorRevoked(address indexed vendor, address indexed by);

    // ─────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────

    /// @dev Reverts if shipment does not exist
    modifier shipmentExists(string calldata id) {
        require(shipments[id].exists, "TrustChain: Shipment not found");
        _;
    }

    /// @dev Reverts if shipment has been finalized
    modifier notFinalized(string calldata id) {
        require(!shipments[id].finalized, "TrustChain: Shipment is finalized");
        _;
    }

    /// @dev Reverts if caller is not an authorized handler
    modifier onlyHandler() {
        require(
            authorizedHandlers[msg.sender] || msg.sender == owner(),
            "TrustChain: Caller is not an authorized handler"
        );
        _;
    }

    // ─────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────

    constructor() Ownable(msg.sender) {
        // Deployer is the first authorized handler
        authorizedHandlers[msg.sender] = true;
        emit HandlerAuthorized(msg.sender, msg.sender);
    }

    // ─────────────────────────────────────────────
    // ACCESS CONTROL
    // ─────────────────────────────────────────────

    /**
     * @notice Grant handler role to an address
     * @param  handler Address to authorize
     */
    function authorizeHandler(address handler) external onlyOwner {
        require(handler != address(0), "TrustChain: Zero address not allowed");
        require(!authorizedHandlers[handler], "TrustChain: Already authorized");
        authorizedHandlers[handler] = true;
        emit HandlerAuthorized(handler, msg.sender);
    }

    /**
     * @notice Revoke handler role from an address
     * @param  handler Address to revoke
     */
    function revokeHandler(address handler) external onlyOwner {
        require(authorizedHandlers[handler], "TrustChain: Not an authorized handler");
        authorizedHandlers[handler] = false;
        emit HandlerRevoked(handler, msg.sender);
    }

    /**
     * @notice Grant vendor role to an address (allows viewing deep audit data)
     * @param  vendor Address to authorize
     */
    function authorizeVendor(address vendor) external onlyOwner {
        require(vendor != address(0), "TrustChain: Zero address not allowed");
        require(!authorizedVendors[vendor], "TrustChain: Already authorized");
        authorizedVendors[vendor] = true;
        emit VendorAuthorized(vendor, msg.sender);
    }

    /**
     * @notice Revoke vendor role from an address
     * @param  vendor Address to revoke
     */
    function revokeVendor(address vendor) external onlyOwner {
        require(authorizedVendors[vendor], "TrustChain: Not an authorized vendor");
        authorizedVendors[vendor] = false;
        emit VendorRevoked(vendor, msg.sender);
    }

    // ─────────────────────────────────────────────
    // CORE FUNCTIONS
    // ─────────────────────────────────────────────

    /**
     * @notice Create a new shipment record
     * @dev    Only authorized handlers can create shipments.
     *         Duplicate IDs are rejected.
     * @param  id      Unique shipment identifier (non-empty, max 64 chars)
     * @param  product Product name (non-empty, max 128 chars)
     */
    function createShipment(
        string calldata id,
        string calldata product
    )
        external
        whenNotPaused
        onlyHandler
        nonReentrant
    {
        // ── Input validation ──────────────────────
        require(bytes(id).length > 0,        "TrustChain: ID cannot be empty");
        require(bytes(id).length <= 64,      "TrustChain: ID too long (max 64)");
        require(bytes(product).length > 0,   "TrustChain: Product cannot be empty");
        require(bytes(product).length <= 128,"TrustChain: Product too long (max 128)");

        // ── Duplicate prevention ──────────────────
        require(!shipments[id].exists, "TrustChain: Shipment ID already exists");

        // ── Create shipment ───────────────────────
        Shipment storage s = shipments[id];
        s.id       = id;
        s.product  = product;
        s.creator  = msg.sender;
        s.exists   = true;
        s.finalized = false;

        totalShipments++;

        emit ShipmentCreated(id, product, msg.sender, block.timestamp);
    }

    /**
     * @notice Record a custody handoff for an existing shipment
     * @dev    Appends to the handoff chain. Cannot be called on finalized shipments.
     * @param  id          Shipment ID
     * @param  location    Physical location (GPS or warehouse label)
     * @param  temperature Temperature in Celsius × 100 (e.g., 210 = 2.10°C)
     * @param  imageHash   IPFS CID or SHA-256 hex of condition image
     */
    function recordHandoff(
        string calldata id,
        string calldata location,
        uint256         temperature,
        string calldata imageHash
    )
        external
        whenNotPaused
        onlyHandler
        shipmentExists(id)
        notFinalized(id)
        nonReentrant
    {
        // ── Input validation ──────────────────────
        require(bytes(location).length > 0,   "TrustChain: Location cannot be empty");
        require(bytes(location).length <= 256, "TrustChain: Location too long");
        require(bytes(imageHash).length > 0,  "TrustChain: Image hash cannot be empty");
        require(bytes(imageHash).length <= 128,"TrustChain: Image hash too long");

        // ── Append handoff ────────────────────────
        shipments[id].handoffs.push(Handoff({
            handler:     msg.sender,
            location:    location,
            temperature: temperature,
            imageHash:   imageHash,
            timestamp:   block.timestamp
        }));

        emit HandoffRecorded(
            id,
            msg.sender,
            location,
            temperature,
            imageHash,
            block.timestamp
        );
    }

    /**
     * @notice Anchor a SHA-256 document hash to a shipment
     * @dev    Can only be set once. Cannot overwrite existing documentHash.
     *         Only the shipment creator or owner can anchor documents.
     * @param  id      Shipment ID
     * @param  docHash SHA-256 hex string of the shipping document
     */
    function anchorDocument(
        string calldata id,
        string calldata docHash
    )
        external
        whenNotPaused
        shipmentExists(id)
        notFinalized(id)
        nonReentrant
    {
        // ── Authorization: only creator or owner ──
        require(
            msg.sender == shipments[id].creator || msg.sender == owner(),
            "TrustChain: Only creator or owner can anchor documents"
        );

        // ── Prevent overwrite (immutability guarantee) ──
        require(
            bytes(shipments[id].documentHash).length == 0,
            "TrustChain: Document hash already anchored"
        );

        // ── Validate hash format (SHA-256 = 64 hex chars) ──
        require(bytes(docHash).length == 64, "TrustChain: Invalid SHA-256 hash (must be 64 chars)");

        shipments[id].documentHash = docHash;

        emit DocumentAnchored(id, docHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Finalize a shipment — no further handoffs allowed
     * @dev    Only shipment creator or owner can finalize.
     * @param  id  Shipment ID
     */
    function finalizeShipment(string calldata id)
        external
        whenNotPaused
        shipmentExists(id)
        notFinalized(id)
    {
        require(
            msg.sender == shipments[id].creator || msg.sender == owner(),
            "TrustChain: Only creator or owner can finalize"
        );

        shipments[id].finalized = true;

        emit ShipmentFinalized(id, msg.sender, block.timestamp);
    }

    // ─────────────────────────────────────────────
    // READ FUNCTIONS
    // ─────────────────────────────────────────────

    /**
     * @notice Get shipment metadata and handoff count
     * @param  id  Shipment ID
     * @return id_          Shipment ID
     * @return product      Product name
     * @return creator      Creator address
     * @return finalized    Whether shipment is finalized
     * @return documentHash Anchored document hash
     * @return handoffCount Number of recorded handoffs
     */
    function getShipment(string calldata id)
        external
        view
        shipmentExists(id)
        returns (
            string  memory id_,
            string  memory product,
            address        creator,
            bool           finalized,
            string  memory documentHash,
            uint256        handoffCount
        )
    {
        Shipment storage s = shipments[id];
        return (
            s.id,
            s.product,
            s.creator,
            s.finalized,
            s.documentHash,
            s.handoffs.length
        );
    }

    /**
     * @notice Get details of a specific handoff
     * @param  id     Shipment ID
     * @param  index  Handoff index (0-based)
     * @return handler     Address of the handler
     * @return location    Location string
     * @return temperature Temperature value
     * @return imageHash   Image hash
     * @return timestamp   Block timestamp
     */
    function getHandoff(string calldata id, uint256 index)
        external
        view
        shipmentExists(id)
        returns (
            address handler,
            string  memory location,
            uint256 temperature,
            string  memory imageHash,
            uint256 timestamp
        )
    {
        require(
            index < shipments[id].handoffs.length,
            "TrustChain: Handoff index out of bounds"
        );
        Handoff storage h = shipments[id].handoffs[index];
        return (
            h.handler,
            h.location,
            h.temperature,
            h.imageHash,
            h.timestamp
        );
    }

    /**
     * @notice Check if a shipment ID already exists
     * @param  id  Shipment ID to check
     * @return True if exists
     */
    function shipmentExistsCheck(string calldata id) external view returns (bool) {
        return shipments[id].exists;
    }

    /**
     * @notice Get all handoffs for a shipment at once
     * @dev    Use with care for large handoff arrays — gas cost in off-chain calls is fine.
     * @param  id  Shipment ID
     * @return Array of all Handoff structs
     */
    function getAllHandoffs(string calldata id)
        external
        view
        shipmentExists(id)
        returns (Handoff[] memory)
    {
        return shipments[id].handoffs;
    }

    // ─────────────────────────────────────────────
    // EMERGENCY CONTROLS
    // ─────────────────────────────────────────────

    /**
     * @notice Pause all write operations (owner only)
     * @dev    Use in emergency (compromise, breach detected)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resume write operations (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
