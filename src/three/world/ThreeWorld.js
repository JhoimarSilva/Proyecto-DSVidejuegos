import * as THREE from 'three';
import { NPCManager } from './managers/NPCManager.js';
import { PlayerManager } from './managers/PlayerManager.js';
import { SoundManager } from './managers/SoundManager.js';
import { QueueManager } from './managers/QueueManager.js';
import { WorldManager } from './WorldManager.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

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

        this.clock = new THREE.Clock();

        // Initialize managers
        this.worldManager = new WorldManager(this.scene, this.renderer);
        this.npcManager = new NPCManager(this.scene, this.worldManager.loader, this.worldManager.textureLoader);
        this.playerManager = new PlayerManager(this.scene, this.worldManager.loader);
        this.soundManager = new SoundManager(this.camera);
        this.queueManager = new QueueManager(this.npcManager, this.soundManager);

        this.worldManager.initialize();
        this.playerManager.loadPlayer();
        this.npcManager.spawnNpcs();
        this.soundManager.loadBooSound();

        this.resize(
            this.parentElement.clientWidth || window.innerWidth,
            this.parentElement.clientHeight || window.innerHeight
        );
    }

    // -------------------------
    // Public API / Inputs
    // -------------------------
    setPlayerInput({ forward = 0, strafe = 0, run = false, jump = false } = {}) {
        this.playerManager.setPlayerInput({ forward, strafe, run, jump });
    }

    update(deltaMs = 0) {
        const deltaSeconds = deltaMs ? deltaMs / 1000 : this.clock.getDelta();

        if (!Number.isFinite(deltaSeconds)) return;

        // Camera-relative directions
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        if (cameraDirection.lengthSq() > 0.000001) cameraDirection.normalize();

        const cameraRight = new THREE.Vector3().crossVectors(WORLD_UP, cameraDirection).normalize();

        // Update systems
        this.playerManager.updatePlayer(deltaSeconds, cameraDirection, cameraRight);
        this.npcManager.updateNpcs(deltaSeconds);
        this.npcManager.updateGlobalDistract(deltaSeconds);
        this.queueManager.updateQueue(deltaSeconds);
        this.queueManager.updateQueueCutting(deltaSeconds, this.playerManager.getPosition());

        // Update player queue movement if active
        this._updatePlayerQueueMovement(deltaSeconds);

        // If player is in queue, sync animation to queue state
        if (this.npcManager.gameState.playerInQueue) {
            if (this.queueManager.isWalking()) {
                this.playerManager.setAction('walk');
            } else {
                this.playerManager.setAction('idle');
            }
        }

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
        // TODO: Implement player state icon if needed
    }

    getGameState() {
        return {
            playerCaught: this.npcManager.gameState.playerCaught,
            playerInQueue: this.npcManager.gameState.playerInQueue,
            npcsAngry: this.npcManager.npcs.some((npc) => npc.stateKey === 'angry'),
            nearQueueGap: this.queueManager.isNearQueueGap(this.playerManager.getPosition()),
            queueGapIndex: this.npcManager.gameState.queueGapIndex,
            queueGapPosition: this.npcManager.gameState.queueGapIndex !== null ? 
                this.queueManager.getQueuePosition(this.npcManager.gameState.queueGapIndex) : null
        };
    }

    resetGameState() {
        this.npcManager.resetGameState();
        this.npcManager.gameState.playerCaught = false;
        this.npcManager.gameState.playerInQueue = false;
    }

    // Queue operations
    insertPlayerInQueue(queueIndex = null) {
        const result = this.queueManager.insertPlayerInQueue(this.playerManager.player.group, queueIndex);
        if (result) {
            // set inQueue flag and sync queueIndex property on player object
            this.playerManager.setInQueue(true);
            this.playerManager.player.queueIndex = this.playerManager.player.group.queueIndex;
        }
        return result;
    }

    movePlayerToQueueIndex(newIndex) {
        return this.queueManager.movePlayerToQueueIndex(this.playerManager.player.group, newIndex);
    }

    exitPlayerFromQueue() {
        const result = this.queueManager.exitPlayerFromQueue(this.playerManager.player.group);
        if (result) {
            this.playerManager.setInQueue(false);
            this.playerManager.player.queueIndex = null;
            this.playerManager.setAction('idle');
        }
        return result;
    }

    destroy() {
        if (this.parentElement.contains(this.domElement)) {
            this.parentElement.removeChild(this.domElement);
        }

        this.worldManager.dispose();
        this.playerManager.destroy();
        this.soundManager.destroy();
        this.renderer.dispose();
    }

    // -------------------------
    // Private helpers
    // -------------------------
    _getCameraOffset() {
        return new THREE.Vector3(
            Math.sin(this.cameraYaw) * this.cameraRadius,
            this.cameraHeight,
            Math.cos(this.cameraYaw) * this.cameraRadius
        );
    }

    _updateCamera(deltaSeconds) {
        if (!this.playerManager.player.group) return;

        const cameraOffset = this._getCameraOffset();
        const desiredPosition = this.playerManager.player.group.position.clone().add(cameraOffset);
        this.camera.position.lerp(desiredPosition, 1 - Math.exp(-6 * deltaSeconds));

        this.cameraTarget.copy(this.playerManager.player.group.position);
        this.cameraTarget.y += 1.6;
        this.camera.lookAt(this.cameraTarget);
    }

    _updatePlayerQueueMovement(deltaSeconds) {
        const player = this.playerManager.player;
        if (!player.group || !player.queueMove) return;

        if (player.queueMove.active) {
            player.queueMove.elapsed += deltaSeconds;
            const t = Math.min(player.queueMove.elapsed / player.queueMove.duration, 1);
            player.group.position.lerpVectors(player.queueMove.start, player.queueMove.target, t);
            if (t >= 1) {
                player.queueMove.active = false;
                player.group.position.copy(player.queueMove.target);
            }
        }
    }
}
