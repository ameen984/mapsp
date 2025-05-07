// ✅ Streamlined GPS tracker focused on live tracking

// 🌍 Scaling factor (adjust this to match your 3D model scale)
const WORLD_SCALE = 1;  // Starting scale factor

let gpsMarker;
let gpsAccuracyRing;
let gpsPath;
let gpsPathPoints = [];
let watchId = null;
let lastPosition = null; // Stores the complete position object
let calibrationFactor = 0.6163;

// Reference point for calibration
const REFERENCE_LATITUDE = 8.5644027;
const REFERENCE_LONGITUDE = 76.8879752;
const LIBRARY_WORLD_X = 114.95;
const LIBRARY_WORLD_Z = -49.85;

const GPS_CONFIG = {
    markerSize: 5,
    markerColor: 0xff0000,  // red blimp
    markerHeight: 20,
    accuracyColor: 0x2299ff,
    accuracyOpacity: 0.2,
    pathColor: 0x0066cc,
    pathWidth: 3,
    updateInterval: 1000,
    maxPathPoints: 500,
    smoothingFactor: 0.3,
    useHighAccuracy: true,
    showAccuracyRing: true,
    showPath: true
};

/**
 * Direct GPS to World transformation using calibration point
 */
function geoToWorld(latitude, longitude) {
  const R = 6371000; // Earth radius in meters
  const lat1 = REFERENCE_LATITUDE * Math.PI / 180;
  const lat2 = latitude * Math.PI / 180;
  const dLat = (latitude - REFERENCE_LATITUDE) * Math.PI / 180;
  const dLon = (longitude - REFERENCE_LONGITUDE) * Math.PI / 180;

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);

  const scaledDistance = distance * calibrationFactor;
  const worldX = LIBRARY_WORLD_X + (scaledDistance * Math.sin(bearing));
  const worldZ = LIBRARY_WORLD_Z - (scaledDistance * Math.cos(bearing));

  console.log(`🌐 Advanced geoToWorld: Lat=${latitude}, Lon=${longitude} ➔ X=${worldX.toFixed(2)}, Z=${worldZ.toFixed(2)}`);
  return { x: worldX, z: worldZ };
}

function setupGPSMarker() {
    // Create visual GPS marker (a floating blimp/sphere)
    const blimpGeometry = new THREE.SphereGeometry(GPS_CONFIG.markerSize, 16, 16);
    const blimpMaterial = new THREE.MeshBasicMaterial({ color: GPS_CONFIG.markerColor });
    gpsMarker = new THREE.Mesh(blimpGeometry, blimpMaterial);
    gpsMarker.position.y = GPS_CONFIG.markerHeight;
    gpsMarker.castShadow = true;
    gpsMarker.visible = false;
    scene.add(gpsMarker);

    // Create accuracy circle
    const ringGeometry = new THREE.CircleGeometry(1, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: GPS_CONFIG.accuracyColor,
        transparent: true,
        opacity: GPS_CONFIG.accuracyOpacity,
        side: THREE.DoubleSide
    });
    gpsAccuracyRing = new THREE.Mesh(ringGeometry, ringMaterial);
    gpsAccuracyRing.rotation.x = -Math.PI / 2; // Horizontal circle
    gpsAccuracyRing.position.y = 1;
    gpsAccuracyRing.visible = false;
    scene.add(gpsAccuracyRing);

    // Create path trail
    const pathMaterial = new THREE.LineBasicMaterial({
        color: GPS_CONFIG.pathColor,
        linewidth: GPS_CONFIG.pathWidth,
        transparent: true,
        opacity: 0.7
    });
    const pathGeometry = new THREE.BufferGeometry();
    gpsPath = new THREE.Line(pathGeometry, pathMaterial);
    gpsPath.visible = false;
    scene.add(gpsPath);

    addGPSControls();
    console.log("✅ GPS marker system initialized");
}

function updateGPSMarker(position) {
  if (!position || !position.coords) return;

  // Store the complete position object for later use
  lastPosition = position;

  const coords = position.coords;

  const worldPos = geoToWorld(coords.latitude, coords.longitude);

  console.log('✅ GPS UPDATE: Lat:', coords.latitude, 'Lon:', coords.longitude);
  console.log('➡️ Converted to 3D world position:', worldPos.x, worldPos.z);

  gpsMarker.position.x = worldPos.x;
  gpsMarker.position.z = worldPos.z;
  gpsMarker.visible = true;

  // Update accuracy ring
  if (GPS_CONFIG.showAccuracyRing && gpsAccuracyRing) {
      const accuracyRadius = coords.accuracy * calibrationFactor * 0.1;  // Scale as needed
      gpsAccuracyRing.scale.set(accuracyRadius, accuracyRadius, 1);
      gpsAccuracyRing.position.x = worldPos.x;
      gpsAccuracyRing.position.z = worldPos.z;
      gpsAccuracyRing.visible = true;
  }

  // Update path if enabled
  if (GPS_CONFIG.showPath) {
      updateGPSPath(worldPos);
  }

  // Update info display
  updateGPSInfoDisplay(position);
}

// Update path with new position
function updateGPSPath(worldPos) {
    // Add point to path
    gpsPathPoints.push(new THREE.Vector3(worldPos.x, 1, worldPos.z));
    
    // Limit number of points in path
    if (gpsPathPoints.length > GPS_CONFIG.maxPathPoints) {
        gpsPathPoints.shift();
    }
    
    // Update path geometry
    if (gpsPath && gpsPathPoints.length > 1) {
        const pathGeometry = new THREE.BufferGeometry().setFromPoints(gpsPathPoints);
        gpsPath.geometry.dispose();
        gpsPath.geometry = pathGeometry;
        gpsPath.visible = true;
    }
}

// Start GPS tracking
function startGPSTracking() {
    if (navigator.geolocation) {
        // Show starting message
        showGPSStatus("Starting GPS...");
        
        // Clear any existing watch
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
        }
        
        // Options for geolocation
        const options = {
            enableHighAccuracy: GPS_CONFIG.useHighAccuracy,
            timeout: 20000,
            maximumAge: 0
        };
        
        // Start watching position
        watchId = navigator.geolocation.watchPosition(
            // Success callback
            (position) => {
                showGPSStatus("GPS Active", true);
                updateGPSMarker(position);
            },
            // Error callback
            (error) => {
                console.error("GPS Error:", error);
                let errorMsg = "GPS Error";
                
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg = "GPS permission denied";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = "GPS position unavailable";
                        break;
                    case error.TIMEOUT:
                        errorMsg = "GPS request timeout";
                        break;
                }
                
                showGPSStatus(errorMsg, false);
            },
            options
        );
        
        console.log("GPS tracking started with watchId:", watchId);
    } else {
        showGPSStatus("Geolocation not supported", false);
        console.error("Geolocation is not supported by this browser");
    }
}

function stopGPSTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        if (gpsMarker) gpsMarker.visible = false;
        if (gpsAccuracyRing) gpsAccuracyRing.visible = false;
        showGPSStatus("GPS Stopped", false);
        console.log("GPS tracking stopped");
    }
}

function showGPSStatus(message, isActive = null) {
    let status = document.getElementById('gpsStatus');
    if (!status) {
        status = document.createElement('div');
        status.id = 'gpsStatus';
        status.style.position = 'absolute';
        status.style.bottom = '10px';
        status.style.left = '10px';
        status.style.padding = '8px 12px';
        status.style.borderRadius = '20px';
        status.style.fontSize = '14px';
        status.style.fontWeight = 'bold';
        status.style.zIndex = '1000';
        document.body.appendChild(status);
    }
    status.textContent = message;
    if (isActive === true) {
        status.style.backgroundColor = 'rgba(0, 180, 0, 0.8)';
        status.style.color = 'white';
    } else if (isActive === false) {
        status.style.backgroundColor = 'rgba(180, 0, 0, 0.8)';
        status.style.color = 'white';
    } else {
        status.style.backgroundColor = 'rgba(180, 180, 0, 0.8)';
        status.style.color = 'black';
    }
}

function updateGPSInfoDisplay(position) {
    const info = document.getElementById('gpsInfo');
    if (!info || !position.coords) return;
    const { latitude, longitude, accuracy } = position.coords;
    const timestamp = new Date(position.timestamp).toLocaleTimeString();
    
    // Get the world position
    const worldPos = geoToWorld(latitude, longitude);
    
    info.innerHTML = `Lat: ${latitude.toFixed(6)}<br>
                     Lng: ${longitude.toFixed(6)}<br>
                     X: ${worldPos.x.toFixed(2)}<br>
                     Z: ${worldPos.z.toFixed(2)}<br>
                     Accuracy: ${accuracy.toFixed(1)}m<br>
                     Updated: ${timestamp}`;
}

function addGPSControls() {
    const container = document.createElement('div');
    container.id = 'gpsControls';
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.backgroundColor = 'rgba(255,255,255,0.8)';
    container.style.padding = '10px';
    container.style.borderRadius = '5px';
    container.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    container.style.zIndex = '1000';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';

    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Start GPS';
    toggleButton.style.padding = '8px 12px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.backgroundColor = '#4CAF50';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.borderRadius = '4px';

    let isTracking = false;
    toggleButton.addEventListener('click', () => {
        isTracking = !isTracking;
        if (isTracking) {
            toggleButton.textContent = 'Stop GPS';
            toggleButton.style.backgroundColor = '#f44336';
            startGPSTracking();
        } else {
            toggleButton.textContent = 'Start GPS';
            toggleButton.style.backgroundColor = '#4CAF50';
            stopGPSTracking();
        }
    });

    const infoDisplay = document.createElement('div');
    infoDisplay.id = 'gpsInfo';
    infoDisplay.style.fontSize = '12px';
    infoDisplay.style.fontFamily = 'monospace';

    container.appendChild(toggleButton);
    container.appendChild(infoDisplay);
    document.body.appendChild(container);
}

// Initialize the GPS system
function initGPSSystem() {
    setupGPSMarker();
    console.log("✅ GPS system initialized");
    
    // Start GPS tracking automatically (optional)
    // startGPSTracking();
}

// Call this function when the page loads
window.addEventListener('load', initGPSSystem);

// Export functions for external use if needed
window.gpsTracker = {
    start: startGPSTracking,
    stop: stopGPSTracking
};