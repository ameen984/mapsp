// ✅ Streamlined GPS tracker focused on live tracking with camera follow

// 🌍 Scaling factor (adjust this to match your 3D model scale)
const WORLD_SCALE = 1;  // Starting scale factor

let gpsMarker;
let gpsAccuracyRing;
let gpsPath;
let gpsPathPoints = [];
let watchId = null;
let lastPosition = null; // Stores the complete position object
let calibrationFactor = 0.6163;
let followMode = true; // Camera follows the marker by default
let viewMode = 'navigation'; // 'navigation', 'top', or 'first-person'

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
    showPath: true,
    cameraFollowSmoothing: 0.1, // Lower values = smoother but slower camera movement
    cameraFollowHeight: 50,     // Height of camera above marker
    cameraFollowDistance: 30    // Distance behind marker
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
    // ✅ Create the pinpoint marker (a cone with a small sphere on top)
    const markerGroup = new THREE.Group();
    markerGroup.name = 'gpsMarker';

    // Cone for the "pin"
    const coneGeometry = new THREE.ConeGeometry(3, 10, 16);  // radius, height, segments
    const coneMaterial = new THREE.MeshBasicMaterial({ color: GPS_CONFIG.markerColor });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.y = 15;  // half height to stand on ground

    // Optional: add a small sphere on top to look like a pin head
    const sphereGeometry = new THREE.SphereGeometry(2, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: GPS_CONFIG.markerColor });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.y = 20;  // on top of cone

    // Add both to marker group
    markerGroup.add(cone);
    markerGroup.add(sphere);

    markerGroup.visible = false;
    scene.add(markerGroup);
    gpsMarker = markerGroup;

    // ✅ Create accuracy circle
    const ringGeometry = new THREE.CircleGeometry(1, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: GPS_CONFIG.accuracyColor,
        transparent: true,
        opacity: GPS_CONFIG.accuracyOpacity,
        side: THREE.DoubleSide
    });
    gpsAccuracyRing = new THREE.Mesh(ringGeometry, ringMaterial);
    gpsAccuracyRing.rotation.x = -Math.PI / 2; // Flat on the ground
    gpsAccuracyRing.position.y = 0.1;  // Just above the ground
    gpsAccuracyRing.visible = false;
    scene.add(gpsAccuracyRing);

    // ✅ Create path trail
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
    console.log("✅ GPS marker system initialized (Pinpoint style)");
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

  // Update camera position if follow mode is enabled
  if (followMode) {
      updateCameraPosition(worldPos);
  }

  // Update info display
  updateGPSInfoDisplay(position);
}

// Multi-mode camera follow system
// The issue is in the updateCameraPosition function
// We need to modify the 'navigation' view mode to position the camera behind the marker
// instead of in front of it

// The issue is in the updateCameraPosition function
// We need to modify the 'navigation' view mode to position the camera behind the marker
// instead of in front of it

function updateCameraPosition(worldPos) {
    if (!camera || !worldPos) return;
    
    // Get movement direction from GPS points or device heading
    let movementDirection = { x: 0, z: -1 }; // Default direction (north)
    let hasValidDirection = false;
    
    if (gpsPathPoints.length >= 2) {
        const lastPoint = gpsPathPoints[gpsPathPoints.length - 1];
        const prevPoint = gpsPathPoints[gpsPathPoints.length - 2];
        
        // Calculate direction only if points are sufficiently far apart
        const dx = lastPoint.x - prevPoint.x;
        const dz = lastPoint.z - prevPoint.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist > 0.1) { // Minimum distance to consider movement
            movementDirection = {
                x: dx / dist,
                z: dz / dist
            };
            hasValidDirection = true;
        }
    }
    
    // If we don't have valid points yet, try to use device heading
    if (!hasValidDirection && lastPosition && lastPosition.coords && 'heading' in lastPosition.coords) {
        const heading = lastPosition.coords.heading;
        if (typeof heading === 'number' && !isNaN(heading)) {
            // Convert heading (0° = North, 90° = East) to direction vector
            const headingRad = (90 - heading) * Math.PI / 180;
            movementDirection = {
                x: Math.cos(headingRad),
                z: Math.sin(headingRad)
            };
            hasValidDirection = true;
        }
    }
    
    let targetCameraPos, lookTarget;
    
    // Set camera position and orientation based on view mode
    switch (viewMode) {
        case 'navigation': // Follow from behind view
            // Enhanced camera settings for better follow-behind experience
            const cameraHeight = 50; // Lower height for better visibility
            const cameraDistance = 60; // Adjusted distance behind the marker
            const lookAheadDistance = 10; // Reduced look-ahead distance to focus more on the marker
            
            // Position camera directly behind the marker based on movement direction
            targetCameraPos = {
                x: worldPos.x - movementDirection.x * cameraDistance,
                y: cameraHeight,
                z: worldPos.z - movementDirection.z * cameraDistance
            };
            
            // Look at the marker's position with slight look-ahead
            lookTarget = {
                x: worldPos.x + movementDirection.x * lookAheadDistance,
                y: 2, // Lower to see more of the ground ahead
                z: worldPos.z + movementDirection.z * lookAheadDistance
            };
            break;
            
        case 'top': // Top-down view like a map
            targetCameraPos = {
                x: worldPos.x,
                y: 120, // Higher above for top view
                z: worldPos.z
            };
            
            // Look directly down at marker
            lookTarget = {
                x: worldPos.x,
                y: 0,
                z: worldPos.z
            };
            break;
            
        case 'first-person': // First-person view
            // Position camera at marker height plus human eye level
            targetCameraPos = {
                x: worldPos.x,
                y: 5, // Eye level
                z: worldPos.z
            };
            
            // Look in the direction of movement
            lookTarget = {
                x: worldPos.x + movementDirection.x * 10,
                y: 5, // Eye level
                z: worldPos.z + movementDirection.z * 10
            };
            break;
    }
    
    // Apply smoothing to camera movement (lower value = smoother but slower transitions)
    const smoothFactor = viewMode === 'first-person' ? 0.2 : 0.1; // Increased for more responsive following
    camera.position.x += (targetCameraPos.x - camera.position.x) * smoothFactor;
    camera.position.y += (targetCameraPos.y - camera.position.y) * smoothFactor;
    camera.position.z += (targetCameraPos.z - camera.position.z) * smoothFactor;
    
    // Make camera look at calculated target with improved transition
    const currentLookAt = new THREE.Vector3();
    camera.getWorldDirection(currentLookAt);
    
    // Calculate target direction vector
    const targetDirection = new THREE.Vector3(
        lookTarget.x - camera.position.x,
        lookTarget.y - camera.position.y,
        lookTarget.z - camera.position.z
    ).normalize();
    
    // Smoothly interpolate the camera direction
    const lookSmoothFactor = 0.15; // Adjust for smoother camera rotation
    const newDirection = new THREE.Vector3(
        currentLookAt.x + (targetDirection.x - currentLookAt.x) * lookSmoothFactor,
        currentLookAt.y + (targetDirection.y - currentLookAt.y) * lookSmoothFactor,
        currentLookAt.z + (targetDirection.z - currentLookAt.z) * lookSmoothFactor
    ).normalize();
    
    // Apply the smoothed look direction
    camera.lookAt(
        camera.position.x + newDirection.x * 100,
        camera.position.y + newDirection.y * 100,
        camera.position.z + newDirection.z * 100
    );
    
    // If we're using OrbitControls, disable them during follow mode
    if (window.controls && typeof window.controls.enabled !== 'undefined') {
        window.controls.enabled = false;
    }
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

    // Add follow mode toggle button
    const followButton = document.createElement('button');
    followButton.textContent = followMode ? 'Disable Follow' : 'Enable Follow';
    followButton.style.padding = '8px 12px';
    followButton.style.cursor = 'pointer';
    followButton.style.backgroundColor = followMode ? '#2196F3' : '#9E9E9E';
    followButton.style.color = 'white';
    followButton.style.border = 'none';
    followButton.style.borderRadius = '4px';

    followButton.addEventListener('click', () => {
        followMode = !followMode;
        if (followMode) {
            followButton.textContent = 'Disable Follow';
            followButton.style.backgroundColor = '#2196F3';
            // If we have a last position and are tracking, update the camera immediately
            if (lastPosition && isTracking) {
                const worldPos = geoToWorld(lastPosition.coords.latitude, lastPosition.coords.longitude);
                updateCameraPosition(worldPos);
            }
        } else {
            followButton.textContent = 'Enable Follow';
            followButton.style.backgroundColor = '#9E9E9E';
            // If using OrbitControls, re-enable controls when follow mode is off
            if (window.controls) {
                window.controls.enabled = true;
            }
        }
    });

    // We've removed the camera control sliders since we use fixed Google Maps style values now
    const cameraControlsDiv = document.createElement('div');
    cameraControlsDiv.style.display = 'flex';
    cameraControlsDiv.style.flexDirection = 'column';
    cameraControlsDiv.style.gap = '5px';
    cameraControlsDiv.style.marginTop = '8px';
    cameraControlsDiv.style.padding = '8px';
    cameraControlsDiv.style.border = '1px solid #ddd';
    cameraControlsDiv.style.borderRadius = '4px';
    
    // Add a view mode switcher
    const viewModeSelector = document.createElement('select');
    viewModeSelector.style.padding = '5px';
    viewModeSelector.style.borderRadius = '4px';
    viewModeSelector.style.border = '1px solid #ddd';
    viewModeSelector.style.width = '100%';
    
    // Create options
    const options = [
        { value: 'navigation', text: 'Navigation View' },
        { value: 'top', text: 'Top View' },
        { value: 'first-person', text: 'First Person' }
    ];
    
    options.forEach(option => {
        const optionElem = document.createElement('option');
        optionElem.value = option.value;
        optionElem.textContent = option.text;
        viewModeSelector.appendChild(optionElem);
    });
    
    viewModeSelector.addEventListener('change', (e) => {
        const viewMode = e.target.value;
        window.gpsTracker.setViewMode(viewMode);
    });
    
    const viewModeLabel = document.createElement('label');
    viewModeLabel.textContent = 'View Mode:';
    viewModeLabel.style.fontSize = '12px';
    viewModeLabel.style.marginBottom = '5px';
    
    cameraControlsDiv.appendChild(viewModeLabel);
    cameraControlsDiv.appendChild(viewModeSelector);

    const infoDisplay = document.createElement('div');
    infoDisplay.id = 'gpsInfo';
    infoDisplay.style.fontSize = '12px';
    infoDisplay.style.fontFamily = 'monospace';

    container.appendChild(toggleButton);
    container.appendChild(followButton);
    container.appendChild(cameraControlsDiv);
    container.appendChild(infoDisplay);
    document.body.appendChild(container);
}

// Initialize the GPS system
function initGPSSystem() {
    setupGPSMarker();
    console.log("✅ GPS system initialized");
    
    // Override animation loop to ensure camera follows marker
    if (typeof animate === 'function') {
        const originalAnimate = animate;
        animate = function() {
            originalAnimate();
            
            // Ensure camera follows if in follow mode and we have a marker
            if (followMode && gpsMarker && gpsMarker.visible && lastPosition) {
                const worldPos = geoToWorld(lastPosition.coords.latitude, lastPosition.coords.longitude);
                updateCameraPosition(worldPos);
            }
        };
    }
    
    // Start GPS tracking automatically (optional)
    // startGPSTracking();
}

// Call this function when the page loads
window.addEventListener('load', initGPSSystem);

// Export functions for external use if needed
window.gpsTracker = {
    start: startGPSTracking,
    stop: stopGPSTracking,
    toggleFollow: function() {
        followMode = !followMode;
        return followMode;
    },
    setViewMode: function(mode) {
        // Valid modes: 'navigation', 'top', 'first-person'
        if (['navigation', 'top', 'first-person'].includes(mode)) {
            viewMode = mode;
            console.log(`View mode set to: ${mode}`);
        }
    }
};