const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n--- TrustChain Deployment ---");
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Registry = await hre.ethers.getContractFactory("ShipmentRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  
  console.log("✅ ShipmentRegistry deployed to:", address);

  // Update frontend
  const frontendPath = path.join(__dirname, "..", "frontend", "trustchain.js");
  if (fs.existsSync(frontendPath)) {
    let content = fs.readFileSync(frontendPath, "utf8");
    content = content.replace(/const CONTRACT_ADDRESS = "0x[a-fA-F0-9]{40}";/, `const CONTRACT_ADDRESS = "${address}";`);
    fs.writeFileSync(frontendPath, content);
    console.log("✨ Updated frontend/trustchain.js");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
