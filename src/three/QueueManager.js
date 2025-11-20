import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class QueueManager {
    constructor(npcManager, soundManager) {
        this.npcManager = npcManager;
        this.soundManager = soundManager;
        this.queueConfig = npcManager.queueConfig;
        this.gameState = npcManager.gameState;
        this.queueCycle = npcManager.queueCycle;
    }

    updateQueue(deltaSeconds) {
        if (!this.npcManager.npcs.length) return;

        this.queueConfig.timer += deltaSeconds;
        this.queueCycle.timer += deltaSeconds;
        this.gameState.gapChangeTimer += deltaSeconds;

        // update gap periodically
        if (this.gameState.gapChangeTimer >= this.gameState.gapChangeInterval) {
            this.gameState.gapChangeTimer = 0;
            this._createRandomQueueGap();
        }

        // initialize gap if none
        if (this.gameState.queueGapIndex === null && this.npcManager.npcs.length > 2) {
            this._createRandomQueueGap();
        }

        // decide whether the queue is walking or idle based on cycle
        const cycle = this.queueCycle;
        const cyclePos = cycle.timer % cycle.cycleDuration;
        const isWalking = cyclePos < cycle.walkTime;

        // move NPCs when walking
        if (isWalking) {
            this.npcManager.npcs.forEach((npc, index) => {
                const target = this.npcManager._getQueuePosition(index);
                if (!npc.queueMove.active) {
                    npc.group.position.lerp(target, 0.05);
                    if (npc.actions?.walk) {
                        npc.actions.walk.paused = false;
                        npc.actions.walk.play && npc.actions.walk.play();
                    }
                    if (npc.actions?.idle && npc.actions.idle.play) {
                        npc.actions.idle.paused = true;
                        npc.actions.idle.stop && npc.actions.idle.stop();
                    }
                }
                npc.queueIndex = index;
            });
        } else {
            // idle: freeze positions and switch to idle anim if any
            this.npcManager.npcs.forEach((npc) => {
                if (npc.actions?.idle) {
                    npc.actions.idle.paused = false;
                    npc.actions.idle.play && npc.actions.idle.play();
                }
                if (npc.actions?.walk) {
                    npc.actions.walk.paused = true;
                    npc.actions.walk.stop && npc.actions.walk.stop();
                }
            });
        }

        // reset cycle timer if needed
        if (this.queueCycle.timer >= this.queueCycle.cycleDuration) {
            this.queueCycle.timer = 0;
        }
    }

    isWalking() {
        const cycle = this.queueCycle;
        const cyclePos = cycle.timer % cycle.cycleDuration;
        return cyclePos < cycle.walkTime;
    }

    updateQueueCutting(deltaSeconds, playerPos) {
        if (this.gameState.playerInQueue || this.gameState.queueGapIndex === null) return;

        if (this._isNearQueueGap(playerPos)) {
            if (this.npcManager.isCaughtByAlertNpc(playerPos)) {
                this.npcManager.playerCaught(this.soundManager);
            }
        }
    }

    _isNearQueueGap(playerPos) {
        if (this.gameState.queueGapIndex === null) return false;
        const gapPos = this.npcManager._getQueuePosition(this.gameState.queueGapIndex);
        const distance = gapPos.distanceTo(playerPos);
        return distance < this.gameState.detectionRange;
    }

    isNearQueueGap(playerPos) {
        return this._isNearQueueGap(playerPos);
    }

    _createRandomQueueGap() {
        if (this.npcManager.npcs.length <= 2) {
            this.gameState.queueGapIndex = null;
            return;
        }
        const minGapIndex = 1;
        const maxGapIndex = Math.min(this.npcManager.npcs.length - 1, 4);
        this.gameState.queueGapIndex = Math.floor(Math.random() * (maxGapIndex - minGapIndex + 1)) + minGapIndex;
    }

    insertPlayerInQueue(playerGroup, queueIndex = null) {
        if (!playerGroup) return false;
        if (this.gameState.queueGapIndex === null) return false;
        if (!this._isNearQueueGap(playerGroup.position)) return false;

        if (!this.npcManager.canPlayerInsert()) {
            this.npcManager.playerCaught(this.soundManager);
            return false;
        }

        const insertIndex = this.gameState.queueGapIndex;
        this._insertPlayerAtQueueIndex(playerGroup, insertIndex);
        return true;
    }

    _insertPlayerAtQueueIndex(playerGroup, index) {
        // 1. Ordenar NPCs por su queueIndex real
        const orderedNPCs = [...this.npcManager.npcs].sort((a, b) => a.queueIndex - b.queueIndex);

        // 2. Desplazar solo los NPC que están detrás del hueco
        orderedNPCs.forEach(npc => {
            if (npc.queueIndex >= index) {
                npc.queueIndex++;
                npc.queueMove.start.copy(npc.group.position);
                npc.queueMove.target.copy(this.npcManager._getQueuePosition(npc.queueIndex));
                npc.queueMove.elapsed = 0;
                npc.queueMove.duration = this.queueConfig.moveDuration;
                npc.queueMove.active = true;
            }
        });

        // After changing queueIndex values, reorder the npc list so array order matches queue positions
        orderedNPCs.sort((a, b) => a.queueIndex - b.queueIndex);
        this.npcManager.npcs.length = 0;
        orderedNPCs.forEach(n => this.npcManager.npcs.push(n));

        // 3. Colocar al jugador en el hueco
        const pos = this.npcManager._getQueuePosition(index);

        // Inicializar queueMove del jugador si no existe
        if (!playerGroup.queueMove) {
            playerGroup.queueMove = {
                start: new THREE.Vector3(),
                target: new THREE.Vector3(),
                elapsed: 0,
                duration: this.queueConfig.moveDuration,
                active: false
            };
        }

        playerGroup.queueIndex = index;
        playerGroup.queueMove.start.copy(playerGroup.position);
        playerGroup.queueMove.target.copy(pos);
        playerGroup.queueMove.elapsed = 0;
        playerGroup.queueMove.duration = this.queueConfig.moveDuration;
        playerGroup.queueMove.active = true;

        // Cara hacia la fila
        const dir = this.queueConfig.direction.clone();
        playerGroup.rotation.y = Math.atan2(dir.x, dir.z);

        this.gameState.playerInQueue = true;
        console.log(`¡Jugador se incorporó a la fila en posición ${index}!`);
        this.gameState.queueGapIndex = null;
        
        return true;
    }

    exitPlayerFromQueue(playerGroup) {
        if (!this.gameState.playerInQueue) return false;
        if (!playerGroup) return false;

        const prevIndex = playerGroup.queueIndex;
        if (prevIndex === null || prevIndex === undefined) return false;

        // 1. Mover jugador hacia la derecha de la fila (fuera de ella)
        const right = new THREE.Vector3()
            .crossVectors(WORLD_UP, this.queueConfig.direction)
            .normalize();

        const sidePos = playerGroup.position.clone()
            .add(right.multiplyScalar(this.queueConfig.spacing * 2));

        playerGroup.position.copy(sidePos);
        playerGroup.queueIndex = null;
        
        // Detener movimiento en la fila
        if (playerGroup.queueMove) {
            playerGroup.queueMove.active = false;
        }

        this.gameState.playerInQueue = false;

        // 2. Empujar NPCs hacia adelante para abrir el hueco en donde estaba el jugador
        const orderedNPCs = [...this.npcManager.npcs].sort((a, b) => a.queueIndex - b.queueIndex);

        orderedNPCs.forEach(npc => {
            if (npc.queueIndex > prevIndex) {
                npc.queueIndex--;
                npc.queueMove.start.copy(npc.group.position);
                npc.queueMove.target.copy(this.npcManager._getQueuePosition(npc.queueIndex));
                npc.queueMove.elapsed = 0;
                npc.queueMove.duration = this.queueConfig.moveDuration;
                npc.queueMove.active = true;
            }
        });

        // Reorder NPC array so their array order matches queue positions
        orderedNPCs.sort((a, b) => a.queueIndex - b.queueIndex);
        this.npcManager.npcs.length = 0;
        orderedNPCs.forEach(n => this.npcManager.npcs.push(n));

        // 3. Crear gap en el lugar donde salió el jugador
        this.gameState.queueGapIndex = prevIndex;

        return true;
    }

    movePlayerToQueueIndex(playerGroup, newIndex) {
        if (!this.gameState.playerInQueue) return false;
        if (!this.npcManager.canPlayerInsert()) {
            this.npcManager.playerCaught(this.soundManager);
            return false;
        }

        if (newIndex < 0) newIndex = 0;

        const maxIndex = Math.max(0, this.npcManager.npcs.length);
        if (newIndex > maxIndex) newIndex = maxIndex;

        this.npcManager.npcs.forEach((npc) => {
            if (npc.queueIndex >= newIndex) {
                npc.queueIndex += 1;
                npc.queueMove.start.copy(npc.group.position);
                npc.queueMove.target.copy(this.npcManager._getQueuePosition(npc.queueIndex));
                npc.queueMove.elapsed = 0;
                npc.queueMove.duration = this.queueConfig.moveDuration;
                npc.queueMove.active = true;
            }
        });

        // After updating queueIndex values, reorder npc array to reflect positions
        const reordered = [...this.npcManager.npcs].sort((a, b) => a.queueIndex - b.queueIndex);
        this.npcManager.npcs.length = 0;
        reordered.forEach(n => this.npcManager.npcs.push(n));

        playerGroup.queueIndex = newIndex;
        const pos = this.npcManager._getQueuePosition(newIndex);
        playerGroup.position.copy(pos);

        return true;
    }

    getQueuePosition(index) {
        return this.npcManager._getQueuePosition(index);
    }
}
