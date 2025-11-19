import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEFAULT_NPC_STATE, NPC_STATE_ICONS, getRandomNpcState } from './npcStates.js';

const ENVIRONMENT_MODEL = '/models/Desert.glb';
const PLAYER_MODEL = '/models/man1.glb';
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const NPC_POOL = [
    '/models/man2.glb',
    '/models/man3.glb',
    '/models/woman1.glb',
    '/models/woman2.glb',
    '/models/woman3.glb',
    '/models/woman4.glb'
];

const NPC_POSITIONS = [
    new THREE.Vector3(4, 0, -6),
    new THREE.Vector3(-3, 0, -4),
    new THREE.Vector3(2, 0, 2),
    new THREE.Vector3(-5, 0, 5),
    new THREE.Vector3(6, 0, 1)
];

export class ThreeWorld {
    constructor(parentElement) {
        this.parentElement = parentElement ?? document.body;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d1117);

        this.cameraTarget = new THREE.Vector3();
        this.cameraRadius = 8;
        this.cameraHeight = 3;
        this.cameraYaw = 0;
        this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
        this.camera.position.copy(this._getCameraOffset());

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.domElement = this.renderer.domElement;
        Object.assign(this.domElement.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '2'
        });
        this.parentElement.appendChild(this.domElement);

        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.clock = new THREE.Clock();

        this.player = {
            group: null,
            mixer: null,
            action: null,
            headBone: null,
            sprite: null,
            speed: 3.25,
            input: { forward: 0, strafe: 0 },
            velocity: new THREE.Vector3()
        };

        this.npcs = [];
        this.tempVector = new THREE.Vector3();

        this._addLights();
        this._loadEnvironment();
        this._loadPlayer();
        this._spawnNpcs();

        this.resize(
            this.parentElement.clientWidth || window.innerWidth,
            this.parentElement.clientHeight || window.innerHeight
        );
    }

    setPlayerInput({ forward = 0, strafe = 0 } = {}) {
        this.player.input.forward = THREE.MathUtils.clamp(forward, -1, 1);
        this.player.input.strafe = THREE.MathUtils.clamp(strafe, -1, 1);
    }

    update(deltaMs = 0) {
        const deltaSeconds = deltaMs ? deltaMs / 1000 : this.clock.getDelta();

        if (!Number.isFinite(deltaSeconds)) {
            return;
        }

        this._updatePlayer(deltaSeconds);
        this._updateNpcs(deltaSeconds);
        this._updateCamera(deltaSeconds);

        this.renderer.render(this.scene, this.camera);
    }

    resize(width, height) {
        if (!width || !height) {
            width = this.parentElement.clientWidth;
            height = this.parentElement.clientHeight;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.domElement.style.width = `${width}px`;
        this.domElement.style.height = `${height}px`;
    }

    rotateCamera(deltaX) {
        const sensitivity = 0.0045;
        this.cameraYaw += deltaX * sensitivity;
    }

    changeStateIcon(stateKey) {
        if (!this.player.sprite) {
            return;
        }
        this._applySpriteTexture(this.player.sprite, stateKey);
    }

    destroy() {
        if (this.parentElement.contains(this.domElement)) {
            this.parentElement.removeChild(this.domElement);
        }

        this.scene.traverse((obj) => {
            if (!obj.isMesh) {
                return;
            }
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

        this.renderer.dispose();
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

    _loadPlayer() {
        this.loader.load(
            PLAYER_MODEL,
            (gltf) => {
                const group = new THREE.Group();
                group.add(gltf.scene);
                group.position.set(0, 0, 0);
                this.scene.add(group);

                const headBone = this._findHeadBone(gltf.scene);
                const sprite = this._createStateSprite(DEFAULT_NPC_STATE, 0.6);
                this.scene.add(sprite);

                this.player.group = group;
                this.player.headBone = headBone;
                this.player.sprite = sprite;

                if (gltf.animations?.length) {
                    this.player.mixer = new THREE.AnimationMixer(gltf.scene);
                    const clip = this._findWalkClip(gltf.animations);
                    if (clip) {
                        this.player.action = this.player.mixer.clipAction(clip);
                        this.player.action.play();
                    }
                }
            },
            undefined,
            (error) => {
                console.error('Error cargando jugador:', error);
            }
        );
    }

    _normalizeEnvironment(root) {
        const bounds = new THREE.Box3().setFromObject(root);
        if (bounds.isEmpty()) {
            return;
        }

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

    _getCameraOffset() {
        return new THREE.Vector3(
            Math.sin(this.cameraYaw) * this.cameraRadius,
            this.cameraHeight,
            Math.cos(this.cameraYaw) * this.cameraRadius
        );
    }

    _spawnNpcs() {
        NPC_POSITIONS.forEach((position, index) => {
            const modelPath = NPC_POOL[index % NPC_POOL.length];
            const state = getRandomNpcState();
            this._loadNpc(modelPath, position, state);
        });
    }

    _loadNpc(modelPath, position, stateKey) {
        this.loader.load(
            modelPath,
            (gltf) => {
                const npcGroup = new THREE.Group();
                npcGroup.add(gltf.scene);
                npcGroup.position.copy(position);
                this.scene.add(npcGroup);

                const headBone = this._findHeadBone(gltf.scene);
                const sprite = this._createStateSprite(stateKey, 0.55);
                this.scene.add(sprite);

                const npcData = {
                    group: npcGroup,
                    headBone,
                    sprite,
                    stateKey,
                    mixer: null
                };

                if (gltf.animations?.length) {
                    npcData.mixer = new THREE.AnimationMixer(gltf.scene);
                    const clip = this._findWalkClip(gltf.animations);
                    if (clip) {
                        const action = npcData.mixer.clipAction(clip);
                        action.timeScale = 0.3;
                        action.play();
                    }
                }

                this.npcs.push(npcData);
            },
            undefined,
            (error) => {
                console.error(`Error cargando NPC ${modelPath}:`, error);
            }
        );
    }

    _updatePlayer(deltaSeconds) {
        if (!this.player.group) {
            return;
        }

        if (this.player.mixer) {
            this.player.mixer.update(deltaSeconds);
        }

        const hasInput =
            Math.abs(this.player.input.forward) > 0.01 || Math.abs(this.player.input.strafe) > 0.01;

        if (this.player.action) {
            this.player.action.paused = !hasInput;
        }

        if (hasInput) {
            const cameraOffset = this._getCameraOffset();
            const forwardDir = cameraOffset.clone().multiplyScalar(-1);
            forwardDir.y = 0;

            if (forwardDir.lengthSq() > 0.0001) {
                forwardDir.normalize();
                const rightDir = new THREE.Vector3().crossVectors(forwardDir, WORLD_UP).normalize();

                this.player.velocity.copy(forwardDir).multiplyScalar(this.player.input.forward);
                this.player.velocity.addScaledVector(rightDir, this.player.input.strafe);

                if (this.player.velocity.lengthSq() > 0.0001) {
                    this.player.velocity
                        .normalize()
                        .multiplyScalar(this.player.speed * deltaSeconds);

                    this.player.group.position.add(this.player.velocity);

                    const targetAngle = Math.atan2(this.player.velocity.x, this.player.velocity.z);
                    this.player.group.rotation.y = targetAngle;
                }
            }
        }

        if (this.player.headBone && this.player.sprite) {
            this.player.headBone.getWorldPosition(this.tempVector);
            this.tempVector.y += 1.2;
            this.player.sprite.position.copy(this.tempVector);
        }
    }

    _updateNpcs(deltaSeconds) {
        this.npcs.forEach((npc) => {
            npc.mixer?.update(deltaSeconds * 0.5);

            if (npc.headBone && npc.sprite) {
                npc.headBone.getWorldPosition(this.tempVector);
                this.tempVector.y += 1.1;
                npc.sprite.position.copy(this.tempVector);
            }
        });
    }

    _updateCamera(deltaSeconds) {
        if (!this.player.group) {
            return;
        }

        const cameraOffset = this._getCameraOffset();
        const desiredPosition = this.player.group.position.clone().add(cameraOffset);
        this.camera.position.lerp(desiredPosition, 1 - Math.exp(-4 * deltaSeconds));

        this.cameraTarget.copy(this.player.group.position);
        this.cameraTarget.y += 1.6;
        this.camera.lookAt(this.cameraTarget);
    }

    _createStateSprite(stateKey = DEFAULT_NPC_STATE, scale = 0.5) {
        const material = new THREE.SpriteMaterial({
            map: this.textureLoader.load(NPC_STATE_ICONS[stateKey] ?? NPC_STATE_ICONS.unknown),
            transparent: true
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(scale, scale, 1);
        return sprite;
    }

    _applySpriteTexture(sprite, stateKey) {
        const path = NPC_STATE_ICONS[stateKey] ?? NPC_STATE_ICONS.unknown;
        this.textureLoader.load(path, (texture) => {
            const oldMaterial = sprite.material;
            sprite.material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true
            });

            if (oldMaterial) {
                oldMaterial.map?.dispose();
                oldMaterial.dispose();
            }
        });
    }

    _findHeadBone(root) {
        let head = null;
        root.traverse((obj) => {
            if (obj.isBone && obj.name.toLowerCase().includes('head')) {
                head = obj;
            }
        });
        return head;
    }

    _findWalkClip(animations = []) {
        return (
            THREE.AnimationClip.findByName(animations, 'Walk') ??
            THREE.AnimationClip.findByName(animations, 'CharacterArmature|Walk') ??
            animations.find((clip) => clip.name?.toLowerCase().includes('walk')) ??
            null
        );
    }
}

