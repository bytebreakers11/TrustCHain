const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const [owner] = await hre.ethers.getSigners();

  console.log("Using owner address:", owner.address);
  const registry = await hre.ethers.getContractAt("ShipmentRegistry", CONTRACT_ADDRESS);

  console.log("Attempting to authorize self as Vendor...");
  const tx = await registry.authorizeVendor(owner.address);
  await tx.wait();

  console.log("✅ SUCCESS: Address is now an Authorized Vendor!");
  console.log("Refresh the browser and click 'Track' to see the unlocked audit panel.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
