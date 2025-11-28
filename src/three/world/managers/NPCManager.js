import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEFAULT_NPC_STATE, NPC_STATE_ICONS, getRandomNpcState, setAllNpcsAngry, setAllNpcsDistracted } from '../npcStates.js';

const NPC_POOL = [
    '/models/man1.glb',
    '/models/man2.glb',
    '/models/man3.glb',
    '/models/man4.glb',
    '/models/man5.glb',
    '/models/man6.glb',
    '/models/man8.glb',
    '/models/woman1.glb',
    '/models/woman2.glb',
    '/models/woman3.glb',
    '/models/woman4.glb',
    '/models/woman5.glb',
    '/models/woman6.glb'
];

const NPC_COUNT = 15;

export class NPCManager {
    constructor(scene, loader, textureLoader) {
        this.scene = scene;
        this.loader = loader;
        this.textureLoader = textureLoader;
        this.npcs = [];
        this.queueConfig = {
            root: new THREE.Vector3(-5, 0, -4),
            direction: new THREE.Vector3(0, 0, 1).normalize(),
            spacing: 1.8,
            advanceInterval: 10,
            moveDuration: 1.2,
            timer: 0
        };
        this.gameState = {
            playerCaught: false,
            playerInQueue: false,
            queueGapIndex: null,
            gapChangeInterval: 15,
            gapChangeTimer: 0,
            detectionThreshold: 2.5,
            detectionRange: 3,
            globalDistractInterval: 25,
            globalDistractDuration: 5,
            globalDistractTimer: 0,
            globalDistractActive: false
        };
        this.queueCycle = {
            timer: 0,
            walkTime: 5,
            idleTime: 7,
            cycleDuration: 12
        };
    }

    spawnNpcs() {
        // Crear una lista barajada de modelos para evitar repeticiones consecutivas
        let shuffledModels = [];

        for (let i = 0; i < NPC_COUNT; i++) {
            // Si nos quedamos sin modelos, rellenamos y barajamos de nuevo
            if (shuffledModels.length === 0) {
                shuffledModels = [...NPC_POOL];
                // Algoritmo de Fisher-Yates para barajar
                for (let j = shuffledModels.length - 1; j > 0; j--) {
                    const k = Math.floor(Math.random() * (j + 1));
                    [shuffledModels[j], shuffledModels[k]] = [shuffledModels[k], shuffledModels[j]];
                }
            }

            const modelPath = shuffledModels.pop();
            const state = getRandomNpcState();
            this._loadNpc(modelPath, state);
        }
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
                    distractionTimer: Math.random() * 8
                };

                if (gltf.animations?.length) {
                    npcData.mixer = new THREE.AnimationMixer(gltf.scene);

                    const walkClip = this._findWalkClip(gltf.animations);
                    const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') ?? gltf.animations.find(c => (c.name || '').toLowerCase().includes('idle'));
                    if (walkClip) {
                        npcData.actions.walk = npcData.mixer.clipAction(walkClip);
                        npcData.actions.walk.setEffectiveTimeScale(1);
                    }
                    if (idleClip) {
                        npcData.actions.idle = npcData.mixer.clipAction(idleClip);
                    }

                    if (!npcData.actions.walk && gltf.animations[0]) {
                        npcData.actions.walk = npcData.mixer.clipAction(gltf.animations[0]);
                    }

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

    _prepareCharacterModel(root, targetHeight = 1.8) {
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

    _getQueuePosition(index) {
        const { root, direction, spacing } = this.queueConfig;
        return root.clone().add(direction.clone().multiplyScalar(index * spacing));
    }

    updateNpcs(deltaSeconds) {
        this.npcs.forEach((npc) => {
            npc.mixer?.update(deltaSeconds * 0.5);

            if (this.gameState.globalDistractActive) {
                if (npc.stateKey !== 'angry') {
                    npc.stateKey = 'distracted';
                    this._applySpriteTexture(npc.sprite, 'distracted');
                }
            } else {
                npc.distractionTimer = (npc.distractionTimer ?? 0) + deltaSeconds;
                const totalCycle = 16;
                const distractedWindow = 6;
                const pos = npc.distractionTimer % totalCycle;

                if (pos < distractedWindow) {
                    if (npc.stateKey !== 'angry') {
                        npc.stateKey = 'distracted';
                        this._applySpriteTexture(npc.sprite, 'distracted');
                    }
                } else {
                    if (npc.stateKey !== 'angry' && npc.stateKey !== 'alert') {
                        npc.stateKey = 'alert';
                        this._applySpriteTexture(npc.sprite, 'alert');
                    }
                }
            }

            if (npc.queueMove?.active) {
                npc.queueMove.elapsed += deltaSeconds;
                const t = Math.min(npc.queueMove.elapsed / npc.queueMove.duration, 1);
                npc.group.position.lerpVectors(npc.queueMove.start, npc.queueMove.target, t);
                if (t >= 1) {
                    npc.queueMove.active = false;
                    npc.group.position.copy(npc.queueMove.target);
                }
            }

            this._updateSpritePosition(npc, 1.1);
        });
    }

    updateGlobalDistract(deltaSeconds) {
        const gs = this.gameState;
        if (!this.npcs.length) return;

        gs.globalDistractTimer += deltaSeconds;

        if (gs.globalDistractActive) {
            if (gs.globalDistractTimer >= gs.globalDistractDuration) {
                gs.globalDistractTimer = 0;
                gs.globalDistractActive = false;
                this.npcs.forEach(npc => npc.distractionTimer = Math.random() * (gs.globalDistractInterval || 12));
            }
        } else {
            if (gs.globalDistractTimer >= gs.globalDistractInterval) {
                gs.globalDistractTimer = 0;
                gs.globalDistractActive = true;
                setAllNpcsDistracted(this.npcs);
                this.npcs.forEach(npc => this._applySpriteTexture(npc.sprite, 'distracted'));
            }
        }
    }

    _updateSpritePosition(character, offset = 1.2) {
        const tempVector = new THREE.Vector3();
        if (!character?.headBone || !character.sprite) return;
        character.headBone.getWorldPosition(tempVector);
        tempVector.y += offset;
        character.sprite.position.copy(tempVector);
    }

    isCaughtByAlertNpc(playerPos) {
        return this.npcs.some((npc) => {
            if (npc.stateKey === 'alert') {
                const distToPlayer = npc.group.position.distanceTo(playerPos);
                return distToPlayer < 4;
            }
            return false;
        });
    }

    playerCaught(soundManager = null) {
        this.gameState.playerCaught = true;
        setAllNpcsAngry(this.npcs);
        this.npcs.forEach((npc) => {
            npc.stateKey = 'angry';
            this._applySpriteTexture(npc.sprite, 'angry');
        });
        // Reproducir sonido de abucheo si está disponible
        if (soundManager) {
            soundManager.playBooSound();
        }
    }

    canPlayerInsert() {
        return this.npcs.every(npc => npc.stateKey === 'distracted');
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

    getGameState() {
        return {
            playerCaught: this.gameState.playerCaught,
            playerInQueue: this.gameState.playerInQueue,
            npcsAngry: this.npcs.some((npc) => npc.stateKey === 'angry'),
            nearQueueGap: false,
            queueGapIndex: this.gameState.queueGapIndex,
            queueGapPosition: this.gameState.queueGapIndex !== null ? this._getQueuePosition(this.gameState.queueGapIndex) : null
        };
    }
}
