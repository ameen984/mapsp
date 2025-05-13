// astar.js

class AStarPathfinder {
    constructor(graph) {
        this.graph = graph;
        this.pointMap = new Map();
        for (const point of graph.points) {
            this.pointMap.set(point.id, point);
        }
        this.neighbors = new Map();
        for (const conn of graph.connections) {
            if (!this.neighbors.has(conn.from)) this.neighbors.set(conn.from, []);
            if (!this.neighbors.has(conn.to)) this.neighbors.set(conn.to, []);
            this.neighbors.get(conn.from).push({ id: conn.to, cost: conn.cost });
            this.neighbors.get(conn.to).push({ id: conn.from, cost: conn.cost });
        }
    }
// in AStarPathfinder
findNearestPointWorld(position) {
    let nearestId = null;
    let minDist   = Infinity;
  
    for (const node of this.graph.points) {
      // project into world space
      const worldPos = transformGraphPoint(node);
      const d = position.distanceTo(worldPos);
      if (d < minDist) {
        minDist   = d;
        nearestId = node.id;
      }
    }
  
    return nearestId;
  }
  

    findPath(startId, endId) {
        const openSet = new Set([startId]);
        const cameFrom = new Map();
        const gScore = new Map(this.graph.points.map(p => [p.id, Infinity]));
        const fScore = new Map(this.graph.points.map(p => [p.id, Infinity]));

        gScore.set(startId, 0);
        fScore.set(startId, this.heuristic(startId, endId));

        while (openSet.size > 0) {
            let current = [...openSet].reduce((a, b) => fScore.get(a) < fScore.get(b) ? a : b);
            if (current === endId) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet.delete(current);
            for (const neighbor of this.neighbors.get(current) || []) {
                const tentativeG = gScore.get(current) + neighbor.cost;
                if (tentativeG < gScore.get(neighbor.id)) {
                    cameFrom.set(neighbor.id, current);
                    gScore.set(neighbor.id, tentativeG);
                    fScore.set(neighbor.id, tentativeG + this.heuristic(neighbor.id, endId));
                    if (!openSet.has(neighbor.id)) {
                        openSet.add(neighbor.id);
                    }
                }
            }
        }
        console.warn("No valid path found between buildings. They might be in disconnected areas.");
        return null;
    }

    heuristic(aId, bId) {
        const a = this.pointMap.get(aId).position;
        const b = this.pointMap.get(bId).position;
        return Math.sqrt(
            (a.x - b.x) ** 2 +
            (a.y - b.y) ** 2 +
            (a.z - b.z) ** 2
        );
    }

    reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.unshift(current);
        }
        return path;
    }
}

function findPathBetweenBuildings(startName, endName) {
    const startObj = findBuildingByName(startName);
    const endObj = findBuildingByName(endName);

    if (!startObj || !endObj) {
        console.warn("Buildings not found:", startName, endName);
        return null;
    }

    const startPos = new THREE.Vector3();
    const endPos = new THREE.Vector3();
    new THREE.Box3().setFromObject(startObj).getCenter(startPos);
    new THREE.Box3().setFromObject(endObj).getCenter(endPos);

    console.log('Start position:', startPos);
    console.log('End position:', endPos);

    const startId = pathfinder.findNearestPointWorld(startPos);
const endId   = pathfinder.findNearestPointWorld(endPos);

    console.log('Nearest graph point IDs:', startId, endId);

    const path = pathfinder.findPath(startId, endId);
    console.log('Computed path:', path);

    if (path) {
        visualizePath(path);
    }

    return path;
}

function findBuildingByName(name) {
    let found = null;
    model.traverse((obj) => {
        if (obj.userData.isInteractiveBuilding && obj.name === name) {
            found = obj;
        }
    });
    return found;
}

function visualizePath(path) {
    console.log('—— visualizePath called ——', path);
    if (!path || path.length < 2) {
        console.warn('Path too short or missing, skipping visualization.');
        return;
    }

    // 1) Remove previous
    const GROUP_NAME = 'path-visual';
    const old = scene.getObjectByName(GROUP_NAME);
    if (old) scene.remove(old);

    // 2) Build raw world‐space v3s
    const rawPoints = path.map(id => {
        const p = pathfinder.pointMap.get(id).position;
        return new THREE.Vector3(p.x, p.y, p.z);
    });
    console.log('rawPoints count:', rawPoints.length);

    // 3) Transform into scene coordinates
    const points = rawPoints.map(v => transformGraphPoint({ position: v }));
    console.log('worldPoints after transform:', points);

    // 4) Create a smooth TubeGeometry
    const curve    = new THREE.CatmullRomCurve3(points);
    const segments = Math.max(points.length * 10, 200);
    const radius   = 1.0;   // thicker
    const radial   = 16;    // smoother
    const geo      = new THREE.TubeGeometry(curve, segments, radius, radial, false);
    const mat      = new THREE.MeshBasicMaterial({
        color:       0xff0000,
        transparent: true,
        opacity:     0.8,
        depthTest:   false   // render on top
    });
    mat.depthWrite = false;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;

    // 5) Add direction arrows every few segments
    const group = new THREE.Group();
    group.name = GROUP_NAME;
    group.add(mesh);

    const arrowLen  = 3;
    const headLen   = 1;
    const headWidth = 0.6;
    for (let i = 0; i < points.length - 1; i += Math.max(1, Math.floor(points.length / 20))) {
        const from = points[i];
        const to   = points[i + 1];
        const dir  = new THREE.Vector3().subVectors(to, from).normalize();
        const arrow = new THREE.ArrowHelper(
            dir,
            from.clone().add(dir.clone().multiplyScalar(radius + 0.2)),
            arrowLen,
            0xff0000,
            headLen,
            headWidth
        );
        arrow.renderOrder = 1000;
        group.add(arrow);
    }

    // 6) Put it into the scene
    scene.add(group);
    console.log('— Path visualization added to scene —');
}


// Clear any existing path visualization
function clearPath() {
    // Remove the path visualization group if it exists
    const GROUP_NAME = 'path-visual';
    if (scene) {
        const old = scene.getObjectByName(GROUP_NAME);
        if (old) scene.remove(old);
    }
    // Optionally clear any path state variables if needed
    if (typeof pathLine !== 'undefined') pathLine = null;
    if (typeof currentPath !== 'undefined') currentPath = null;
    console.log('Path cleared');
}
  