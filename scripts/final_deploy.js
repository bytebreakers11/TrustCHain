// scripts/final_deploy.js
import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Starting Final Deployment to Local Node...");

  // 1. Deploy ACL
  const ACL = await hre.ethers.getContractFactory("TrustChainACL");
  const acl = await ACL.deploy(await (await hre.ethers.getSigners())[0].getAddress());
  await acl.waitForDeployment();
  console.log("✅ TrustChainACL deployed to:", await acl.getAddress());

  // 2. Deploy Registry
  const Registry = await hre.ethers.getContractFactory("ShipmentRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("✅ ShipmentRegistry deployed to:", registryAddress);

  // 3. AUTO-UPDATE FRONTEND
  const frontendPath = path.join(process.cwd(), "frontend", "trustchain.js");
  let content = fs.readFileSync(frontendPath, "utf8");
  
  // Replace the address in the file
  content = content.replace(
    /const CONTRACT_ADDRESS = "0x[a-fA-F0-9]{40}";/,
    `const CONTRACT_ADDRESS = "${registryAddress}";`
  );
  
  fs.writeFileSync(frontendPath, content);
  console.log("✨ Updated frontend/trustchain.js with the new address!");
  console.log("\n🎉 ALL DONE! Just refresh your browser at http://localhost:3000");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
