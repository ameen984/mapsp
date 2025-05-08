let scene, camera, renderer, model, controls;
let raycaster, mouse;
let selectedBuilding = null;
let isTopView = true;
let buildingData = new Map();
let mapBounds = null;
let mapCenter = new THREE.Vector3();
let mapSize = new THREE.Vector3();
let inertiaEnabled = true;
let inertia = { x: 0, y: 0, z: 0 };
let lastMousePosition = { x: 0, y: 0 };
let isMouseDown = false;
let damping = 0.95;
let roadGraph = null;
let roadPoints = [];
// record of how you've recentered/scaled the GLTF (if you still do that)
let modelTransform = {
  scale:     1,
  translate: new THREE.Vector3(0, 0, 0)
};
let graphCalibration = {
    scale: new THREE.Vector3(1, 1, 1),   // Additional scaling factor
    translate: new THREE.Vector3(0, 5, 0), // Additional translation
    rotate: new THREE.Euler(0, 0, 0)     // Additional rotation in radians
  };


  
////////////////////////////////////////////////////////////////////////////////
// ROAD‐GRAPH LOADER (Insert here)
////////////////////////////////////////////////////////////////////////////////
// ─────────────────────────────────────────────────────────────────
// 1) ROAD‐GRAPH LOADER
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// 1) ROAD‐GRAPH LOADER
// ─────────────────────────────────────────────────────────────────
async function loadRoadGraph() {
    const resp = await fetch('road_graph.json');
    const data = await resp.json();
  
    // convert legacy "nodes" → "points"
    if (data.nodes && !data.points) {
      data.points = data.nodes.map(n => ({
        id: n.id,
        position: { x: n.position[0], y: n.position[1], z: n.position[2] }
      }));
    }
  
    // normalize any array of edges → connections
    data.connections = data.connections || data.edges || data.links;
  
    // fallback: chain each point to its next neighbor
    if (!data.connections) {
      data.connections = data.points.slice(0, -1).map((p, i) => {
        const q = data.points[i + 1];
        const dx = q.position.x - p.position.x;
        const dy = q.position.y - p.position.y;
        const dz = q.position.z - p.position.z;
        return { from: p.id, to: q.id, cost: Math.hypot(dx, dy, dz) };
      });
    }
  
    return data;
  }
  function transformGraphPoint(point) {
    // Start with original point position
    const pos = new THREE.Vector3(
      point.position.x,
      point.position.y,
      point.position.z
    );
    
    // Apply rotation (if any)
    pos.applyEuler(graphCalibration.rotate);
    
    // Apply calibration scale factor (component-wise)
    pos.x *= graphCalibration.scale.x;
    pos.y *= graphCalibration.scale.y;
    pos.z *= graphCalibration.scale.z;
    
    // Apply model scale
    pos.multiplyScalar(modelTransform.scale);
    
    // Apply model translation
    pos.add(modelTransform.translate);
    
    // Apply calibration translation
    pos.add(graphCalibration.translate);
    
    return pos;
  }
  
  
// ─────────────────────────────────────────────────────────────────
// 2) DEBUG: VISUALIZE ROAD GRAPH UNDER MODEL TRANSFORM
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// 2) DEBUG: VISUALIZE ROAD GRAPH WITH MODEL TRANSFORM
// ─────────────────────────────────────────────────────────────────
function visualizeRoadGraph(graph) {
    // Remove previous visuals
    const old = scene.getObjectByName('road-graph-visuals');
    if (old) scene.remove(old);
  
    const group = new THREE.Group();
    group.name = 'road-graph-visuals';
    
    // Draw nodes
    const nodeGeo = new THREE.SphereGeometry(1.2, 8, 8);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    
    // Create a lookup map for faster access during edge creation
    const nodePositions = new Map();
    
    for (const p of graph.points) {
      // Apply full transformation
      const world = transformGraphPoint(p);
      
      // Store transformed position for edge creation
      nodePositions.set(p.id, world.clone());
      
      const mesh = new THREE.Mesh(nodeGeo, nodeMat);
      mesh.position.copy(world);
      group.add(mesh);
    }
  
    // Draw edges
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x888888 });
    const positions = [];
    
    for (const c of graph.connections) {
      // Use pre-calculated positions from the nodePositions map
      const wa = nodePositions.get(c.from);
      const wb = nodePositions.get(c.to);
      
      if (wa && wb) {
        positions.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z);
      }
    }
    
    const edgeGeo = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    
    group.add(new THREE.LineSegments(edgeGeo, edgeMat));
    scene.add(group);
    
    console.log(`Visualized road graph with ${graph.points.length} nodes and ${graph.connections.length} connections`);
    console.log('Current graph calibration:', graphCalibration);
  }
  function addCalibrationControls() {
    // Add a simple GUI panel for adjusting road graph calibration
    // Only add this if you have dat.gui included in your project
    if (window.dat && window.dat.GUI) {
      const gui = new dat.GUI({ name: 'Graph Calibration' });
      
      // Scale controls
      const scaleFolder = gui.addFolder('Scale');
      scaleFolder.add(graphCalibration.scale, 'x', 0.1, 10).name('X Scale').onChange(() => visualizeRoadGraph(roadGraph));
      scaleFolder.add(graphCalibration.scale, 'y', 0.1, 10).name('Y Scale').onChange(() => visualizeRoadGraph(roadGraph));
      scaleFolder.add(graphCalibration.scale, 'z', 0.1, 10).name('Z Scale').onChange(() => visualizeRoadGraph(roadGraph));
      scaleFolder.open();
      
      // Translation controls
      const translateFolder = gui.addFolder('Translation');
      translateFolder.add(graphCalibration.translate, 'x', -100, 100).name('X Shift').onChange(() => visualizeRoadGraph(roadGraph));
      translateFolder.add(graphCalibration.translate, 'y', -100, 100).name('Y Shift').onChange(() => visualizeRoadGraph(roadGraph));
      translateFolder.add(graphCalibration.translate, 'z', -100, 100).name('Z Shift').onChange(() => visualizeRoadGraph(roadGraph));
      translateFolder.open();
      
      // Rotation controls (in degrees for easier understanding)
      const rotationFolder = gui.addFolder('Rotation (degrees)');
      
      // We need to convert between degrees (GUI) and radians (THREE.js)
      const rotationProxy = {
        x: graphCalibration.rotate.x * 180/Math.PI,
        y: graphCalibration.rotate.y * 180/Math.PI,
        z: graphCalibration.rotate.z * 180/Math.PI
      };
      
      rotationFolder.add(rotationProxy, 'x', -180, 180).name('X Rotation').onChange(value => {
        graphCalibration.rotate.x = value * Math.PI/180;
        visualizeRoadGraph(roadGraph);
      });
      
      rotationFolder.add(rotationProxy, 'y', -180, 180).name('Y Rotation').onChange(value => {
        graphCalibration.rotate.y = value * Math.PI/180;
        visualizeRoadGraph(roadGraph);
      });
      
      rotationFolder.add(rotationProxy, 'z', -180, 180).name('Z Rotation').onChange(value => {
        graphCalibration.rotate.z = value * Math.PI/180;
        visualizeRoadGraph(roadGraph);
      });
      
      rotationFolder.open();
      
      // Add a button to log current calibration to console
      gui.add({ logCalibration: function() {
        console.log('Current calibration:', JSON.stringify(graphCalibration, null, 2));
      }}, 'logCalibration').name('Log Calibration');
    } else {
      console.warn('dat.GUI not found. Calibration controls not added.');
    }
  }
  function setupKeyboardCalibration() {
    window.addEventListener('keydown', (event) => {
      // Only run when holding the Alt key
      if (!event.altKey) return;
      
      // Define movement step sizes
      const translateStep = event.shiftKey ? 5 : 1;
      const scaleStep = event.shiftKey ? 0.1 : 0.01;
      const rotateStep = event.shiftKey ? 5 : 1;
      
      let updated = false;
      
      // Translation with WASD + QE
      if (event.key === 'a') { 
        graphCalibration.translate.x -= translateStep; 
        updated = true; 
      }
      if (event.key === 'd') { 
        graphCalibration.translate.x += translateStep; 
        updated = true; 
      }
      if (event.key === 'w') { 
        graphCalibration.translate.z -= translateStep; 
        updated = true; 
      }
      if (event.key === 's') { 
        graphCalibration.translate.z += translateStep; 
        updated = true; 
      }
      if (event.key === 'q') { 
        graphCalibration.translate.y -= translateStep; 
        updated = true; 
      }
      if (event.key === 'e') { 
        graphCalibration.translate.y += translateStep; 
        updated = true; 
      }
      
      // Scale with IJK (X, Y, Z)
      if (event.key === 'i') {
        graphCalibration.scale.x += scaleStep;
        updated = true;
      }
      if (event.key === 'k') {
        graphCalibration.scale.x -= scaleStep;
        updated = true;
      }
      if (event.key === 'o') {
        graphCalibration.scale.y += scaleStep;
        updated = true;
      }
      if (event.key === 'l') {
        graphCalibration.scale.y -= scaleStep;
        updated = true;
      }
      if (event.key === 'p') {
        graphCalibration.scale.z += scaleStep;
        updated = true;
      }
      if (event.key === ';') {
        graphCalibration.scale.z -= scaleStep;
        updated = true;
      }
      
      // Rotation with arrow keys + PageUp/PageDown
      if (event.key === 'ArrowLeft') {
        graphCalibration.rotate.y -= rotateStep * Math.PI/180;
        updated = true;
      }
      if (event.key === 'ArrowRight') {
        graphCalibration.rotate.y += rotateStep * Math.PI/180;
        updated = true;
      }
      if (event.key === 'ArrowUp') {
        graphCalibration.rotate.x -= rotateStep * Math.PI/180;
        updated = true;
      }
      if (event.key === 'ArrowDown') {
        graphCalibration.rotate.x += rotateStep * Math.PI/180;
        updated = true;
      }
      if (event.key === 'PageUp') {
        graphCalibration.rotate.z += rotateStep * Math.PI/180;
        updated = true;
      }
      if (event.key === 'PageDown') {
        graphCalibration.rotate.z -= rotateStep * Math.PI/180;
        updated = true;
      }
      
      // Print current settings with 'c'
      if (event.key === 'c') {
        console.log('Current calibration:', {
          scale: {
            x: graphCalibration.scale.x.toFixed(3),
            y: graphCalibration.scale.y.toFixed(3),
            z: graphCalibration.scale.z.toFixed(3)
          },
          translate: {
            x: graphCalibration.translate.x.toFixed(1),
            y: graphCalibration.translate.y.toFixed(1),
            z: graphCalibration.translate.z.toFixed(1)
          },
          rotate: {
            x: (graphCalibration.rotate.x * 180/Math.PI).toFixed(1) + '°',
            y: (graphCalibration.rotate.y * 180/Math.PI).toFixed(1) + '°',
            z: (graphCalibration.rotate.z * 180/Math.PI).toFixed(1) + '°'
          }
        });
      }
      
      // Reset with 'r'
      if (event.key === 'r') {
        graphCalibration = {
          scale: new THREE.Vector3(1, 1, 1),
          translate: new THREE.Vector3(0, 5, 0),
          rotate: new THREE.Euler(0, 0, 0)
        };
        updated = true;
        console.log('Calibration reset to defaults');
      }
      
      if (updated) {
        visualizeRoadGraph(roadGraph);
        event.preventDefault();
      }
    });
    
    // Add a help overlay for keyboard shortcuts
    const helpDiv = document.createElement('div');
    helpDiv.style.position = 'fixed';
    helpDiv.style.bottom = '10px';
    helpDiv.style.right = '10px';
    helpDiv.style.background = 'rgba(0,0,0,0.7)';
    helpDiv.style.color = 'white';
    helpDiv.style.padding = '10px';
    helpDiv.style.borderRadius = '5px';
    helpDiv.style.fontSize = '12px';
    helpDiv.style.fontFamily = 'monospace';
    helpDiv.style.display = 'none';
    helpDiv.style.zIndex = '1000';
    
    helpDiv.innerHTML = `
      <h3>Graph Alignment Keyboard Controls</h3>
      <p>Hold ALT + key to adjust</p>
      <p>Hold SHIFT for larger increments</p>
      <ul>
        <li>W/A/S/D - Move graph (X/Z)</li>
        <li>Q/E - Move graph up/down (Y)</li>
        <li>I/K - Scale X axis</li>
        <li>O/L - Scale Y axis</li>
        <li>P/; - Scale Z axis</li>
        <li>Arrows - Rotate X/Y</li>
        <li>Page Up/Down - Rotate Z</li>
        <li>C - Print current settings</li>
        <li>R - Reset to defaults</li>
        <li>H - Toggle this help</li>
      </ul>
    `;
    
    document.body.appendChild(helpDiv);
    
    // Toggle help with 'h' key
    window.addEventListener('keydown', (event) => {
      if (event.key === 'h') {
        helpDiv.style.display = helpDiv.style.display === 'none' ? 'block' : 'none';
      }
    });
    
    console.log('Keyboard calibration controls enabled. Press H for help.');
  }
  
  // Add a comparison mode to help with alignment
  function toggleComparisonMode() {
    const graphVisuals = scene.getObjectByName('road-graph-visuals');
    
    if (!graphVisuals) {
      console.warn('No graph visualization found');
      return;
    }
    
    // Toggle visibility of different elements to help with alignment
    graphVisuals.visible = !graphVisuals.visible;
    
    console.log(
      graphVisuals.visible ? 
      'Graph visualization enabled' : 
      'Graph visualization disabled'
    );
  }
  
  // Add a button for comparison mode
  function addComparisonModeButton() {
    const button = document.createElement('button');
    button.textContent = 'Toggle Graph';
    button.style.position = 'absolute';
    button.style.top = '10px';
    button.style.right = '10px';
    button.style.zIndex = '100';
    button.addEventListener('click', toggleComparisonMode);
    document.body.appendChild(button);
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Function to save alignment to localStorage
  // ─────────────────────────────────────────────────────────────────
  function saveGraphAlignment() {
    const calibration = {
      scale: {
        x: graphCalibration.scale.x,
        y: graphCalibration.scale.y,
        z: graphCalibration.scale.z
      },
      translate: {
        x: graphCalibration.translate.x,
        y: graphCalibration.translate.y,
        z: graphCalibration.translate.z
      },
      rotate: {
        x: graphCalibration.rotate.x,
        y: graphCalibration.rotate.y,
        z: graphCalibration.rotate.z
      }
    };
    
    localStorage.setItem('graphCalibration', JSON.stringify(calibration));
    console.log('Graph calibration saved:', calibration);
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Function to load alignment from localStorage
  // ─────────────────────────────────────────────────────────────────
  function loadGraphAlignment() {
    const saved = localStorage.getItem('graphCalibration');
    if (saved) {
      try {
        const calibration = JSON.parse(saved);
        
        graphCalibration.scale.set(
          calibration.scale.x, 
          calibration.scale.y, 
          calibration.scale.z
        );
        
        graphCalibration.translate.set(
          calibration.translate.x, 
          calibration.translate.y, 
          calibration.translate.z
        );
        
        graphCalibration.rotate.set(
          calibration.rotate.x, 
          calibration.rotate.y, 
          calibration.rotate.z
        );
        
        console.log('Graph calibration loaded:', calibration);
        
        if (roadGraph) {
          visualizeRoadGraph(roadGraph);
        }
        
        return true;
      } catch (e) {
        console.error('Failed to load graph calibration:', e);
      }
    }
    
    return false;
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Initialize calibration tools
  // ─────────────────────────────────────────────────────────────────
  function initGraphCalibrationTools() {
    // Try to load saved calibration
  
    
      graphCalibration = {
    scale: new THREE.Vector3(1, 1, 1),
    translate: new THREE.Vector3(2, 2, 1),
    rotate: new THREE.Euler(-1.5707963267948966, 0, 0)
};

    
    
    // Set up keyboard controls
    setupKeyboardCalibration();
    
    // Add UI controls and buttons
    addComparisonModeButton();
    
    // Add save button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save Alignment';
    saveButton.style.position = 'absolute';
    saveButton.style.top = '50px';
    saveButton.style.right = '10px';
    saveButton.style.zIndex = '100';
    saveButton.addEventListener('click', saveGraphAlignment);
    document.body.appendChild(saveButton);
  }
  
// Initialize building data
function initializeBuildingData() {
    const defaultInfo = {
        description: 'Building information not available',
        details: 'Additional details pending'
    };

    return async function(buildingName) {
        if (buildingData.has(buildingName)) {
            return buildingData.get(buildingName);
        }

        try {
            // You can replace this with actual API call to fetch building data
            const info = {
                name: buildingName,
                description: `Information for ${buildingName}`,
                details: `Detailed information for ${buildingName}`,
                // Add more fields as needed
            };
            buildingData.set(buildingName, info);
            return info;
        } catch (error) {
            console.warn(`Failed to fetch data for ${buildingName}:`, error);
            return { name: buildingName, ...defaultInfo };
        }
    };
}

const getBuildingInfo = initializeBuildingData();

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xe8e8e8,
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0; // Explicitly set ground to y=0
    ground.receiveShadow = true;
    ground.userData.isGround = true; // Mark as ground
    ground.userData.isInteractiveBuilding = false; // Explicitly mark as non-interactive
    scene.add(ground);
}

function setupLighting() {
    // Clear any existing lights first
    scene.children.forEach(child => {
        if (child.isLight) scene.remove(child);
    });
    
    // Base ambient light - softer than before
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // Main directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xfffaf0, 1.0);
    sunLight.position.set(100, 200, 100);
    sunLight.castShadow = true;
    
    // Improve shadow quality
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 1000;
    
    // Adjust shadow camera frustum
    const shadowSize = 500;
    sunLight.shadow.camera.left = -shadowSize;
    sunLight.shadow.camera.right = shadowSize;
    sunLight.shadow.camera.top = shadowSize;
    sunLight.shadow.camera.bottom = -shadowSize;
    
    sunLight.shadow.radius = 2;
    scene.add(sunLight);

    // Secondary fill light
    const fillLight = new THREE.DirectionalLight(0xc2d1e8, 0.4);
    fillLight.position.set(-100, 50, -100);
    scene.add(fillLight);

    // Hemisphere light
    const hemisphereLight = new THREE.HemisphereLight(0x90c0ff, 0x556b2f, 0.4);
    scene.add(hemisphereLight);
}

function setupEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    
    const color1 = new THREE.Color(0x88ccff);
    const color2 = new THREE.Color(0xffffff);
    
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = color1.getStyle();
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = color2.getStyle();
    context.fillRect(1, 0, 1, 1);
    
    const envTexture = new THREE.CanvasTexture(canvas);
    envTexture.needsUpdate = true;
    
    const envMap = pmremGenerator.fromEquirectangular(envTexture).texture;
    scene.environment = envMap;
    
    pmremGenerator.dispose();
}

// ─────────────────────────────────────────────────────────────────
// APP INITIALIZATION
// ─────────────────────────────────────────────────────────────────
// Make sure you have at the top of the file:
// let roadGraph = null;
// let roadPoints = [];

// ─────────────────────────────────────────────────────────────────
// 3) INIT (async) — loads graph, sets up A*, then kicks off model load
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// 3) INIT (async) — loads graph, sets up A*, then kicks off model load
// ─────────────────────────────────────────────────────────────────
async function init() {
  const container = document.getElementById('container');
  const loadingOverlay = document.getElementById('loadingOverlay');

  // raycaster & mouse
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // scene & camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
  camera.position.set(0, 500, 0);
  camera.lookAt(0, 0, 0);

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // environment, lights, ground
  setupEnvironment();
  setupLighting();
  createGround();

  // controls & events
  setupControls();
  setupEventListeners();

  // load the road graph before the model
  roadGraph = await loadRoadGraph();
  pathfinder = new AStarPathfinder(roadGraph);
  roadPoints = roadGraph.points.map(p => ({
      id: p.id,
      position: new THREE.Vector3(p.position.x, p.position.y, p.position.z)
  }));
  console.log('Road graph loaded, A* ready');

  initGraphCalibrationTools();

  // now load the 3D model
  loadModel();

  // kick off render loop
  animate();

  // ✅ GPS tracking setup
  if (window.setupGPSMarker && window.startGPSTracking) {
      window.setupGPSMarker();
      window.startGPSTracking();
  } else {
      console.warn('GPS tracker functions not loaded');
  }

  // ✅ Click logger setup
  if (typeof setupBuildingClickLogger === 'function') {
      setupBuildingClickLogger();
  } else {
      console.warn('Building click logger not loaded');
  }

  // ✅ 🚀 NEW: Initialize the navigation system
  if (window.navigationSystem && typeof navigationSystem.init === 'function') {
      navigationSystem.init({
          scene: scene,
          pathfinder: pathfinder,
          gps: window.gpsTracker // optional: pass gps object if you expose it
      });

      // 👉 Start navigation automatically (for testing)
      navigationSystem.navigateTo('l798419266');  // Change 'Library' as needed
      navigationSystem.start();
  } else {
      console.warn('Navigation system not found or missing init()');
  }
}

  
// ─────────────────────────────────────────────────────────────────
// 4) LOAD MODEL — applies transforms, then visualizes graph under it
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// 4) LOAD MODEL — applies transforms, then visualizes graph under it
// ─────────────────────────────────────────────────────────────────
function loadModel() {
  const loader = new THREE.GLTFLoader();
  const loadingOverlay = document.getElementById('loadingOverlay');

  loader.load(
      'model.glb',
      function (gltf) {
          // remove old model if exists
          if (model) scene.remove(model);
          model = gltf.scene;

          // 🔴 ADD: log world position of the target object
          const lib = model.getObjectByName('798419266');
          if (lib) {
              const worldPos = new THREE.Vector3();
              lib.getWorldPosition(worldPos);
              console.log('🌍 Library world position:', worldPos);
          } else {
              console.warn('⚠️ Library object not found!');
          }

          const bbox = new THREE.Box3().setFromObject(model);
          const size = bbox.getSize(new THREE.Vector3());
          const center = bbox.getCenter(new THREE.Vector3());
          const minY = bbox.min.y;
          console.log('📦 Model size:', size);
          console.log('🎯 Model center:', center);

          // embedded lights?
          let hasLights = false;
          model.traverse(node => {
              if (node.isLight) {
                  hasLights = true;
                  if (node.castShadow !== undefined) {
                      node.castShadow = true;
                      node.shadow.mapSize.width = 2048;
                      node.shadow.mapSize.height = 2048;
                  }
              }
          });
          if (!hasLights) setupLighting();

          const maxDim = Math.max(size.x, size.z);
          const targetPct = 0.8 * Math.min(window.innerWidth, window.innerHeight);
          const scale = targetPct / maxDim;

          model.scale.setScalar(scale);
          model.position.set(
              -center.x * scale,
              -minY * scale,
              -center.z * scale
          );

          // record for debug visualizeRoadGraph
          modelTransform.scale = scale;
          modelTransform.translate = model.position.clone();

          setupModelMaterials();
          scene.add(model);
          //addReferenceDebugMarker();  // This will show the green debug marker at (referencePoint.worldX, worldZ)


          // DEBUG: visualize the road graph now that model is in place
          if (roadGraph) visualizeRoadGraph(roadGraph);

          setupInitialView();
          calculateMapBoundaries();
          loadingOverlay.style.display = 'none';
          populateBuildingSelects();
      },
      xhr => {
          console.log(`Loading: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
      },
      error => {
          console.error('Error loading model:', error);
          loadingOverlay.style.display = 'none';
          Swal.fire({
              icon: 'error',
              title: 'Load Error',
              text: 'Failed to load model. Refresh?'
          });
      }
  );
}




// Populate building selection dropdowns
function populateBuildingSelects() {
    if (!model) return;
    
    const startSelect = document.getElementById('startBuildingSelect');
    const endSelect = document.getElementById('endBuildingSelect');
    
    // Clear previous options except the first one
    while (startSelect.options.length > 1) {
        startSelect.remove(1);
    }
    
    while (endSelect.options.length > 1) {
        endSelect.remove(1);
    }
    
    // Find all interactive buildings
    const buildings = [];
    model.traverse((object) => {
        if (object.userData && object.userData.isInteractiveBuilding) {
            buildings.push({
                name: object.name,
                info: object.userData.buildingInfo
            });
        }
    });
    
    // Sort buildings alphabetically
    buildings.sort((a, b) => a.name.localeCompare(b.name));
    
    // Add options to selects
    buildings.forEach(building => {
        const startOption = document.createElement('option');
        startOption.value = building.name;
        startOption.textContent = building.name;
        startSelect.appendChild(startOption);
        
        const endOption = document.createElement('option');
        endOption.value = building.name;
        endOption.textContent = building.name;
        endSelect.appendChild(endOption);
    });
}

async function setupModelMaterials() {
    model.traverse(async function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Create a unique material instance for each mesh
            if (child.material) {
                // Clone the material for each building to make it independent
                child.material = child.material.clone();
                
                // Save original material properties
                child.userData.originalMaterial = child.material.clone();
                child.userData.originalColor = child.material.color ? 
                                              child.material.color.clone() : 
                                              new THREE.Color(0xcccccc);
                
                // Enhance material properties if needed
                if (child.material.isMeshStandardMaterial) {
                    child.material.envMapIntensity = 1.0;
                    if (child.material.roughness === 1) child.material.roughness = 0.8;
                } else {
                    // Create a unique phong material for each building
                    child.material = new THREE.MeshPhongMaterial({
                        color: child.userData.originalColor,
                        shininess: 30,
                        specular: 0x444444
                    });
                }
            }
            
            // Consider all meshes with names as interactive buildings
            if (child.name && child.name.trim() !== '') {
                child.userData.isInteractiveBuilding = true;
                child.userData.buildingInfo = await getBuildingInfo(child.name);
            }
        }
    });
}

// Calculate map boundaries based on the model
function calculateMapBoundaries() {
    if (!model) return;
    
    mapBounds = new THREE.Box3().setFromObject(model);
    mapCenter = mapBounds.getCenter(new THREE.Vector3());
    mapSize = mapBounds.getSize(new THREE.Vector3());
    
    // Set up some padding to keep camera from going too far
    const padding = Math.max(mapSize.x, mapSize.z) * 0.1;
    mapBounds.min.x -= padding;
    mapBounds.min.z -= padding;
    mapBounds.max.x += padding;
    mapBounds.max.z += padding;
}

function setupControls() {
    // Orbit (mouse) controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.minDistance = 50;
    controls.maxDistance = 500;
    controls.maxPolarAngle = Math.PI / 2.5;
    controls.minPolarAngle = Math.PI / 6;
    controls.rotateSpeed = 0.3;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.6;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    controls.enableKeys = false;
  
    // UI buttons (click)
    document.getElementById('tiltButton')
      .addEventListener('click', toggleTiltView);
    document.getElementById('zoomIn')
      .addEventListener('click', () => zoomView(0.8));
    document.getElementById('zoomOut')
      .addEventListener('click', () => zoomView(1.2));
  
    // --- TOUCH CONTROLS VIA HAMMER.JS ---
    const hammer = new Hammer(renderer.domElement);
    hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });
    hammer.get('pinch').set({ enable: true });
    hammer.get('tap').set({ taps: 1 });
    hammer.get('doubletap').set({ taps: 2 });
  
    // Pan → translate camera target
    hammer.on('panmove', (e) => {
      const deltaX = -e.deltaX * 0.5; // adjust sensitivity
      const deltaY = e.deltaY * 0.5;
      controls.target.x += deltaX;
      controls.target.z += deltaY;
      camera.position.x += deltaX;
      camera.position.z += deltaY;
      controls.update();
    });
  
    // Pinch → zoom
    let initialDist = null;
    hammer.on('pinchstart', (e) => { initialDist = e.scale; });
    hammer.on('pinchmove', (e) => {
      if (initialDist === null) return;
      const zoomFactor = initialDist / e.scale;
      zoomView(zoomFactor);
      initialDist = e.scale;
    });
  
    // Single tap → select building
    hammer.on('tap', (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.center.x - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.center.y - rect.top) / rect.height) * 2 + 1;
      onMouseClick({ clientX: e.center.x, clientY: e.center.y });
    });
  
    // Double tap → recenter
    hammer.on('doubletap', () => {
      setupInitialView();
    });
  
    // Prevent pinch from also triggering pinch-zoom on the page
    renderer.domElement.style.touchAction = 'none';
  }
  

// Add mouse event handlers for inertia effect
function onMapMouseDown(event) {
    isMouseDown = true;
    inertia = { x: 0, y: 0, z: 0 };
    lastMousePosition = { x: event.clientX, y: event.clientY };
}

function onMapMouseUp(event) {
    if (!isMouseDown) return;
    isMouseDown = false;
    
    // Calculate inertia based on last movement
    if (inertiaEnabled) {
        inertia.x = (event.clientX - lastMousePosition.x) * 0.05;
        inertia.y = (event.clientY - lastMousePosition.y) * 0.05;
    }
}

// Adjust setupInitialView to ensure the entire model is visible
function setupInitialView() {
    if (!model) return;
    
    const bbox = new THREE.Box3().setFromObject(model);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    // Calculate distance based on model size to ensure full visibility
    const distance = Math.max(size.x, size.y, size.z) * 1.5;
    
    // Position camera above and slightly to one side for better initial view
    camera.position.set(center.x + distance * 0.3, distance, center.z + distance * 0.3);
    camera.lookAt(center);
    
    controls.target.copy(center);
    controls.update();
}

function toggleTiltView() {
    if (!model) return;
    
    const bbox = new THREE.Box3().setFromObject(model);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    if (isTopView) {
        const distance = size.y * 2;
        camera.position.set(
            center.x - distance,
            distance,
            center.z - distance
        );
    } else {
        const distance = Math.max(size.x, size.z) * 2;
        camera.position.set(center.x, distance, center.z);
    }
    
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
    isTopView = !isTopView;
}

// Enhance the zoom function for smoother experience
function zoomView(factor) {
    // Strength scales with how high the camera is above target
    const currentHeight = camera.position.y - controls.target.y;
    const zoomStrength = Math.max(currentHeight * 0.05, 1);
  
    // Vector from target → camera
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
  
    // Compute a safe scale factor (clamp extreme changes)
    const scaleFactor = factor < 1
      ? Math.max(factor, 0.95 - zoomStrength * 0.001)
      : Math.min(factor, 1.05 + zoomStrength * 0.001);
  
    // Apply zoom
    direction.multiplyScalar(scaleFactor);
    camera.position.copy(controls.target).add(direction);
  
    // Enforce min/max distance
    const distance = camera.position.distanceTo(controls.target);
    if (distance < controls.minDistance) {
      direction.normalize().multiplyScalar(controls.minDistance);
      camera.position.copy(controls.target).add(direction);
    } else if (distance > controls.maxDistance) {
      direction.normalize().multiplyScalar(controls.maxDistance);
      camera.position.copy(controls.target).add(direction);
    }
  
    controls.update();
  }
  

function setupEventListeners() {
    renderer.domElement.addEventListener('click', onMouseClick, false);
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.addEventListener('mousedown', onMapMouseDown, false);
    renderer.domElement.addEventListener('mouseup', onMapMouseUp, false);
    renderer.domElement.addEventListener('mouseleave', onMapMouseUp, false);
    window.addEventListener('resize', onWindowResize, false);
}

// Modify the onMouseClick function to use smooth navigation
function onMouseClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  if (model) {
      // Get all intersections
      const allIntersects = raycaster.intersectObjects(model.children, true);

      // Filter out the ground and the EXPORT_GOOGLE_MAP_WM base surface
      const intersects = allIntersects.filter(intersect => {
          if (intersect.object.name === "EXPORT_GOOGLE_MAP_WM") return false;
          if (intersect.object.userData.isGround) return false;
          return intersect.object.userData.isInteractiveBuilding;
      });

      if (intersects.length > 0) {
          const clickedObject = intersects[0].object;

          // Deselect previous building if exists
          if (selectedBuilding) {
              selectedBuilding.material.color.copy(selectedBuilding.userData.originalColor);
          }

          // Select new building
          selectedBuilding = clickedObject;
          selectedBuilding.material.color.setHex(0x00ff00);

          // Smoothly navigate to the selected building
          smoothNavigateToBuilding(clickedObject);

          updateBuildingInfo(clickedObject);

          // 🌍 World + Local Position logging
          const worldPos = clickedObject.getWorldPosition(new THREE.Vector3());
          const localPos = worldToLocal(worldPos);

          console.log(`🖱️ Clicked Building: ${clickedObject.name || '(unnamed)'}
World Position: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})
Local (3D Model) Position: (${localPos.x.toFixed(2)}, ${localPos.y.toFixed(2)}, ${localPos.z.toFixed(2)})
          `);
      } else if (selectedBuilding) {
          // Deselect if clicking empty space
          selectedBuilding.material.color.copy(selectedBuilding.userData.originalColor);
          selectedBuilding = null;
          // Clear building info
          document.getElementById('infoSidebar').innerHTML = '';
      }
  }
}

// Add a smooth navigation function for clicking on buildings
function smoothNavigateToBuilding(building) {
    if (!building) return;
    
    // Get building position
    const buildingPosition = new THREE.Vector3();
    const boundingBox = new THREE.Box3().setFromObject(building);
    boundingBox.getCenter(buildingPosition);
    
    // Store current positions
    const startTargetPos = controls.target.clone();
    const startCameraPos = camera.position.clone();
    
    // Calculate the end position for the camera target (the building)
    const endTargetPos = buildingPosition.clone();
    
    // Calculate a good viewing position
    const height = camera.position.y - controls.target.y; // Maintain height
    const direction = new THREE.Vector3(0.3, 0, 0.3).normalize(); // Slight angle
    const endCameraPos = endTargetPos.clone().add(
        new THREE.Vector3(direction.x * height, height, direction.z * height)
    );
    
    // Animate the camera movement
    const duration = 1000; // 1 second
    const startTime = Date.now();
    
    function animateCamera() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Use easing function for smoother motion
        const easedProgress = easeInOutCubic(progress);
        
        // Interpolate positions
        controls.target.lerpVectors(startTargetPos, endTargetPos, easedProgress);
        camera.position.lerpVectors(startCameraPos, endCameraPos, easedProgress);
        
        // Continue until completed
        if (progress < 1) {
            requestAnimationFrame(animateCamera);
        }
    }
    
    // Easing function for smooth acceleration/deceleration
    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    // Start animation
    animateCamera();
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    if (model) {
        // Get all intersections
        const allIntersects = raycaster.intersectObjects(model.children, true);
        
        // Filter out the ground and the XPORT_GOOGLE_MAP_WM base surface
        const intersects = allIntersects.filter(intersect => {
            // Check if the object has a name "XPORT_GOOGLE_MAP_WM"
            if (intersect.object.name === "EXPORT_GOOGLE_MAP_WM") return false;
            
            // Check if it's marked as ground
            if (intersect.object.userData.isGround) return false;
            
            // Only include objects marked as interactive buildings
            return intersect.object.userData.isInteractiveBuilding;
        });
        
        const tooltip = document.getElementById('tooltip');

        // Reset color for previously hovered buildings
        model.traverse((child) => {
            if (child.userData.isInteractiveBuilding && child !== selectedBuilding) {
                child.material.color.copy(child.userData.originalColor);
            }
        });

        if (intersects.length > 0) {
            const hoveredObject = intersects[0].object;
            if (hoveredObject !== selectedBuilding) {
                // Only highlight the specific hovered building
                hoveredObject.material.color.setHex(0xff7700);
                
                const info = hoveredObject.userData.buildingInfo;
                tooltip.style.display = "block";
                tooltip.innerHTML = `<strong>${info.name}</strong><br>${info.description}`;
                tooltip.style.left = `${event.clientX + 10}px`;
                tooltip.style.top = `${event.clientY + 10}px`;
            } else {
                tooltip.style.display = "none";
            }
        } else {
            tooltip.style.display = "none";
        }
    }
}
// Update the onWindowResize function to recalculate boundaries
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Recalculate boundaries in case window size affects optimal viewing
    calculateMapBoundaries();
}

// Modify the animate function to include inertia and boundary checks
function animate() {
    requestAnimationFrame(animate);
    
    // Apply inertia if enabled and mouse is not down
    if (inertiaEnabled && !isMouseDown && (Math.abs(inertia.x) > 0.01 || Math.abs(inertia.y) > 0.01)) {
        // Get the current camera direction in the horizontal plane
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        
        // Get the right vector
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        right.normalize();
        
        // Move the camera and target
        const movement = new THREE.Vector3()
            .add(right.multiplyScalar(-inertia.x))
            .add(forward.multiplyScalar(-inertia.y));
        
        camera.position.add(movement);
        controls.target.add(movement);
        
        // Apply damping to slow down the inertia over time
        inertia.x *= damping;
        inertia.y *= damping;
        
        // If inertia is very small, stop it
        if (Math.abs(inertia.x) < 0.01) inertia.x = 0;
        if (Math.abs(inertia.y) < 0.01) inertia.y = 0;
    }
    
    // Apply boundaries to keep camera within map bounds
    if (mapBounds) {
        const cameraPosition = camera.position.clone();
        const targetPosition = controls.target.clone();
        
        // Preserve height (y-position) and constrain only x and z
        let isAdjusted = false;
        
        // Constrain target to map boundaries with some margin
        if (targetPosition.x < mapBounds.min.x) {
            targetPosition.x = mapBounds.min.x;
            isAdjusted = true;
        } else if (targetPosition.x > mapBounds.max.x) {
            targetPosition.x = mapBounds.max.x;
            isAdjusted = true;
        }
        
        if (targetPosition.z < mapBounds.min.z) {
            targetPosition.z = mapBounds.min.z;
            isAdjusted = true;
        } else if (targetPosition.z > mapBounds.max.z) {
            targetPosition.z = mapBounds.max.z;
            isAdjusted = true;
        }
        
        // If we adjusted the target, adjust the camera to maintain the same relative position
        if (isAdjusted) {
            const offset = new THREE.Vector3().subVectors(cameraPosition, controls.target);
            controls.target.copy(targetPosition);
            camera.position.copy(targetPosition).add(offset);
            
            // Zero out inertia when hitting boundaries
            inertia.x = 0;
            inertia.y = 0;
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
    
    // Update compass rotation based on camera
    const compass = document.getElementById('compass');
    if (compass) {
        const rotation = Math.atan2(
            camera.position.x - controls.target.x,
            camera.position.z - controls.target.z
        );
        compass.style.transform = `rotate(${rotation}rad)`;
    }
}

function updateBuildingInfo(building) {
    const sidebar = document.getElementById('infoSidebar');
    const info = building.userData.buildingInfo;
    
    sidebar.innerHTML = `
        <h2>${info.name}</h2>
        <p>${info.description}</p>
        <div class="building-details">
            <p><strong>Details:</strong> ${info.details}</p>
        </div>
    `;
}

// Add navigation control event listeners
document.getElementById('findPathButton').addEventListener('click', () => {
    const startBuilding = document.getElementById('startBuildingSelect').value;
    const endBuilding = document.getElementById('endBuildingSelect').value;
    
    if (!startBuilding || !endBuilding) {
        Swal.fire({
            icon: 'warning',
            title: 'Selection Required',
            text: 'Please select both start and end buildings'
        });
        return;
    }
    
    if (startBuilding === endBuilding) {
        Swal.fire({
            icon: 'warning',
            title: 'Same Building',
            text: 'Start and end buildings must be different'
        });
        return;
    }
    
    const path = findPathBetweenBuildings(startBuilding, endBuilding);
    
    if (!path) {
        Swal.fire({
            icon: 'error',
            title: 'No Path Found',
            text: 'Could not find a path between the selected buildings'
        });
    }
});

document.getElementById('clearPathButton').addEventListener('click', clearPath);

// Placeholder for pathfinding functions

// Add a method to update lighting for time of day
function updateLightingForTimeOfDay(hour) {
    // Get the main directional light
    let sunLight;
    scene.traverse(child => {
        if (child.isDirectionalLight && child.intensity >= 0.8) {
            sunLight = child;
        }
    });
    
    if (!sunLight) return;
    
    // Normalize hour to 0-24 range
    hour = hour % 24;
    
    // Calculate sun position based on time
    const angle = ((hour - 6) / 12) * Math.PI; // Noon at PI/2
    const height = Math.sin(angle);
    const distance = 200;
    
    sunLight.position.x = Math.cos(angle) * distance;
    sunLight.position.y = Math.max(height, 0.1) * distance; // Keep sun slightly above horizon
    sunLight.position.z = Math.sin(angle + Math.PI/4) * distance; // Add offset for angle
    
    // Adjust light color and intensity based on time
    if (hour >= 5 && hour < 8) { // Sunrise
        sunLight.color.setHex(0xffd7a8);
        sunLight.intensity = 0.8;
    } else if (hour >= 8 && hour < 16) { // Day
        sunLight.color.setHex(0xfffaf0);
        sunLight.intensity = 1.0;
    } else if (hour >= 16 && hour < 19) { // Sunset
        sunLight.color.setHex(0xffa075);
        sunLight.intensity = 0.8;
    } else { // Night
        sunLight.color.setHex(0x334455);
        sunLight.intensity = 0.3;
    }
    
    // Adjust scene ambient light
    scene.traverse(child => {
        if (child.isAmbientLight) {
            if (hour >= 5 && hour < 19) { // Daytime
                child.intensity = 0.3;
            } else { // Nighttime
                child.intensity = 0.1;
            }
        }
        
        if (child.isHemisphereLight) {
            if (hour >= 5 && hour < 19) { // Daytime
                child.intensity = 0.4;
            } else { // Nighttime
                child.intensity = 0.2;
            }
        }
    });
}

// Example usage: updateLightingForTimeOfDay(15); // 3 PM lighting

// Initialize and start animation
init();
animate();