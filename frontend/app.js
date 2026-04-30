// frontend/app.js
import { 
  connectWallet, 
  createShipment, 
  recordHandoff, 
  getShipment, 
  getAllHandoffs,
  uploadToPinata,
  isVendor
} from "./trustchain.js";

let userSigner = null;
let userProvider = null;

// Map & Geocoding State
let map = null;
const geoCache = {};

async function getCoordinates(locationStr) {
  if (geoCache[locationStr]) return geoCache[locationStr];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationStr)}`);
    const data = await res.json();
    if (data && data.length > 0) {
      const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      geoCache[locationStr] = coords;
      return coords;
    }
  } catch (e) {
    console.warn("Geocoding failed for:", locationStr, e);
  }
  return null;
}

const elements = {
  connectBtn:   document.getElementById('connectBtn'),
  walletAddr:   document.getElementById('walletAddress'),
  statusDot:    document.getElementById('statusDot'),
  createBtn:    document.getElementById('createBtn'),
  recordBtn:    document.getElementById('recordBtn'),
  searchBtn:    document.getElementById('searchBtn'),
  timeline:     document.getElementById('timeline'),
  shipmentInfo: document.getElementById('shipmentInfo'),
  twinContainer: document.getElementById('twinContainer'),
  twinStatus:   document.getElementById('twinStatus'),
  digitalTwin:  document.getElementById('digitalTwin'),
  qrcode:       document.getElementById('qrcode'),
  roleBadge:    document.getElementById('roleBadge'),
  publicQrView: document.getElementById('publicQrView'),
  vendorOnlyData: document.getElementById('vendorOnlyData'),
  vendorTimelineSection: document.getElementById('vendorTimelineSection'),
  publicNoLogs: document.getElementById('publicNoLogs'),
  qualityScore: document.getElementById('qualityScore'),
  auditConclusion: document.getElementById('auditConclusion')
};

let masterData = [];

// ── Master Data Logic ───────────────────────────
async function loadMasterData() {
  try {
    const response = await fetch('medicines.csv');
    const text = await response.text();
    const rows = text.split('\n').slice(1);
    masterData = rows.map(row => {
      const [name, min, max, life] = row.split(',');
      return { 
        name: name?.trim(), 
        min: parseFloat(min), 
        max: parseFloat(max), 
        life: parseInt(life) 
      };
    }).filter(m => m.name);
    console.log("Master Data Loaded:", masterData.length, "items");
  } catch (err) {
    console.error("Failed to load medicines.csv", err);
  }
}

loadMasterData();

// ── Connection Logic ────────────────────────────
async function handleConnect() {
  try {
    const { provider, signer } = await connectWallet();
    userSigner = signer;
    userProvider = provider;
    
    const address = await signer.getAddress();
    elements.walletAddr.innerText = `${address.slice(0, 6)}...${address.slice(-4)}`;
    elements.statusDot.classList.add('online');
    elements.connectBtn.innerText = "Connected";
    
    // Refresh search if an ID was already entered
    if (document.getElementById('searchId').value) {
      handleSearch();
    }
  } catch (err) {
    alert("Wallet connection failed: " + err.message);
  }
}

// ── Create Shipment ─────────────────────────────
async function handleCreate() {
  if (!userSigner) return alert("Please connect wallet first");
  
  const id = document.getElementById('shipmentId').value;
  const product = document.getElementById('productName').value;
  
  if (!id || !product) return alert("Please fill all fields");

  try {
    elements.createBtn.innerText = "Processing...";
    await createShipment(userSigner, id, product);
    alert("Shipment registered successfully!");
    elements.createBtn.innerText = "Register on Ledger";
  } catch (err) {
    console.error(err);
    alert("Transaction failed. Check console for details.");
    elements.createBtn.innerText = "Register on Ledger";
  }
}

// ── Record Handoff ──────────────────────────────
async function handleRecord() {
  if (!userSigner) return alert("Please connect wallet first");

  const id       = document.getElementById('handoffId').value;
  const loc      = document.getElementById('location').value;
  const temp     = parseFloat(document.getElementById('temperature').value);

  if (!id || !loc || isNaN(temp)) return alert("Please fill all fields correctly");

  try {
    elements.recordBtn.innerText = "Generating Provenance Log...";
    
    const logData = {
      event: "STATION_HANDOFF",
      shipmentId: id,
      location: loc,
      temperature: temp,
      handler: await userSigner.getAddress(),
      timestamp: new Date().toISOString(),
      network: "Hardhat (Localhost)"
    };

    const logBlob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const logFile = new File([logBlob], `log_${id}_${Date.now()}.json`);
    
    const logUrl = await uploadToPinata(logFile);
    console.log("Log uploaded to IPFS:", logUrl);

    elements.recordBtn.innerText = "Signing on Ledger...";
    await recordHandoff(userSigner, id, loc, temp, logUrl);
    
    alert("Provenance Log successfully anchored to Blockchain!");
    elements.recordBtn.innerText = "Log Proof of Condition";
    handleSearch(); // Refresh timeline
  } catch (err) {
    console.error(err);
    alert("Handoff failed. Check if you are an authorized handler.");
    elements.recordBtn.innerText = "Log Proof of Condition";
  }
}

// ── Search & Track (Overhauled for Dual-Layer) ──
async function handleSearch() {
  const id = document.getElementById('searchId').value;
  if (!id) return;

  try {
    const shipment = await getShipment(userProvider, id);
    const handoffs = await getAllHandoffs(userProvider, id);
    const productInfo = masterData.find(m => m.name.toLowerCase() === shipment.product.toLowerCase());

    // Role Check
    let isUserVendor = false;
    if (userSigner) {
       const userAddr = await userSigner.getAddress();
       isUserVendor = await isVendor(userProvider, userAddr);
    }

    // Toggle Role UI (Modified for Demo Reliability)
    elements.roleBadge.style.display = isUserVendor ? 'block' : 'none';
    elements.vendorOnlyData.style.display = 'block'; // Always show for demo
    elements.vendorTimelineSection.style.display = 'block'; // Always show for demo
    elements.publicQrView.style.display = isUserVendor ? 'none' : 'block';
    elements.publicNoLogs.style.display = 'none'; // Hide the locked message

    // Basic Info
    elements.shipmentInfo.style.display = 'block';
    document.getElementById('infoProduct').innerText = shipment.product;
    document.getElementById('infoCreator').innerText = `Originator: ${shipment.creator}`;

    // Digital Twin & Quality Score Calculation
    elements.twinContainer.style.display = 'flex';
    let isCritical = false;
    let score = 100;

    if (productInfo && handoffs.length > 0) {
      handoffs.forEach(h => {
        if (h.temperature < productInfo.min || h.temperature > productInfo.max) {
          isCritical = true;
          score -= 25; // Penalty per violation
        }
      });
    }
    
    if (score < 0) score = 0;
    elements.qualityScore.innerText = score;
    elements.auditConclusion.innerText = score === 100 ? "Perfect cold chain integrity." : 
                                        score > 70 ? "Minor deviations detected. Exercise caution." : 
                                        "CRITICAL: Thermal safety breached.";

    if (isCritical) {
      elements.digitalTwin.classList.add('status-critical');
      elements.twinStatus.innerText = "CRITICAL: SAFETY VIOLATION";
      elements.twinStatus.style.color = "#ff4d4d";
    } else {
      elements.digitalTwin.classList.remove('status-critical');
      elements.twinStatus.innerText = "HEALTHY: SECURE";
      elements.twinStatus.style.color = "var(--primary)";
    }

    // Timeline (Always visible for demo)
    elements.timeline.innerHTML = "";
    
    // Initialize Map
    if (!map) {
      map = L.map('map').setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        className: 'map-tiles'
      }).addTo(map);
    }
    
    // Clear previous markers/lines
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const routeCoords = [];

    // Process each handoff
    for (const h of handoffs) {
      // Timeline HTML
      const div = document.createElement('div');
      div.className = 'event';
      div.innerHTML = `
        <div class="event-meta">
          <span class="event-time">${new Date(h.timestamp).toLocaleString()}</span>
          <span class="event-location">${h.location}</span>
        </div>
        <p class="event-detail">
          <b>Temp:</b> ${h.temperature}°C | <b>Handler:</b> ${h.handler.slice(0,6)}...${h.handler.slice(-4)}<br>
          <a href="${h.imageHash}" target="_blank" style="color: var(--primary); font-size: 0.75rem;">View Provenance JSON (IPFS)</a>
        </p>
      `;
      elements.timeline.appendChild(div);

      // Map Plotting
      const coords = await getCoordinates(h.location);
      if (coords) {
        routeCoords.push(coords);
        L.marker(coords).addTo(map).bindPopup(`<b>${h.location}</b><br>Temp: ${h.temperature}°C`);
      }
    }

    // Draw lines and auto-zoom map
    if (routeCoords.length > 0) {
      L.polyline(routeCoords, { color: '#6366f1', weight: 4, opacity: 0.8 }).addTo(map);
      map.fitBounds(L.polyline(routeCoords).getBounds(), { padding: [30, 30] });
    }

    if (!handoffs.length) {
       elements.timeline.innerHTML = '<p class="event-detail">No handoffs recorded yet.</p>';
    }


    // QR Code (Always generate, but layout might hide it)
    elements.qrcode.innerHTML = "";
    const expiryDays = productInfo ? productInfo.life : 365;
    const expDate = new Date(Date.now() + (expiryDays * 24 * 60 * 60 * 1000)).toLocaleDateString();
    
    const qrData = {
      product: shipment.product,
      batchId: id,
      expiry: expDate,
      safetyCheck: isCritical ? "FAILED" : "VERIFIED"
    };
    
    new QRCode(elements.qrcode, {
      text: JSON.stringify(qrData),
      width: 120,
      height: 120
    });

  } catch (err) {
    console.error(err);
    alert("Shipment not found on ledger.");
  }
}

// ── Listeners ───────────────────────────────────
elements.connectBtn.addEventListener('click', handleConnect);
elements.createBtn.addEventListener('click', handleCreate);
elements.recordBtn.addEventListener('click', handleRecord);
elements.searchBtn.addEventListener('click', handleSearch);
