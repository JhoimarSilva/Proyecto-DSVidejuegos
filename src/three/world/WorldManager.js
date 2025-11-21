import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

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
        this.loader.load(
            ENVIRONMENT_MODEL,
            (gltf) => {
                this._normalizeEnvironment(gltf.scene);
                this.scene.add(gltf.scene);
            },
            undefined,
            (error) => {
                console.error('Error cargando environment:', error);
            }
        );
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
        if (bounds.isEmpty()) return;

        const center = new THREE.Vector3();
        bounds.getCenter(center);
        root.position.sub(center);

        const alignedBounds = new THREE.Box3().setFromObject(root);
        if (Number.isFinite(alignedBounds.min.y)) {
            root.position.y -= alignedBounds.min.y;
        }

        const finalBounds = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        finalBounds.getSize(size);

        this.environmentBounds = finalBounds;
        this.environmentRadius = size.length() / 2;
    }

    getEnvironmentBounds() {
        return this.environmentBounds;
    }

    getEnvironmentRadius() {
        return this.environmentRadius;
    }

    dispose() {
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
