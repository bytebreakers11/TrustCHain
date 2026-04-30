import { expect } from "chai";
import hre from "hardhat";

describe("ShipmentRegistry", function () {
  let ShipmentRegistry;
  let registry;
  let owner;
  let handler;
  let otherAccount;
  let ethers;

  beforeEach(async function () {
    const network = await hre.network.create();
    ethers = network.ethers;
    if (!ethers) {
        console.log("Network object keys:", Object.keys(network));
        throw new Error("ethers is undefined in network object");
    }
    [owner, handler, otherAccount] = await ethers.getSigners();
    ShipmentRegistry = await ethers.getContractFactory("ShipmentRegistry");
    registry = await ShipmentRegistry.deploy();
    await registry.waitForDeployment();
  });

  it("Should set the right owner", async function () {
    expect(await registry.owner()).to.equal(owner.address);
  });

  it("Should allow owner to authorize a handler", async function () {
    await registry.authorizeHandler(handler.address);
    expect(await registry.authorizedHandlers(handler.address)).to.equal(true);
  });

  it("Should create a shipment", async function () {
    await registry.createShipment("SHP001", "Vaccines");
    const shipment = await registry.getShipment("SHP001");
    expect(shipment.id_).to.equal("SHP001");
    expect(shipment.product).to.equal("Vaccines");
    expect(shipment.creator).to.equal(owner.address);
  });

  it("Should record a handoff", async function () {
    await registry.createShipment("SHP001", "Vaccines");
    await registry.recordHandoff("SHP001", "Warehouse A", 210, "ipfs://hash123");
    
    const handoffs = await registry.getAllHandoffs("SHP001");
    expect(handoffs.length).to.equal(1);
    expect(handoffs[0].location).to.equal("Warehouse A");
    expect(handoffs[0].temperature).to.equal(210n);
  });

  it("Should prevent handoffs for non-existent shipments", async function () {
    await expect(
      registry.recordHandoff("NONEXISTENT", "Loc", 200, "hash")
    ).to.be.revertedWith("TrustChain: Shipment not found");
  });
});
