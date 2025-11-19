import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { Audio, AudioListener, AudioLoader } from 'three';
import { DEFAULT_NPC_STATE, NPC_STATE_ICONS, getRandomNpcState, NON_ALERT_STATES, setAllNpcsAngry, setAllNpcsDistracted } from './npcStates.js';

const ENVIRONMENT_MODEL = '/models/world.glb';
const PLAYER_MODEL = '/models/man1.glb';
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CHARACTER_TARGET_HEIGHT = 1.8;

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
        this.cameraRadius = 4.5;
        this.cameraHeight = 2.4;
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
        this.exrLoader = new EXRLoader();
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();

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
                    // pmremGenerator can be disposed after generating the env map
                    this.pmremGenerator.dispose();
                }
            },
            undefined,
            (error) => {
                console.error('Error cargando HDRI:', error);
            }
        );
        this.clock = new THREE.Clock();

        this.player = {
            group: null,
            mixer: null,
            actions: {},
            activeAction: null,
            headBone: null,
            sprite: null,
            speed: {
                walk: 3.25,
                run: 6
            },
            input: { forward: 0, strafe: 0, run: false, jump: false },
            velocity: new THREE.Vector3(),
            verticalVelocity: 0,
            jumpSpeed: 7,
            gravity: -22,
            onGround: true,
            groundHeight: 0,
            queueIndex: null
        };

        this.npcs = [];
        this.queueConfig = {
            root: new THREE.Vector3(-5, 0, -4),
            direction: new THREE.Vector3(0, 0, 1).normalize(),
            spacing: 1.8,
            advanceInterval: 10,
            moveDuration: 1.2,
            timer: 0
        };
        this.tempVector = new THREE.Vector3();

        // Game state for queue cutting mechanics
        this.gameState = {
            playerCaught: false,
            playerInQueue: false,
            queueGapIndex: null,
            gapChangeInterval: 15,
            gapChangeTimer: 0,
            detectionThreshold: 2.5,
            detectionRange: 3,
            // Global distraction window: periodically all NPCs are distracted
            globalDistractInterval: 25,
            globalDistractDuration: 5,
            globalDistractTimer: 0,
            globalDistractActive: false
        };

        // Cycle for queue walking/idle
        this.queueCycle = {
            timer: 0,
            walkTime: 5,
            idleTime: 7,
            cycleDuration: 12 // walkTime + idleTime
        };

        this._addLights();
        this._loadEnvironment();
        this._loadPlayer();
        this._spawnNpcs();

        this.resize(
            this.parentElement.clientWidth || window.innerWidth,
            this.parentElement.clientHeight || window.innerHeight
        );

        this.listener = new AudioListener();
        this.camera.add(this.listener);
        
        //Sonido de abucheos
        this.booSound = new Audio(this.listener);
        this.audioLoader = new AudioLoader();
        this.audioLoader.load('/sounds/abucheos.wav', (buffer) => {
            this.booSound.setBuffer(buffer);
            this.booSound.setVolume(1.0);
        });

    }

    // -------------------------
    // Public API / Inputs
    // -------------------------
    setPlayerInput({ forward = 0, strafe = 0, run = false, jump = false } = {}) {
        this.player.input.forward = THREE.MathUtils.clamp(forward, -1, 1);
        this.player.input.strafe = THREE.MathUtils.clamp(strafe, -1, 1);
        this.player.input.run = Boolean(run);
        this.player.input.jump = this.player.input.jump || Boolean(jump);
    }

    update(deltaMs = 0) {
        const deltaSeconds = deltaMs ? deltaMs / 1000 : this.clock.getDelta();

        if (!Number.isFinite(deltaSeconds)) return;

        if (!this.gameState.playerInQueue) {
            this._updatePlayer(deltaSeconds);  // 👈 movimiento WASD normal
        } else {
            this._updateQueue(deltaSeconds);   // 👈 movimiento guiado de la cola
        }

        this._updatePlayer(deltaSeconds);
        this._updateQueue(deltaSeconds);
        this._updateGlobalDistract(deltaSeconds);
        this._updateNpcs(deltaSeconds);
        this._updateQueueCutting(deltaSeconds);
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
        if (!this.player.sprite) return;
        this._applySpriteTexture(this.player.sprite, stateKey);
    }

    getGameState() {
        return {
            playerCaught: this.gameState.playerCaught,
            playerInQueue: this.gameState.playerInQueue,
            npcsAngry: this.npcs.some((npc) => npc.stateKey === 'angry'),
            nearQueueGap: this._isNearQueueGap(),
            queueGapIndex: this.gameState.queueGapIndex,
            queueGapPosition: this.gameState.queueGapIndex !== null ? this._getQueuePosition(this.gameState.queueGapIndex) : null
        };
    }

    resetGameState() {
        this.gameState.playerCaught = false;
        this.gameState.playerInQueue = false;
        this.npcs.forEach((npc) => {
            npc.stateKey = getRandomNpcState();
            npc.distractionTimer = 0;
            this._applySpriteTexture(npc.sprite, npc.stateKey);
        });
    }

    // Try to insert at current gap (must be near and all distracted)
    insertPlayerInQueue(queueIndex = null) {
        if (!this.player.group) return false;
        if (this.gameState.queueGapIndex === null) return false;
        if (!this._isNearQueueGap()) return false;

        if (!this._canPlayerInsert()) {
            this._playerCaught();
            return false;
        }

        const insertIndex = this.gameState.queueGapIndex;
        this._insertPlayerAtQueueIndex(insertIndex);
        return true;
    }

    // Attempt to move the player forward in the queue to a specific index (only if all distracted)
    movePlayerToQueueIndex(newIndex) {
        if (!this.gameState.playerInQueue) return false;
        if (!this._canPlayerInsert()) {
            this._playerCaught();
            return false;
        }

        if (newIndex < 0) newIndex = 0;

        // Clamp to current queue length
        const maxIndex = Math.max(0, this.npcs.length);
        if (newIndex > maxIndex) newIndex = maxIndex;

        // Reorder NPCs indices to make room
        this.npcs.forEach((npc) => {
            if (npc.queueIndex >= newIndex) {
                npc.queueIndex += 1;
                npc.queueMove.start.copy(npc.group.position);
                npc.queueMove.target.copy(this._getQueuePosition(npc.queueIndex));
                npc.queueMove.elapsed = 0;
                npc.queueMove.duration = this.queueConfig.moveDuration;
                npc.queueMove.active = true;
            }
        });

        this.player.queueIndex = newIndex;
        const pos = this._getQueuePosition(newIndex);
        this.player.group.position.copy(pos);

        return true;
    }

    destroy() {
        if (this.parentElement.contains(this.domElement)) {
            this.parentElement.removeChild(this.domElement);
        }

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

        this.renderer.dispose();
    }

    // -------------------------
    // Loaders & Scene setup
    // -------------------------
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
                const model = gltf.scene;
                this._prepareCharacterModel(model);

                const group = new THREE.Group();
                group.add(model);
                group.position.set(0, 0, 0);
                this.scene.add(group);

                this.player.group = group;
                this.player.headBone = this._findHeadBone(gltf.scene);
                this.player.sprite = null;

                if (gltf.animations?.length) {
                    this.player.mixer = new THREE.AnimationMixer(gltf.scene);
                    this.player.actions = this._buildPlayerActions(gltf.animations);
                    this._setPlayerAction('idle');
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

    _prepareCharacterModel(root, targetHeight = CHARACTER_TARGET_HEIGHT) {
        if (!root) return;
        const bounds = new THREE.Box3().setFromObject(root);
        if (bounds.isEmpty()) return;
        const size = new THREE.Vector3();
        bounds.getSize(size);
        if (size.y <= 0.0001) return;

        const uniformScale = targetHeight / size.y;
        root.scale.setScalar(uniformScale);
        root.updateMatrixWorld(true);

        const scaledBounds = new THREE.Box3().setFromObject(root);
        if (!scaledBounds.isEmpty()) {
            const offsetY = scaledBounds.min.y;
            root.position.y -= offsetY;
            root.updateMatrixWorld(true);
        }
    }

    _getCameraOffset() {
        return new THREE.Vector3(
            Math.sin(this.cameraYaw) * this.cameraRadius,
            this.cameraHeight,
            Math.cos(this.cameraYaw) * this.cameraRadius
        );
    }

    // -------------------------
    // Queue & NPC helpers
    // -------------------------
    _getQueuePosition(index) {
        const { root, direction, spacing } = this.queueConfig;
        return root.clone().add(direction.clone().multiplyScalar(index * spacing));
    }

    _assignNpcToQueue(npc, index) {
        npc.queueIndex = index;
        const position = this._getQueuePosition(index);
        npc.group.position.copy(position);
        npc.queueMove = {
            start: position.clone(),
            target: position.clone(),
            elapsed: 0,
            duration: this.queueConfig.moveDuration,
            active: false
        };
    }

    _spawnNpcs() {
        // spawn initial NPCs using NPC_POOL
        NPC_POSITIONS.forEach((_, index) => {
            const modelPath = NPC_POOL[index % NPC_POOL.length];
            const state = getRandomNpcState();
            this._loadNpc(modelPath, state);
        });
    }

    _loadNpc(modelPath, stateKey) {
        this.loader.load(
            modelPath,
            (gltf) => {
                const model = gltf.scene;
                this._prepareCharacterModel(model);

                const npcGroup = new THREE.Group();
                npcGroup.add(model);
                this.scene.add(npcGroup);

                const headBone = this._findHeadBone(gltf.scene);
                const sprite = this._createStateSprite(stateKey, 0.55);
                this.scene.add(sprite);

                const npcData = {
                    group: npcGroup,
                    headBone,
                    sprite,
                    stateKey,
                    mixer: null,
                    actions: {},
                    role: 'queue',
                    queueIndex: this.npcs.length,
                    queueMove: {
                        start: new THREE.Vector3(),
                        target: new THREE.Vector3(),
                        elapsed: 0,
                        duration: this.queueConfig.moveDuration,
                        active: false
                    },
                    distractionTimer: Math.random() * 8 // staggered distraction cycles
                };

                if (gltf.animations?.length) {
                    npcData.mixer = new THREE.AnimationMixer(gltf.scene);

                    // Try to get walk and idle clips
                    const walkClip = this._findWalkClip(gltf.animations);
                    const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') ?? gltf.animations.find(c => (c.name||'').toLowerCase().includes('idle'));
                    if (walkClip) {
                        npcData.actions.walk = npcData.mixer.clipAction(walkClip);
                        npcData.actions.walk.setEffectiveTimeScale(1);
                    }
                    if (idleClip) {
                        npcData.actions.idle = npcData.mixer.clipAction(idleClip);
                    }

                    // If none found, create fallback using first clip as "walk"
                    if (!npcData.actions.walk && gltf.animations[0]) {
                        npcData.actions.walk = npcData.mixer.clipAction(gltf.animations[0]);
                    }

                    // Ensure actions start in paused state
                    Object.values(npcData.actions).forEach(a => a && a.play && (a.paused = true));
                }

                this._assignNpcToQueue(npcData, npcData.queueIndex);
                this.npcs.push(npcData);
                this._applySpriteTexture(sprite, stateKey);
            },
            undefined,
            (error) => {
                console.error(`Error cargando NPC ${modelPath}:`, error);
            }
        );
    }

    // -------------------------
    // Player update (camera-relative movement)
    // -------------------------
    _updatePlayer(deltaSeconds) {
        if (!this.player.group) return;

        if (this.player.mixer) this.player.mixer.update(deltaSeconds);

        const hasMoveInput =
            Math.abs(this.player.input.forward) > 0.01 || Math.abs(this.player.input.strafe) > 0.01;

        if (this.player.input.jump && this.player.onGround) {
            this.player.verticalVelocity = this.player.jumpSpeed;
            this.player.onGround = false;
        }
        this.player.input.jump = false;

        // Camera-relative directions
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        if (cameraDirection.lengthSq() > 0.000001) cameraDirection.normalize();

        // right = up x forward (gives right-hand)
        const cameraRight = new THREE.Vector3().crossVectors(WORLD_UP, cameraDirection).normalize();

        // Reset velocity then apply inputs
        this.player.velocity.set(0, 0, 0);
        this.player.velocity.addScaledVector(cameraDirection, this.player.input.forward);
        this.player.velocity.addScaledVector(cameraRight, this.player.input.strafe);

        if (this.player.velocity.lengthSq() > 0.0001) {
            const speed = this.player.input.run ? this.player.speed.run : this.player.speed.walk;
            this.player.velocity.normalize().multiplyScalar(speed * deltaSeconds);
            this.player.group.position.add(this.player.velocity);

            const targetAngle = Math.atan2(this.player.velocity.x, this.player.velocity.z);
            this.player.group.rotation.y = targetAngle;
        } else {
            this.player.velocity.set(0, 0, 0);
        }

        // vertical physics (jump/gravity)
        if (!this.player.onGround || this.player.verticalVelocity !== 0) {
            this.player.verticalVelocity += this.player.gravity * deltaSeconds;
            this.player.group.position.y += this.player.verticalVelocity * deltaSeconds;

            if (this.player.group.position.y <= this.player.groundHeight) {
                this.player.group.position.y = this.player.groundHeight;
                this.player.verticalVelocity = 0;
                this.player.onGround = true;
            } else if (this.player.verticalVelocity < 0) {
                this.player.onGround = false;
            }
        }

        // set animation based on speed / in-air
        const horizontalSpeedSq = this.player.velocity.lengthSq();
        let desiredAction = 'idle';
        if (!this.player.onGround) {
            desiredAction = 'jump';
        } else if (horizontalSpeedSq > 0.0001) {
            desiredAction = this.player.input.run ? 'run' : 'walk';
        }
        this._setPlayerAction(desiredAction);

        // Si el jugador está en la fila, se mantiene en posición sincronizado con NPCs
        if (this.gameState.playerInQueue && this.player.queueIndex !== null) {
            const desired = this._getQueuePosition(this.player.queueIndex);
            // Solo seguir si no hay movimiento en cola activo
            if (!this.player.queueMove?.active) {
                this.player.group.position.lerp(desired, 1 - Math.exp(-8 * deltaSeconds));
            }
        }

        // Update sprite if any
        this._updateSpritePosition(this.player);
    }

    // -------------------------
    // NPC updates
    // -------------------------
    _updateNpcs(deltaSeconds) {
        this.npcs.forEach((npc) => {
            npc.mixer?.update(deltaSeconds * 0.5);

            // distraction / alert logic
            if (this.gameState.globalDistractActive) {
                // Global window: all NPCs are distracted unless already angry
                if (npc.stateKey !== 'angry') {
                    npc.stateKey = 'distracted';
                    this._applySpriteTexture(npc.sprite, 'distracted');
                }
            } else {
                // Staggered per-NPC cycles when no global window
                npc.distractionTimer = (npc.distractionTimer ?? 0) + deltaSeconds;
                const totalCycle = 16; // full cycle
                const distractedWindow = 6; // seconds distracted
                const pos = npc.distractionTimer % totalCycle;

                if (pos < distractedWindow) {
                    // distracted
                    if (npc.stateKey !== 'angry') {
                        npc.stateKey = 'distracted';
                        this._applySpriteTexture(npc.sprite, 'distracted');
                    }
                } else {
                    // alert
                    if (npc.stateKey !== 'angry' && npc.stateKey !== 'alert') {
                        npc.stateKey = 'alert';
                        this._applySpriteTexture(npc.sprite, 'alert');
                    }
                }
            }

            // handle queue movement lerp
            if (npc.queueMove?.active) {
                npc.queueMove.elapsed += deltaSeconds;
                const t = Math.min(npc.queueMove.elapsed / npc.queueMove.duration, 1);
                npc.group.position.lerpVectors(npc.queueMove.start, npc.queueMove.target, t);
                if (t >= 1) {
                    npc.queueMove.active = false;
                    npc.group.position.copy(npc.queueMove.target);
                }
            }

            // player queueMove handled separately below

            this._updateSpritePosition(npc, 1.1);
        });

        // Update player queue movement so the player moves in sync with NPCs
        if (this.player?.queueMove?.active) {
            const qm = this.player.queueMove;
            qm.elapsed += deltaSeconds;
            const t = Math.min(qm.elapsed / qm.duration, 1);
            this.player.group.position.lerpVectors(qm.start, qm.target, t);
            if (t >= 1) {
                qm.active = false;
                this.player.group.position.copy(qm.target);
            }
        }
    }

    // -------------------------
    // Queue: advance / idle cycle
    // -------------------------
    _updateQueue(deltaSeconds) {
        if (!this.npcs.length) return;

        // Advance timers
        this.queueConfig.timer += deltaSeconds;
        this.queueCycle.timer += deltaSeconds;
        this.gameState.gapChangeTimer += deltaSeconds;

        // update gap periodically
        if (this.gameState.gapChangeTimer >= this.gameState.gapChangeInterval) {
            this.gameState.gapChangeTimer = 0;
            this._createRandomQueueGap();
        }

        // initialize gap if none
        if (this.gameState.queueGapIndex === null && this.npcs.length > 2) {
            this._createRandomQueueGap();
        }

        // decide whether the queue is walking or idle based on cycle
        const cycle = this.queueCycle;
        const cyclePos = cycle.timer % cycle.cycleDuration;
        const isWalking = cyclePos < cycle.walkTime;

        // move NPCs when walking
        if (isWalking) {
            this.npcs.forEach((npc, index) => {
                const target = this._getQueuePosition(index);
                // if NPC is not currently in a move animation, nudge it toward target
                if (!npc.queueMove.active) {
                    npc.group.position.lerp(target, 0.05);
                    // play walk animation if present
                    if (npc.actions?.walk) {
                        npc.actions.walk.paused = false;
                        npc.actions.walk.play && npc.actions.walk.play();
                    }
                    if (npc.actions?.idle && npc.actions.idle.play) {
                        npc.actions.idle.paused = true;
                        npc.actions.idle.stop && npc.actions.idle.stop();
                    }
                }
                // ensure queueIndex consistent
                npc.queueIndex = index;
            });

            // If player is in queue, move them with same behavior
            if (this.gameState.playerInQueue && this.player.group) {
                const pIndex = Math.max(0, this.player.queueIndex ?? 0);
                const pTarget = this._getQueuePosition(pIndex);
                if (!this.player.queueMove?.active) {
                    this.player.group.position.lerp(pTarget, 0.05);
                }
                // face the queue direction
                const dir = this.queueConfig.direction.clone();
                const angle = Math.atan2(dir.x, dir.z);
                this.player.group.rotation.y = angle;

                // set player animation to walk if available
                if (this.player.mixer && this.player.actions) {
                    this._setPlayerAction('walk');
                }
            }
        } else {
            // idle: freeze positions and switch to idle anim if any
            this.npcs.forEach((npc) => {
                if (npc.actions?.idle) {
                    npc.actions.idle.paused = false;
                    npc.actions.idle.play && npc.actions.idle.play();
                }
                if (npc.actions?.walk) {
                    npc.actions.walk.paused = true;
                    npc.actions.walk.stop && npc.actions.walk.stop();
                }
            });

            // If player is in queue and npcs idle, keep player idle
            if (this.gameState.playerInQueue && this.player.group) {
                if (this.player.mixer && this.player.actions) {
                    this._setPlayerAction('idle');
                }
            }
        }

        // reset cycle timer if needed
        if (this.queueCycle.timer >= this.queueCycle.cycleDuration) {
            this.queueCycle.timer = 0;
        }
    }

    _advanceQueue() {
        if (this.npcs.length <= 1) return;

        const removed = this.npcs.shift();
        // removed stays at front (could be removed from scene as desired)

        // reassign queue indexes and set move targets
        this.npcs.forEach((npc, index) => {
            npc.queueIndex = index;
            npc.queueMove.start.copy(npc.group.position);
            npc.queueMove.target.copy(this._getQueuePosition(index));
            npc.queueMove.elapsed = 0;
            npc.queueMove.duration = this.queueConfig.moveDuration;
            npc.queueMove.active = true;
        });

        // If player is in queue, shift their index down (they move forward)
        if (this.gameState.playerInQueue && this.player.queueIndex != null) {
            if (this.player.queueIndex > 0) {
                this.player.queueIndex -= 1;
            } else {
                // already at front; keep at 0
                this.player.queueIndex = 0;
            }

            // setup player move to the new position
            if (!this.player.queueMove) {
                this.player.queueMove = {
                    start: new THREE.Vector3(),
                    target: new THREE.Vector3(),
                    elapsed: 0,
                    duration: this.queueConfig.moveDuration,
                    active: false
                };
            }
            this.player.queueMove.start.copy(this.player.group.position);
            this.player.queueMove.target.copy(this._getQueuePosition(this.player.queueIndex));
            this.player.queueMove.elapsed = 0;
            this.player.queueMove.duration = this.queueConfig.moveDuration;
            this.player.queueMove.active = true;
        }
    }

    _createRandomQueueGap() {
        if (this.npcs.length <= 2) {
            this.gameState.queueGapIndex = null;
            return;
        }
        const minGapIndex = 1;
        const maxGapIndex = Math.min(this.npcs.length - 1, 4);
        this.gameState.queueGapIndex = Math.floor(Math.random() * (maxGapIndex - minGapIndex + 1)) + minGapIndex;
    }

    _updateQueueCutting(deltaSeconds) {
        // NPCs do not cut the queue. This update step monitors whether the
        // player is near a gap and could be seen by alert NPCs; if so, mark
        // the player as caught. Insertion itself is triggered by the UI.
        if (!this.player.group) return;

        if (this.gameState.playerInQueue || this.gameState.queueGapIndex === null) return;

        if (this._isNearQueueGap()) {
            if (this._isCaughtByAlertNpc()) {
                this._playerCaught();
            }
        }
    }

    _updateGlobalDistract(deltaSeconds) {
        const gs = this.gameState;
        if (!this.npcs.length) return;

        gs.globalDistractTimer += deltaSeconds;

        if (gs.globalDistractActive) {
            // currently active, check duration
            if (gs.globalDistractTimer >= gs.globalDistractDuration) {
                gs.globalDistractTimer = 0;
                gs.globalDistractActive = false;
                // After the global window ends, reset individual timers so NPCs resume staggered cycles
                this.npcs.forEach(npc => npc.distractionTimer = Math.random() * (gs.globalDistractInterval || 12));
            }
        } else {
            // not active, check if it's time to start the window
            if (gs.globalDistractTimer >= gs.globalDistractInterval) {
                gs.globalDistractTimer = 0;
                gs.globalDistractActive = true;
                // set all NPCs distracted for the window
                setAllNpcsDistracted(this.npcs);
                this.npcs.forEach(npc => this._applySpriteTexture(npc.sprite, 'distracted'));
            }
        }
    }

    // -------------------------
    // Queue cutting / insertion helpers
    // -------------------------
    _isNearQueueGap() {
        if (this.gameState.queueGapIndex === null || !this.player.group) return false;
        const gapPos = this._getQueuePosition(this.gameState.queueGapIndex);
        const playerPos = this.player.group.position;
        const distance = gapPos.distanceTo(playerPos);
        return distance < this.gameState.detectionRange;
    }

    _canPlayerInsert() {
        // All NPCs must be distracted (not alert/angry)
        return this.npcs.every(npc => npc.stateKey === 'distracted');
    }

    _playerCaught() {
        this.gameState.playerCaught = true;
        // make all NPCs angry
        setAllNpcsAngry(this.npcs);
        this.npcs.forEach((npc) => {
            npc.stateKey = 'angry';
            this._applySpriteTexture(npc.sprite, 'angry');
        });
        //Activa los abucheos
        if (this.booSound && !this.booSound.isPlaying) {
        this.booSound.play();
        }
    }

    _insertPlayerAtQueueIndex(index) {

        // 1. Ordenar NPCs por su queueIndex real
        const orderedNPCs = [...this.npcs].sort((a, b) => a.queueIndex - b.queueIndex);

        // 2. Desplazar solo los NPC que están detrás del hueco
        orderedNPCs.forEach(npc => {
            if (npc.queueIndex >= index) {
                npc.queueIndex++;
                npc.queueMove.start.copy(npc.group.position);
                npc.queueMove.target.copy(this._getQueuePosition(npc.queueIndex));
                npc.queueMove.elapsed = 0;
                npc.queueMove.duration = this.queueConfig.moveDuration;
                npc.queueMove.active = true;
            }
        });

        // 3. Colocar al jugador en el hueco
        const pos = this._getQueuePosition(index);
        this.player.queueIndex = index;

        if (!this.player.queueMove) {
            this.player.queueMove = {
                start: new THREE.Vector3(),
                target: new THREE.Vector3(),
                elapsed: 0,
                duration: this.queueConfig.moveDuration,
                active: false
            };
        }

        this.player.queueMove.start.copy(this.player.group.position);
        this.player.queueMove.target.copy(pos);
        this.player.queueMove.elapsed = 0;
        this.player.queueMove.duration = this.queueConfig.moveDuration;
        this.player.queueMove.active = true;

        // Animación correcta
        this._setPlayerAction('walk');

        // Cara hacia la fila
        const dir = this.queueConfig.direction.clone();
        this.player.group.rotation.y = Math.atan2(dir.x, dir.z);

        this.gameState.playerInQueue = true;
        this.gameState.queueGapIndex = null;
    }

    _isCaughtByAlertNpc() {
        if (!this.player.group) return false;
        const playerPos = this.player.group.position;
        return this.npcs.some((npc) => {
            if (npc.stateKey === 'alert') {
                const distToPlayer = npc.group.position.distanceTo(playerPos);
                return distToPlayer < 4;
            }
            return false;
        });
    }

    // Player exits the queue: remove queue flags and move player aside
    exitPlayerFromQueue() {
        if (!this.gameState.playerInQueue) return false;
        if (!this.player.group) return false;

        const prevIndex = this.player.queueIndex;
        if (prevIndex === null || prevIndex === undefined) return false;

        // 1. Mover jugador hacia la derecha de la fila (fuera de ella)
        const right = new THREE.Vector3()
            .crossVectors(WORLD_UP, this.queueConfig.direction)
            .normalize();

        const sidePos = this.player.group.position.clone()
            .add(right.multiplyScalar(this.queueConfig.spacing * 2));

        this.player.group.position.copy(sidePos);
        this.player.queueIndex = null;
        
        // Detener movimiento en la fila
        if (this.player.queueMove) {
            this.player.queueMove.active = false;
        }

        // Restaurar controles de movimiento libre
        this._setPlayerAction('idle');
        this.gameState.playerInQueue = false;
        this.player.input = { forward: 0, strafe: 0, run: false, jump: false };

        // 2. Empujar NPCs hacia adelante para abrir el hueco en donde estaba el jugador
        const orderedNPCs = [...this.npcs].sort((a, b) => a.queueIndex - b.queueIndex);

        orderedNPCs.forEach(npc => {
            if (npc.queueIndex > prevIndex) {
                npc.queueIndex--;
                npc.queueMove.start.copy(npc.group.position);
                npc.queueMove.target.copy(this._getQueuePosition(npc.queueIndex));
                npc.queueMove.elapsed = 0;
                npc.queueMove.duration = this.queueConfig.moveDuration;
                npc.queueMove.active = true;
            }
        });

        // 3. Crear gap en el lugar donde salió el jugador
        this.gameState.queueGapIndex = prevIndex;

        return true;
    }


    // -------------------------
    // Actions & animations helpers
    // -------------------------
    _buildPlayerActions(animations = []) {
        if (!this.player.mixer) return {};

        const actionMap = {
            idle: ['Idle', 'CharacterArmature|Idle', 'idle'],
            walk: ['Walk', 'CharacterArmature|Walk', 'walk'],
            run: ['Run', 'CharacterArmature|Run', 'run'],
            jump: ['Jump', 'CharacterArmature|Jump', 'jump']
        };

        const actions = {};
        Object.entries(actionMap).forEach(([key, candidates]) => {
            const clip = this._findClipByNames(animations, candidates);
            if (!clip) return;
            const action = this.player.mixer.clipAction(clip);
            if (key === 'jump') {
                action.setLoop(THREE.LoopOnce, 0);
                action.clampWhenFinished = true;
            }
            actions[key] = action;
        });

        // fallback
        if (!actions.walk && animations[0]) actions.walk = this.player.mixer.clipAction(animations[0]);
        if (!actions.idle && actions.walk) actions.idle = actions.walk;
        if (!actions.run && actions.walk) actions.run = actions.walk;
        if (!actions.jump && actions.run) actions.jump = actions.run;

        // pause all initially
        Object.values(actions).forEach(a => a && (a.paused = false) && a.play && a.play());
        // then immediately fade to idle
        return actions;
    }

    _setPlayerAction(name) {
        if (!this.player.mixer) return;

        const nextAction =
            this.player.actions[name] ??
            this.player.actions.walk ??
            this.player.actions.idle ??
            null;

        if (!nextAction || this.player.activeAction === nextAction) return;

        nextAction.reset().fadeIn(0.15).play();
        if (this.player.activeAction && this.player.activeAction !== nextAction) {
            this.player.activeAction.fadeOut(0.15);
        }
        this.player.activeAction = nextAction;
    }

    _findClipByNames(animations = [], names = []) {
        for (const name of names) {
            const lowered = name.toLowerCase();
            let clip = THREE.AnimationClip.findByName(animations, name);
            if (clip) return clip;
            clip = animations.find((candidate) => {
                const candidateName = candidate.name?.toLowerCase() ?? '';
                return candidateName === lowered || candidateName.includes(lowered);
            });
            if (clip) return clip;
        }
        return animations.length ? animations[0] : null;
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

    // -------------------------
    // Sprites helpers
    // -------------------------
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
        if (!sprite) return;
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

    _updateSpritePosition(character, offset = 1.2) {
        if (!character?.headBone || !character.sprite) return;
        character.headBone.getWorldPosition(this.tempVector);
        this.tempVector.y += offset;
        character.sprite.position.copy(this.tempVector);
    }

    // -------------------------
    // Camera update
    // -------------------------
    _updateCamera(deltaSeconds) {
        if (!this.player.group) return;

        const cameraOffset = this._getCameraOffset();
        const desiredPosition = this.player.group.position.clone().add(cameraOffset);
        // smooth lerp
        this.camera.position.lerp(desiredPosition, 1 - Math.exp(-6 * deltaSeconds));

        this.cameraTarget.copy(this.player.group.position);
        this.cameraTarget.y += 1.6;
        this.camera.lookAt(this.cameraTarget);
    }
}
