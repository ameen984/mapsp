// navigationSystem.js - Navigation system with step-by-step guidance

// Configuration
const NAV_CONFIG = {
    routeColor: 0x00ff00,         // Green route color
    routeWidth: 3,                // Line width
    waypointRadius: 3,            // Waypoint radius
    waypointColor: 0xffcc00,      // Waypoint color (amber)
    nextWaypointColor: 0xff6600,  // Next waypoint color (orange)
    arrowScale: 5,                // Direction arrow scale
    updateIntervalMs: 1000,       // Navigation update interval
    arrivalDistance: 10,          // Distance to consider arrival at waypoint
    recalculationDistance: 30,    // Distance to trigger path recalculation
    showInstructions: true,       // Show text instructions
    smoothPath: true,             // Apply path smoothing
    pathSimplifyThreshold: 5,     // Distance threshold for path simplification
    useRealGPS: true,             // Use real GPS or simulation
    simulationSpeed: 5            // Speed for simulation (units/second)
};

// System state variables
let routeVisualization = null;    // THREE.Group for route visualization
let waypointMarkers = [];         // Array of waypoint markers
let currentPath = null;           // Current path as array of point IDs
let worldPath = null;             // Path positions in world coordinates
let currentWaypointIndex = 0;     // Current target waypoint
let nextWaypointArrow = null;     // Direction arrow to next waypoint
let simulationActive = false;     // Simulation active flag
let simulationInterval = null;    // Interval for simulation updates
let navigationActive = false;     // Navigation system state
let isProcessingUpdate = false;   // Lock to prevent concurrent updates
let destinationObject = null;     // Current destination object
let navInfoPanel = null;          // Navigation information panel
let lastKnownPosition = null;     // Last known position
let recalculationTimer = null;    // Timer for path recalculation
let voiceEnabled = false;         // Voice guidance state

/**
 * Initialize the navigation system
 */
function initNavigation() {
    console.log("🧭 Initializing navigation system");
    
    // Verify that pathfinder from astar.js is available
    if (!window.pathfinder) {
        console.error("Pathfinder from astar.js is not available. Navigation may not work correctly.");
    } else {
        console.log("Pathfinder from astar.js is available and will be used for routing.");
    }
    
    // Create the route visualization group
    routeVisualization = new THREE.Group();
    routeVisualization.name = "navigation-route";
    scene.add(routeVisualization);
    
    // Create the direction arrow
    createDirectionArrow();
    
    // Create the navigation UI
    createNavigationUI();
    
    // Listen for GPS updates
    window.addEventListener('gpsupdate', onGPSUpdate);
    
    console.log("🧭 Navigation system initialized");
}

/**
 * Create the next waypoint direction arrow
 */
function createDirectionArrow() {
    const arrowHelper = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),  // Direction
        new THREE.Vector3(0, 10, 0), // Position
        NAV_CONFIG.arrowScale,       // Length
        NAV_CONFIG.nextWaypointColor,// Color
        NAV_CONFIG.arrowScale * 0.3, // Head length
        NAV_CONFIG.arrowScale * 0.2  // Head width
    );
    
    arrowHelper.visible = false;
    scene.add(arrowHelper);
    nextWaypointArrow = arrowHelper;
}

/**
 * Create the navigation UI
 */
function createNavigationUI() {
    // Create navigation panel (keep this for displaying information)
    navInfoPanel = document.createElement('div');
    navInfoPanel.id = 'navInfo';
    navInfoPanel.style.position = 'absolute';
    navInfoPanel.style.bottom = '70px';
    navInfoPanel.style.left = '10px';
    navInfoPanel.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
    navInfoPanel.style.color = '#5d6b88';
    navInfoPanel.style.padding = '10px 15px';
    navInfoPanel.style.borderRadius = '10px';
    navInfoPanel.style.fontFamily = 'Arial, sans-serif';
    navInfoPanel.style.fontSize = '14px';
    navInfoPanel.style.zIndex = '1000';
    navInfoPanel.style.display = 'none';
    navInfoPanel.style.maxWidth = '300px';
    navInfoPanel.style.boxShadow = '0 4px 16px rgba(93, 132, 194, 0.15)';
    navInfoPanel.style.border = '1.5px solid rgba(93, 132, 194, 0.08)';
    navInfoPanel.style.backdropFilter = 'blur(8px)';
    document.body.appendChild(navInfoPanel);

    // We've removed:
    // 1. Navigation control button (Start/Stop Navigation)
    // 2. Voice control button (Sound toggle)
    // 3. Manual Start Library button
    
    // These buttons are no longer needed, but the core navigation functionality remains
    // and can still be accessed programmatically via the navigationSystem API
}

/**
 * Toast notification system
 */
function showToast(message, type = "info") {
    let toast = document.getElementById('navToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'navToast';
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '10px';
        toast.style.color = '#5d6b88';
        toast.style.fontWeight = 'bold';
        toast.style.zIndex = '2000';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease-in-out';
        toast.style.boxShadow = '0 4px 16px rgba(93, 132, 194, 0.15)';
        toast.style.backdropFilter = 'blur(8px)';
        document.body.appendChild(toast);
    }
    
    // Set color based on type
    if (type === "error") {
        toast.style.backgroundColor = 'rgba(255, 235, 235, 0.95)';
        toast.style.borderLeft = '4px solid #e53e3e';
    } else if (type === "success") {
        toast.style.backgroundColor = 'rgba(235, 255, 240, 0.95)';
        toast.style.borderLeft = '4px solid #38a169';
    } else {
        toast.style.backgroundColor = 'rgba(235, 245, 255, 0.95)';
        toast.style.borderLeft = '4px solid #5d84c2';
    }
    
    toast.textContent = message;
    toast.style.opacity = '1';
    
    // Clear any existing timeout
    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    
    // Hide after 3 seconds
    toast.timeoutId = setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

/**
 * Text-to-speech for navigation guidance
 */
function speakText(text) {
    if (!voiceEnabled) return;
    
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.cancel(); // Cancel any ongoing speech
        window.speechSynthesis.speak(utterance);
    }
}

/**
 * Navigate to a destination building
 * @param {string} destinationName - The name of the destination building
 */
function navigateTo(destinationName) {
    console.log(`🧭 Navigating to: ${destinationName}`);
    
    // Find the destination object
    destinationObject = findBuildingByName(destinationName);
    
    if (!destinationObject) {
        showToast(`Destination '${destinationName}' not found`, "error");
        console.error(`Destination '${destinationName}' not found`);
        return false;
    }
    
    // Check if GPS is active
    if (!NAV_CONFIG.useRealGPS && !lastKnownPosition) {
        // Start in simulation mode from a default position
        lastKnownPosition = { x: 0, z: 0 };
    } else if (NAV_CONFIG.useRealGPS && !lastKnownPosition && !window.gpsTracker) {
        showToast("GPS is not available. Please enable GPS tracking first.", "error");
        console.error("GPS is not available");
        return false;
    }
    
    // Clear any existing navigation
    clearNavigation();
    
    // Calculate route
    if (calculateRoute()) {
        // Navigation UI elements have been removed, so we don't need to show them anymore
        showToast(`Route to ${destinationName} calculated`, "success");
        return true;
    }
    
    return false;
}

/**
 * Calculate route using A* pathfinding
 */
function calculateRoute() {
    console.log("🧭 Calculating route...");
    
    // Get destination position
    const destPos = new THREE.Vector3();
    new THREE.Box3().setFromObject(destinationObject).getCenter(destPos);
    
    // Get current position (from GPS or simulation)
    let currentPos;
    if (NAV_CONFIG.useRealGPS && lastKnownPosition && lastKnownPosition.coords) {
        const worldPos = geoToWorld(lastKnownPosition.coords.latitude, lastKnownPosition.coords.longitude);
        currentPos = new THREE.Vector3(worldPos.x, 0, worldPos.z);
    } else if (lastKnownPosition) {
        currentPos = new THREE.Vector3(lastKnownPosition.x, 0, lastKnownPosition.z);
    } else {
        showToast("No starting position available", "error");
        return false;
    }
    
    console.log("🧭 From:", currentPos);
    console.log("🧭 To:", destPos);
    
    // Using astar.js for pathfinding
    try {
        // Find path using astar.js's pathfinding
        const startId = pathfinder.findNearestPointWorld(currentPos);
        const endId = pathfinder.findNearestPointWorld(destPos);
        
        if (!startId || !endId) {
            showToast("Could not find valid path points", "error");
            return false;
        }
        
        console.log("🧭 Using graph points:", startId, endId);
        
        // Use astar.js's findPath
        const path = pathfinder.findPath(startId, endId);
        
        if (!path || path.length < 2) {
            showToast("No valid path found", "error");
            return false;
        }
        
        console.log("🧭 Path found:", path);
        currentPath = path;
        
        // Convert path to world coordinates for our own navigation logic
        worldPath = path.map(id => {
            const p = pathfinder.pointMap.get(id).position;
            return transformGraphPoint({ position: p });
        });
        
        // Apply path simplification if enabled
        if (NAV_CONFIG.smoothPath) {
            worldPath = simplifyPath(worldPath, NAV_CONFIG.pathSimplifyThreshold);
        }
        
        // Use astar.js's visualizePath instead of our own visualizeRoute
        visualizePath(path);
        
        // Update direction arrow pointing to next waypoint
        updateDirectionArrow();
        
        return true;
    } catch (error) {
        console.error("Error in pathfinding:", error);
        showToast("Error calculating route", "error");
        return false;
    }
}

/**
 * Simplify path by removing unnecessary waypoints
 * @param {Array<THREE.Vector3>} path - Original path
 * @param {number} threshold - Distance threshold
 * @returns {Array<THREE.Vector3>} Simplified path
 */
function simplifyPath(path, threshold) {
    if (path.length <= 2) return path;
    
    const result = [path[0]];
    let i = 0;
    
    while (i < path.length - 1) {
        let currentPoint = path[i];
        let nextIndex = i + 1;
        
        // Look ahead to find points that can be skipped
        while (nextIndex < path.length - 1) {
            const nextPoint = path[nextIndex];
            const distanceToNext = currentPoint.distanceTo(path[nextIndex + 1]);
            
            if (distanceToNext <= threshold) {
                // Skip this point
                nextIndex++;
            } else {
                break;
            }
        }
        
        // Add next significant point
        result.push(path[nextIndex]);
        i = nextIndex;
    }
    
    console.log(`🧭 Path simplified: ${path.length} points → ${result.length} points`);
    return result;
}

/**
 * Visualize the navigation route
 * @param {Array<THREE.Vector3>} path - Array of points in world coordinates
 */
function visualizeRoute(path) {
    // This function is removed as we now use astar.js's visualizePath function
    // For compatibility, we'll forward calls to the astar.js version
    if (path && currentPath) {
        visualizePath(currentPath);
    }
}

/**
 * Clear route visualization
 */
function clearRouteVisualization() {
    // This function is removed as we now use astar.js's clearPath function
    // For compatibility, we'll forward calls to the astar.js version
    clearPath();
}

/**
 * Update direction arrow pointing to next waypoint
 */
function updateDirectionArrow() {
    if (!worldPath || !nextWaypointArrow || currentWaypointIndex >= worldPath.length) {
        if (nextWaypointArrow) nextWaypointArrow.visible = false;
        return;
    }
    
    // Get current position (from GPS or simulation)
    let currentPos;
    if (NAV_CONFIG.useRealGPS && lastKnownPosition && lastKnownPosition.coords) {
        const worldPos = geoToWorld(lastKnownPosition.coords.latitude, lastKnownPosition.coords.longitude);
        currentPos = new THREE.Vector3(worldPos.x, 0, worldPos.z);
    } else if (lastKnownPosition) {
        currentPos = new THREE.Vector3(lastKnownPosition.x, 0, lastKnownPosition.z);
    } else {
        if (nextWaypointArrow) nextWaypointArrow.visible = false;
        return;
    }
    
    // Get next waypoint
    const targetWaypoint = worldPath[currentWaypointIndex];
    
    // Calculate direction vector
    const direction = new THREE.Vector3().subVectors(targetWaypoint, currentPos).normalize();
    
    // Update arrow position and direction
    nextWaypointArrow.position.set(currentPos.x, 10, currentPos.z);
    nextWaypointArrow.setDirection(direction);
    nextWaypointArrow.visible = true;
}

/**
 * Start the navigation process
 */
function startNavigation() {
    if (!worldPath || worldPath.length === 0 || !currentPath) {
        showToast("No route available", "error");
        return false;
    }
    
    navigationActive = true;
    currentWaypointIndex = 0;
    
    // Show navigation info panel
    if (navInfoPanel) {
        navInfoPanel.style.display = 'block';
    }
    
    // Enable camera follow mode
    if (typeof window.followMode !== 'undefined') {
        window.followMode = true;
        // Update UI checkbox if it exists
        const followToggle = document.getElementById('gpsFollowToggle');
        if (followToggle) {
            followToggle.checked = true;
        }
    }
    
    // Start the simulation if not using real GPS
    if (!NAV_CONFIG.useRealGPS) {
        startSimulation();
    }
    
    // Set up regular updates
    updateNavigation();
    
    console.log("🧭 Navigation started");
    showToast("Navigation started", "success");
    speakText("Navigation started");
    
    // Schedule regular updates
    recalculationTimer = setInterval(() => {
        if (navigationActive) {
            updateNavigation();
        }
    }, NAV_CONFIG.updateIntervalMs);
    
    return true;
}

/**
 * Stop the navigation process
 */
function stopNavigation() {
    navigationActive = false;
    
    // Stop simulation if active
    if (simulationActive) {
        stopSimulation();
    }
    
    // Hide direction arrow
    if (nextWaypointArrow) {
        nextWaypointArrow.visible = false;
    }
    
    // Hide navigation info panel
    if (navInfoPanel) {
        navInfoPanel.style.display = 'none';
    }
    
    // Clear recalculation timer
    if (recalculationTimer) {
        clearInterval(recalculationTimer);
        recalculationTimer = null;
    }
    
    console.log("🧭 Navigation stopped");
    showToast("Navigation stopped", "info");
    
    return true;
}

/**
 * Clear all navigation data and UI
 */
function clearNavigation() {
    // Stop navigation if active
    if (navigationActive) {
        stopNavigation();
    }
    
    // Clear route visualization using astar.js's clearPath
    clearPath();
    
    // Reset variables
    currentPath = null;
    worldPath = null;
    currentWaypointIndex = 0;
    
    // Navigation control elements have been removed, so we don't need to hide them anymore
    
    console.log("🧭 Navigation cleared");
}

/**
 * Update navigation based on current position
 */
function updateNavigation() {
    if (!navigationActive || isProcessingUpdate || !worldPath || worldPath.length === 0) {
        return;
    }
    
    isProcessingUpdate = true;
    
    try {
        // Get current position
        let currentPos;
        if (NAV_CONFIG.useRealGPS && lastKnownPosition && lastKnownPosition.coords) {
            const worldPos = geoToWorld(lastKnownPosition.coords.latitude, lastKnownPosition.coords.longitude);
            currentPos = new THREE.Vector3(worldPos.x, 0, worldPos.z);
        } else if (lastKnownPosition) {
            currentPos = new THREE.Vector3(lastKnownPosition.x, 0, lastKnownPosition.z);
        } else {
            console.warn("No position available for navigation update");
            isProcessingUpdate = false;
            return;
        }
        
        // Get current target waypoint
        const targetWaypoint = worldPath[currentWaypointIndex];
        if (!targetWaypoint) {
            console.warn("Invalid waypoint index:", currentWaypointIndex);
            isProcessingUpdate = false;
            return;
        }
        
        // Calculate distance to waypoint
        const distance = currentPos.distanceTo(targetWaypoint);
        
        // Check if reached waypoint
        if (distance <= NAV_CONFIG.arrivalDistance) {
            // Move to next waypoint
            currentWaypointIndex++;
            
            // Check if reached destination
            if (currentWaypointIndex >= worldPath.length) {
                // Destination reached
                onDestinationReached();
                isProcessingUpdate = false;
                return;
            }
            
            // Announce waypoint reached
            const nextWaypoint = worldPath[currentWaypointIndex];
            const nextDistance = currentPos.distanceTo(nextWaypoint);
            const instruction = getNavigationInstruction(currentWaypointIndex);
            
            updateNavigationInfo(instruction, nextDistance);
            speakText(instruction);
        } else {
            // Update navigation info
            const instruction = getNavigationInstruction(currentWaypointIndex);
            updateNavigationInfo(instruction, distance);
        }
        
        // Update direction arrow
        updateDirectionArrow();
        
        // Check if we need to recalculate the path (if too far from path)
        if (NAV_CONFIG.useRealGPS) {
            const closestPointOnPath = findClosestPointOnPath(currentPos, worldPath);
            const distanceFromPath = currentPos.distanceTo(closestPointOnPath);
            
            if (distanceFromPath > NAV_CONFIG.recalculationDistance) {
                console.log(`🧭 Too far from path (${distanceFromPath.toFixed(2)}m), recalculating...`);
                calculateRoute();
                
                // Reset waypoint index
                currentWaypointIndex = 0;
                
                // Notify user
                showToast("Route recalculated", "info");
            }
        }
    } catch (error) {
        console.error("Error in updateNavigation:", error);
    }
    
    isProcessingUpdate = false;
}

/**
 * Find closest point on path to a given position
 */
function findClosestPointOnPath(position, path) {
    let closestPoint = null;
    let minDistance = Infinity;
    
    // Check each segment of the path
    for (let i = 0; i < path.length - 1; i++) {
        const pointOnSegment = closestPointOnSegment(position, path[i], path[i + 1]);
        const distance = position.distanceTo(pointOnSegment);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = pointOnSegment;
        }
    }
    
    return closestPoint || path[0];
}

/**
 * Find closest point on line segment to a given position
 */
function closestPointOnSegment(point, segStart, segEnd) {
    const segment = new THREE.Vector3().subVectors(segEnd, segStart);
    const segmentLength = segment.length();
    const segmentDirection = segment.clone().normalize();
    
    const pointToStart = new THREE.Vector3().subVectors(point, segStart);
    const projection = pointToStart.dot(segmentDirection);
    
    if (projection <= 0) {
        return segStart.clone();
    }
    
    if (projection >= segmentLength) {
        return segEnd.clone();
    }
    
    return new THREE.Vector3().addVectors(
        segStart,
        segmentDirection.multiplyScalar(projection)
    );
}

/**
 * Get navigation instruction for the current waypoint
 */
function getNavigationInstruction(waypointIndex) {
    if (!worldPath || waypointIndex >= worldPath.length) {
        return "Follow the route";
    }
    
    // Simple instructions for now
    if (waypointIndex === worldPath.length - 1) {
        return "Arriving at your destination";
    } else if (waypointIndex === 0) {
        return "Start following the path";
    } else {
        return `Continue to waypoint ${waypointIndex + 1} of ${worldPath.length}`;
    }
}

/**
 * Update navigation information panel
 */
function updateNavigationInfo(instruction, distance) {
    if (!navInfoPanel) return;
    
    // Get ETA based on average walking speed (1.4 m/s)
    const walkingSpeed = 1.4; // meters per second
    const eta = Math.round(distance / walkingSpeed);
    let etaText = "";
    
    if (eta < 60) {
        etaText = `${eta} seconds`;
    } else {
        const minutes = Math.floor(eta / 60);
        const seconds = eta % 60;
        etaText = `${minutes} min ${seconds} sec`;
    }
    
    navInfoPanel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #5d84c2; font-size: 1.1em;">${instruction}</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="color: #5d6b88; font-weight: 600;">Distance:</span>
            <span style="color: #5d6b88;">${distance.toFixed(1)}m</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="color: #5d6b88; font-weight: 600;">ETA:</span>
            <span style="color: #5d6b88;">${etaText}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(93, 132, 194, 0.15); padding-top: 5px; margin-top: 5px;">
            <span style="color: #5d6b88; font-weight: 600;">Waypoint:</span>
            <span style="color: #5d6b88;">${currentWaypointIndex + 1}/${worldPath.length}</span>
        </div>
    `;
}

/**
 * Handle destination reached event
 */
function onDestinationReached() {
    console.log("🧭 Destination reached!");
    showToast("You have reached your destination!", "success");
    speakText("You have reached your destination!");
    
    // Stop navigation
    stopNavigation();
    
    // Navigation control elements have been removed, so we don't need to hide them anymore
}

/**
 * GPS update event handler
 */
function onGPSUpdate(event) {
    if (!event.detail || !event.detail.position) return;
    
    lastKnownPosition = event.detail.position;
    
    // Update navigation if active
    if (navigationActive) {
        updateNavigation();
    }
}

/**
 * Start position simulation for testing
 */
function startSimulation() {
    if (simulationActive) return;
    
    simulationActive = true;
    
    // Start with first point in path
    if (worldPath && worldPath.length > 0) {
        lastKnownPosition = { x: worldPath[0].x, z: worldPath[0].z };
    } else {
        lastKnownPosition = { x: 0, z: 0 };
    }
    
    // Create a visual marker for simulation
    const simMarkerGeometry = new THREE.SphereGeometry(3, 16, 16);
    const simMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x0088ff });
    const simMarker = new THREE.Mesh(simMarkerGeometry, simMarkerMaterial);
    simMarker.position.set(lastKnownPosition.x, 10, lastKnownPosition.z);
    simMarker.name = "sim-position-marker";
    scene.add(simMarker);
    
    // Update at regular intervals
    simulationInterval = setInterval(() => {
        if (!navigationActive || !worldPath || currentWaypointIndex >= worldPath.length) {
            stopSimulation();
            return;
        }
        
        // Get current target waypoint
        const targetWaypoint = worldPath[currentWaypointIndex];
        
        // Calculate direction and movement
        const currentPos = new THREE.Vector3(lastKnownPosition.x, 0, lastKnownPosition.z);
        const direction = new THREE.Vector3().subVectors(targetWaypoint, currentPos).normalize();
        
        // Move toward target at specified speed
        const movement = direction.multiplyScalar(NAV_CONFIG.simulationSpeed);
        lastKnownPosition.x += movement.x;
        lastKnownPosition.z += movement.z;
        
        // Update simulation marker
        const marker = scene.getObjectByName("sim-position-marker");
        if (marker) {
            marker.position.set(lastKnownPosition.x, 10, lastKnownPosition.z);
        }
        
        // Dispatch fake GPS update event
        window.dispatchEvent(new CustomEvent('gpsupdate', {
            detail: { position: lastKnownPosition }
        }));
    }, 100);
    
    console.log("🧭 Simulation started");
}

/**
 * Stop position simulation
 */
function stopSimulation() {
    simulationActive = false;
    
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    
    // Remove simulation marker
    const marker = scene.getObjectByName("sim-position-marker");
    if (marker) {
        scene.remove(marker);
    }
    
    console.log("🧭 Simulation stopped");
}

/**
 * Update GPS tracker integration
 * This function patches the gpsTracker.js file to work with our navigation system
 */
function patchGPSTracker() {
    // Only patch if gpsTracker exists
    if (!window.gpsTracker) {
        console.warn("GPS Tracker not found, skipping integration");
        return;
    }
    
    // Patch the updateGPSMarker function to dispatch events
    const originalUpdateGPSMarker = window.updateGPSMarker;
    window.updateGPSMarker = function(position) {
        // Call original function
        originalUpdateGPSMarker(position);
        
        // Dispatch custom event for navigation system
        window.dispatchEvent(new CustomEvent('gpsupdate', {
            detail: { position: position }
        }));
    };
    
    console.log("✅ GPS Tracker integration complete");
}

/**
 * Public API for the navigation system
 */
window.navigationSystem = {
    /**
     * Navigate to a named destination
     * @param {string} destinationName - Name of the destination building
     */
    navigateTo: function(destinationName) {
        return navigateTo(destinationName);
    },
    
    /**
     * Start active navigation guidance
     */
    start: function() {
        return startNavigation();
    },
    
    /**
     * Stop active navigation guidance
     */
    stop: function() {
        return stopNavigation();
    },
    
    /**
     * Clear navigation route and UI
     */
    clear: function() {
        clearNavigation();
    },
    
    /**
     * Toggle voice guidance
     * @param {boolean} enabled - Whether voice guidance should be enabled
     */
    setVoiceGuidance: function(enabled) {
        voiceEnabled = enabled;
        const voiceBtn = document.getElementById('voiceControlBtn');
        if (voiceBtn) {
            voiceBtn.style.backgroundColor = voiceEnabled ? '#4CAF50' : '#888';
        }
        return voiceEnabled;
    },
    
    /**
     * Toggle between real GPS and simulation
     * @param {boolean} useReal - Whether to use real GPS
     */
    useRealGPS: function(useReal) {
        NAV_CONFIG.useRealGPS = useReal;
        // Stop any active navigation to reset
        if (navigationActive) {
            stopNavigation();
            startNavigation();
        }
    },
    
    /**
     * Set simulation speed (when in simulation mode)
     * @param {number} speed - Speed in units per second
     */
    setSimulationSpeed: function(speed) {
        NAV_CONFIG.simulationSpeed = Math.max(1, speed);
    }
};

// Initialize the navigation system when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("🧭 Initializing navigation system...");
    initNavigation();
    patchGPSTracker();
});

// Initialize immediately if the document is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log("🧭 Document already loaded, initializing navigation system...");
    initNavigation();
    patchGPSTracker();
}