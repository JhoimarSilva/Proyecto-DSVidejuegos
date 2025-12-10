import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { PhysicsManager } from './PhysicsManager.js';

export class WorldManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.exrLoader = new EXRLoader();
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();
        this.environmentBounds = null;
        this.environmentRadius = 0;
        
        // Initialize physics
        this.physicsManager = new PhysicsManager();
        this.worldBodies = [];
        // Loading state and callbacks
        this._loaded = false;
        this._loadCallbacks = [];
    }

    initialize() {
        this._addLights();
        this._loadEnvironment();
        this._loadSkybox();
    }

    _addLights() {
        const hemi = new THREE.HemisphereLight(0xffffff, 0x3f3f70, 1.15);
        this.scene.add(hemi);

        const dir = new THREE.DirectionalLight(0xffffff, 0.75);
        dir.position.set(15, 25, 20);
        dir.castShadow = false;
        this.scene.add(dir);
    }

    _loadEnvironment() {
        const ENVIRONMENT_MODEL = '/models/world.glb';
        console.log('Loading environment from:', ENVIRONMENT_MODEL);
        this.loader.load(
            ENVIRONMENT_MODEL,
            (gltf) => {
                console.log('Environment loaded successfully');
                // Normalize for visual rendering first
                this._normalizeEnvironment(gltf.scene);
                this.scene.add(gltf.scene);
                console.log('Environment added to scene');
                // Create physics AFTER normalizing (with final coordinates)
                this._createPhysicsForEnvironment(gltf.scene);
                console.log('Physics created for environment');
                // mark as loaded and notify listeners
                this._loaded = true;
                try {
                    this._loadCallbacks.forEach((cb) => cb());
                } finally {
                    this._loadCallbacks.length = 0;
                }
            },
            (progress) => {
                console.log('Loading environment:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
            },
            (error) => {
                console.error('Error cargando environment:', error);
            }
        );
    }

    /**
     * Register a callback to be called once the environment is loaded.
     * If already loaded, the callback is invoked immediately.
     */
    onLoaded(cb) {
        if (this._loaded) {
            try { cb(); } catch (e) { console.warn('onLoaded callback error', e); }
            return;
        }
        this._loadCallbacks.push(cb);
    }

    _createPhysicsForEnvironment(root) {
        // Store reference to world meshes for raycasting
        this.worldMeshes = [];

        root.traverse((child) => {
            if (!child.isMesh) return;
            
            // Skip certain types of meshes
            if (child.name.toLowerCase().includes('emitter') ||
                child.name.toLowerCase().includes('light') ||
                child.name.toLowerCase().includes('camera')) {
                return;
            }

            this.worldMeshes.push(child);
        });

        console.log(`Collected ${this.worldMeshes.length} meshes for collision detection`);
        
        // Create a simple ground plane for physics using Three.js raycasting
        // This is more reliable than Cannon.js trimeshes
        this._createSimpleGroundPhysics();
    }

    _createSimpleGroundPhysics() {
        // Create a simple ground plane at Y=0 with a large size
        const groundGeometry = new THREE.PlaneGeometry(500, 500);
        const groundMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = 0;
        groundMesh.name = 'SimpleGround';
        
        this.scene.add(groundMesh);
        this.groundMesh = groundMesh;
        
        console.log('Created simple ground plane for physics');
    }

    _loadSkybox() {
        // Load HDRI environment (EXR) for sky and environment lighting
        this.exrLoader.load(
            '/sky/kloppenheim_06_puresky_1k.exr',
            (texture) => {
                try {
                    const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
                    this.scene.background = envMap;
                    this.scene.environment = envMap;
                } finally {
                    texture.dispose();
                    this.pmremGenerator.dispose();
                }
            },
            undefined,
            (error) => {
                console.error('Error cargando HDRI:', error);
            }
        );
    }

    _normalizeEnvironment(root) {
        const bounds = new THREE.Box3().setFromObject(root);
        if (bounds.isEmpty()) {
            console.warn('Environment bounds are empty');
            return;
        }

        const center = new THREE.Vector3();
        bounds.getCenter(center);
        
        console.log('Environment center:', center);
        console.log('Environment bounds:', bounds);

        root.position.sub(center);

        const alignedBounds = new THREE.Box3().setFromObject(root);
        if (Number.isFinite(alignedBounds.min.y)) {
            const yOffset = alignedBounds.min.y;
            root.position.y -= yOffset;
            console.log('Y offset applied:', yOffset);
        }

        // Update matrix to ensure child world positions are correct
        root.updateMatrixWorld(true);

        const finalBounds = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        finalBounds.getSize(size);

        this.environmentBounds = finalBounds;
        this.environmentRadius = size.length() / 2;

        console.log('Final environment bounds:', finalBounds);
        console.log('Environment radius:', this.environmentRadius);
    }

    getEnvironmentBounds() {
        return this.environmentBounds;
    }

    getEnvironmentRadius() {
        return this.environmentRadius;
    }

    getPhysicsManager() {
        return this.physicsManager;
    }

    dispose() {
        this.physicsManager.dispose();
        this.scene.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
                obj.material.forEach((material) => {
                    material.map?.dispose();
                    material.dispose();
                });
            } else if (obj.material) {
                obj.material.map?.dispose();
                obj.material.dispose();
            }
        });
    }
}
