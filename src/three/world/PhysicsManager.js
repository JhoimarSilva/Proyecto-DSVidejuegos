import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export class PhysicsManager {
    constructor() {
        // Create physics world
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.defaultContactMaterial.friction = 0.3;

        // Body map for syncing with Three.js
        this.bodyMeshMap = new Map();
        
        // Timestep
        this.timeStep = 1 / 60;
        this.maxSubSteps = 5;
    }

    /**
     * Creates a physics body for a mesh
     * @param {THREE.Object3D} mesh - The Three.js mesh
     * @param {Object} options - Body options
     * @returns {CANNON.Body} The physics body
     */
    createBody(mesh, options = {}) {
        const {
            mass = 0, // 0 = static
            shape = 'box',
            restitution = 0.1,
            friction = 0.3,
            scale = 1
        } = options;

        let shape_cannon;

        try {
            if (shape === 'box') {
                const size = new THREE.Vector3();
                new THREE.Box3().setFromObject(mesh).getSize(size);
                shape_cannon = new CANNON.Box(new CANNON.Vec3(
                    Math.max(size.x / 2 * scale, 0.01),
                    Math.max(size.y / 2 * scale, 0.01),
                    Math.max(size.z / 2 * scale, 0.01)
                ));
            } else if (shape === 'sphere') {
                const size = new THREE.Vector3();
                new THREE.Box3().setFromObject(mesh).getSize(size);
                const radius = Math.max(size.x, size.y, size.z) / 2 * scale;
                shape_cannon = new CANNON.Sphere(Math.max(radius, 0.01));
            } else if (shape === 'cylinder') {
                const size = new THREE.Vector3();
                new THREE.Box3().setFromObject(mesh).getSize(size);
                shape_cannon = new CANNON.Cylinder(
                    Math.max(size.x / 2 * scale, 0.01),
                    Math.max(size.x / 2 * scale, 0.01),
                    Math.max(size.z * scale, 0.01),
                    8
                );
            } else if (shape === 'trimesh' && mesh.geometry) {
                // For complex shapes, use trimesh
                const geometry = mesh.geometry;
                
                // Ensure geometry has vertex position data
                if (!geometry.attributes.position) {
                    throw new Error(`Mesh ${mesh.name} has no position attribute`);
                }

                const vertices = Array.from(geometry.attributes.position.array);
                let indices;

                if (geometry.index) {
                    indices = Array.from(geometry.index.array);
                } else {
                    // Generate indices if not present
                    indices = Array.from({ length: vertices.length / 3 }, (_, i) => i);
                }

                if (vertices.length === 0 || indices.length === 0) {
                    throw new Error(`Mesh ${mesh.name} has no vertices or indices`);
                }

                // Create trimesh
                shape_cannon = new CANNON.Trimesh(vertices, indices);
            } else {
                throw new Error(`Unknown shape type: ${shape}`);
            }

            if (!shape_cannon) {
                throw new Error(`Could not create shape for ${shape}`);
            }

            const body = new CANNON.Body({
                mass,
                shape: shape_cannon,
                restitution: Math.max(0, Math.min(1, restitution)),
                friction: Math.max(0, friction),
                linearDamping: 0.3,
                angularDamping: 0.3
            });

            // Set position and rotation from mesh - handle both local and world matrices
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);
            mesh.getWorldQuaternion(worldQuat);
            mesh.getWorldScale(worldScale);

            body.position.set(worldPos.x, worldPos.y, worldPos.z);
            body.quaternion.set(
                worldQuat.x,
                worldQuat.y,
                worldQuat.z,
                worldQuat.w
            );

            this.world.addBody(body);
            this.bodyMeshMap.set(body, mesh);

            return body;
        } catch (error) {
            console.warn(`Error creating body for mesh ${mesh.name}:`, error.message);
            return null;
        }
    }

    /**
     * Creates compound physics bodies for complex meshes with children
     * @param {THREE.Object3D} root - The root mesh
     * @param {Object} options - Body options
     */
    createCompoundBody(root, options = {}) {
        const { mass = 0, shape = 'box' } = options;

        const body = new CANNON.Body({ mass });

        root.traverse((child) => {
            if (!child.isMesh || child === root) return;

            let shape_cannon;

            if (shape === 'box') {
                const size = new THREE.Vector3();
                new THREE.Box3().setFromObject(child).getSize(size);
                shape_cannon = new CANNON.Box(new CANNON.Vec3(
                    size.x / 2,
                    size.y / 2,
                    size.z / 2
                ));
            } else if (shape === 'sphere') {
                const size = new THREE.Vector3();
                new THREE.Box3().setFromObject(child).getSize(size);
                const radius = Math.max(size.x, size.y, size.z) / 2;
                shape_cannon = new CANNON.Sphere(radius);
            }

            if (shape_cannon) {
                const offset = new CANNON.Vec3(
                    child.position.x,
                    child.position.y,
                    child.position.z
                );
                body.addShape(shape_cannon, new CANNON.Vec3(
                    offset.x,
                    offset.y,
                    offset.z
                ));
            }
        });

        body.position.set(root.position.x, root.position.y, root.position.z);
        body.quaternion.set(
            root.quaternion.x,
            root.quaternion.y,
            root.quaternion.z,
            root.quaternion.w
        );

        this.world.addBody(body);
        this.bodyMeshMap.set(body, root);

        return body;
    }

    /**
     * Updates the physics simulation and syncs with Three.js
     * @param {number} deltaSeconds - Time step in seconds
     */
    update(deltaSeconds = this.timeStep) {
        this.world.step(this.timeStep, deltaSeconds, this.maxSubSteps);

        // Sync physics bodies with Three.js meshes
        this.bodyMeshMap.forEach((mesh, body) => {
            mesh.position.copy(body.position);
            mesh.quaternion.copy(body.quaternion);
        });
    }

    /**
     * Applies force to a body
     * @param {CANNON.Body} body - The physics body
     * @param {THREE.Vector3} force - Force vector
     * @param {THREE.Vector3} point - World position where force is applied
     */
    applyForce(body, force, point = null) {
        const forceVec = new CANNON.Vec3(force.x, force.y, force.z);
        if (point) {
            const pointVec = new CANNON.Vec3(point.x, point.y, point.z);
            body.applyForce(forceVec, pointVec);
        } else {
            body.velocity.x += forceVec.x;
            body.velocity.y += forceVec.y;
            body.velocity.z += forceVec.z;
        }
    }

    /**
     * Sets velocity of a body
     * @param {CANNON.Body} body - The physics body
     * @param {THREE.Vector3} velocity - Velocity vector
     */
    setVelocity(body, velocity) {
        body.velocity.set(velocity.x, velocity.y, velocity.z);
    }

    /**
     * Raycast from a position downward to detect ground
     * @param {THREE.Vector3} position - Starting position
     * @param {number} maxDistance - Maximum ray distance
     * @returns {Object} Result object with hit info or null
     */
    raycastDown(position, maxDistance = 100) {
        const from = new CANNON.Vec3(position.x, position.y, position.z);
        const to = new CANNON.Vec3(position.x, position.y - maxDistance, position.z);
        
        const result = new CANNON.RaycastResult();
        const hitBody = this.world.raycastClosest(from, to, {}, result);

        if (hitBody) {
            return {
                hit: true,
                distance: from.distanceTo(result.hitPointWorld),
                point: new THREE.Vector3(
                    result.hitPointWorld.x,
                    result.hitPointWorld.y,
                    result.hitPointWorld.z
                ),
                normal: new THREE.Vector3(
                    result.hitNormalWorld.x,
                    result.hitNormalWorld.y,
                    result.hitNormalWorld.z
                ),
                body: hitBody
            };
        }

        return null;
    }

    /**
     * Check if a position is inside any body
     * @param {THREE.Vector3} position - Position to check
     * @param {number} sphereRadius - Radius of collision sphere
     * @returns {Array} Array of overlapping bodies
     */
    checkCollisions(position, sphereRadius = 0.5) {
        const overlapBodies = [];
        const pos = new CANNON.Vec3(position.x, position.y, position.z);

        for (const body of this.world.bodies) {
            // Simple distance check - squared for efficiency
            const dx = body.position.x - pos.x;
            const dy = body.position.y - pos.y;
            const dz = body.position.z - pos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            
            if (distSq < sphereRadius * sphereRadius * 4) {
                overlapBodies.push(body);
            }
        }

        return overlapBodies;
    }

    /**
     * Raycast in a specific direction
     * @param {THREE.Vector3} position - Start position
     * @param {THREE.Vector3} direction - Direction to raycast (should be normalized)
     * @param {number} maxDistance - Maximum ray distance
     * @returns {Object} Result object with hit info or null
     */
    raycast(position, direction, maxDistance = 50) {
        const from = new CANNON.Vec3(position.x, position.y, position.z);
        const to = new CANNON.Vec3(
            position.x + direction.x * maxDistance,
            position.y + direction.y * maxDistance,
            position.z + direction.z * maxDistance
        );

        const result = new CANNON.RaycastResult();
        const hitBody = this.world.raycastClosest(from, to, {}, result);

        if (hitBody) {
            return {
                hit: true,
                distance: from.distanceTo(result.hitPointWorld),
                point: new THREE.Vector3(
                    result.hitPointWorld.x,
                    result.hitPointWorld.y,
                    result.hitPointWorld.z
                ),
                normal: new THREE.Vector3(
                    result.hitNormalWorld.x,
                    result.hitNormalWorld.y,
                    result.hitNormalWorld.z
                ),
                body: hitBody
            };
        }

        return null;
    }

    /**
     * Gets the physics world
     * @returns {CANNON.World}
     */
    getWorld() {
        return this.world;
    }

    /**
     * Disposes the physics world
     */
    dispose() {
        this.bodyMeshMap.clear();
        // Cannon.js doesn't have a dispose method, but we can clear references
        this.world = null;
    }
}
