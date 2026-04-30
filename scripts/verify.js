// scripts/verify.js
import hre from "hardhat";
const { run } = hre;
import { createRequire } from "module";
const require = createRequire(import.meta.url);

async function main() {
  const deployments = require("../deployments.json");
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("      TrustChain — Contract Verification");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const { ShipmentRegistry, TrustChainACL } = deployments.contracts;

  // ── Verify ShipmentRegistry ──────────────────────
  try {
    console.log(`🔍 Verifying ShipmentRegistry at ${ShipmentRegistry.address}...`);
    await run("verify:verify", {
      address:              ShipmentRegistry.address,
      constructorArguments: [],
    });
    console.log("✅ ShipmentRegistry verified!\n");
  } catch (err) {
    if (err.message.includes("Already Verified")) {
      console.log("ℹ️  ShipmentRegistry already verified.\n");
    } else {
      console.error("❌ ShipmentRegistry verification failed:", err.message);
    }
  }

  // ── Verify TrustChainACL ─────────────────────────
  try {
    console.log(`🔍 Verifying TrustChainACL at ${TrustChainACL.address}...`);
    await run("verify:verify", {
      address:              TrustChainACL.address,
      constructorArguments: [deployments.deployer],
    });
    console.log("✅ TrustChainACL verified!\n");
  } catch (err) {
    if (err.message.includes("Already Verified")) {
      console.log("ℹ️  TrustChainACL already verified.\n");
    } else {
      console.error("❌ TrustChainACL verification failed:", err.message);
    }
  }
}

main().catch((err) => {
  console.error("❌ Verification failed:", err.message);
  process.exitCode = 1;
});
