const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
  const [owner] = await hre.ethers.getSigners();

  const registry = await hre.ethers.getContractAt("ShipmentRegistry", CONTRACT_ADDRESS);

  console.log("Authorizing current wallet as a LOGISTICS HANDLER...");
  const tx = await registry.authorizeHandler(owner.address);
  await tx.wait();

  console.log("✅ SUCCESS: You can now log temperatures and handoffs on the blockchain!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
