// frontend/trustchain.js
// Works with ethers.js v6 + MetaMask (or any Web3 wallet)

import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js";
import { SHIPMENT_REGISTRY_ABI } from "./abi.js"; // Export ABI from artifacts

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJlNzQ1OTk2My1mZmI4LTRiOGQtOTVkMy0wMGE2NGM1NDk2MGYiLCJlbWFpbCI6ImthbWFsODYyNDc5QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJlNTY3ODhiYjY1YzEzMWEzODY5MiIsInNjb3BlZEtleVNlY3JldCI6IjRmZGRiMDY3YTBjNmNiZmRkMzBmMTVmZGVlMjcyMDUwOWE3ODBlNWVkMTg5OGI3Y2QxOWExMDEyY2JlYjYyZGQiLCJleHAiOjE4MDkwMzQxNTJ9.fYC_z-PpHP0wUnZZRW8h-qw3O81HAmB4Q2j3HMECKV0";

// ── Connect wallet ────────────────────────────────
export async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer  = await provider.getSigner();
  return { provider, signer };
}

// ── Get contract instance ─────────────────────────
export function getContract(signerOrProvider) {
  return new ethers.Contract(CONTRACT_ADDRESS, SHIPMENT_REGISTRY_ABI, signerOrProvider);
}

// ── Check if address is vendor ─────────────────────
export async function isVendor(provider, address) {
  const contract = getContract(provider);
  return await contract.authorizedVendors(address);
}

// ── Create shipment ───────────────────────────────
export async function createShipment(signer, id, product) {
  const contract = getContract(signer);
  const tx = await contract.createShipment(id, product);
  const receipt = await tx.wait();
  console.log("✅ Shipment created. TX:", receipt.hash);
  return receipt;
}

// ── Record handoff ────────────────────────────────
export async function recordHandoff(signer, id, location, temperatureCelsius, imageHash) {
  const contract = getContract(signer);
  // Convert temperature: multiply by 100 to avoid floats
  // e.g., 2.1°C → 210
  const tempScaled = Math.round(temperatureCelsius * 100);
  const tx = await contract.recordHandoff(id, location, tempScaled, imageHash);
  const receipt = await tx.wait();
  console.log("✅ Handoff recorded. TX:", receipt.hash);
  return receipt;
}

// ── Anchor document hash ─────────────────────────
export async function anchorDocument(signer, id, docHash) {
  const contract = getContract(signer);
  // Ensure docHash is a 64-char hex SHA-256 string
  if (!/^[a-f0-9]{64}$/i.test(docHash)) {
    throw new Error("docHash must be a 64-character SHA-256 hex string");
  }
  const tx = await contract.anchorDocument(id, docHash);
  const receipt = await tx.wait();
  console.log("✅ Document anchored. TX:", receipt.hash);
  return receipt;
}

// ── Get shipment ──────────────────────────────────
export async function getShipment(provider, id) {
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS, SHIPMENT_REGISTRY_ABI, provider
  );
  const [id_, product, creator, finalized, documentHash, handoffCount]
    = await contract.getShipment(id);
  return {
    id: id_,
    product,
    creator,
    finalized,
    documentHash,
    handoffCount: Number(handoffCount),
  };
}

// ── Get handoff ───────────────────────────────────
export async function getHandoff(provider, id, index) {
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS, SHIPMENT_REGISTRY_ABI, provider
  );
  const [handler, location, temperature, imageHash, timestamp]
    = await contract.getHandoff(id, index);
  return {
    handler,
    location,
    // Convert back from scaled integer to Celsius float
    temperature: Number(temperature) / 100,
    imageHash,
    timestamp: new Date(Number(timestamp) * 1000).toISOString(),
  };
}

// ── Get all handoffs ──────────────────────────────
export async function getAllHandoffs(provider, id) {
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS, SHIPMENT_REGISTRY_ABI, provider
  );
  const handoffs = await contract.getAllHandoffs(id);
  return handoffs.map(h => ({
    handler:     h.handler,
    location:    h.location,
    temperature: Number(h.temperature) / 100,
    imageHash:   h.imageHash,
    timestamp:   new Date(Number(h.timestamp) * 1000).toISOString(),
  }));
}

// ── Listen to events ──────────────────────────────
export function listenToEvents(provider, callback) {
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS, SHIPMENT_REGISTRY_ABI, provider
  );

  contract.on("ShipmentCreated", (id, product, creator, timestamp) => {
    callback({ event: "ShipmentCreated", id, product, creator,
               timestamp: new Date(Number(timestamp) * 1000).toISOString() });
  });

  contract.on("HandoffRecorded", (id, handler, location, temperature, imageHash, timestamp) => {
    callback({ event: "HandoffRecorded", id, handler, location,
               temperature: Number(temperature) / 100, imageHash,
               timestamp: new Date(Number(timestamp) * 1000).toISOString() });
  });

  contract.on("DocumentAnchored", (id, docHash, anchoredBy, timestamp) => {
    callback({ event: "DocumentAnchored", id, docHash, anchoredBy,
               timestamp: new Date(Number(timestamp) * 1000).toISOString() });
  });

  return () => contract.removeAllListeners();
}

// ── Pinata IPFS Upload ───────────────────────────
export async function uploadToPinata(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`
    },
    body: formData
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error);
  
  console.log("📍 File uploaded to IPFS. CID:", json.IpfsHash);
  return `https://gateway.pinata.cloud/ipfs/${json.IpfsHash}`;
}
