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

        // move NPCs when walking - they advance in the queue direction
        if (isWalking) {
            // Get the queue direction (direction the queue is facing)
            const queueDirection = this.queueConfig.direction.clone();

            this.npcManager.npcs.forEach((npc, index) => {
                if (!npc.queueMove.active) {
                    // Move NPC forward in queue direction with physics
                    const speed = npc.walkSpeed || 1;
                    const movement = queueDirection.clone().multiplyScalar(speed * deltaSeconds);
                    npc.group.position.add(movement);

                    // Update rotation to face queue direction
                    const targetAngle = Math.atan2(queueDirection.x, queueDirection.z);
                    npc.group.rotation.y = targetAngle;

                    // Play walk animation
                    if (npc.actions?.walk) {
                        npc.actions.walk.paused = false;
                        npc.actions.walk.play && npc.actions.walk.play();
                    }
                    if (npc.actions?.idle && npc.actions.idle.play) {
                        npc.actions.idle.paused = true;
                        npc.actions.idle.stop && npc.actions.idle.stop();
                    }
                }
                // DON'T overwrite queueIndex here - it's managed by insertion/exit logic
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

        if (this.isNearQueue(playerPos)) {
            if (this.npcManager.isCaughtByAlertNpc(playerPos)) {
                this.npcManager.playerCaught(this.soundManager);
            }
        }
    }

    getNearestQueueIndex(playerPos) {
        if (!this.npcManager.npcs.length) return 0;

        let closestIndex = 0;
        let minDistance = Infinity;

        // Check distance to actual NPC positions
        this.npcManager.npcs.forEach((npc) => {
            const dist = npc.group.position.distanceTo(playerPos);
            if (dist < minDistance) {
                minDistance = dist;
                closestIndex = npc.queueIndex;
            }
        });

        // Return the position AFTER the closest NPC, so player inserts between NPCs
        return closestIndex + 1;
    }

    isNearQueue(playerPos) {
        if (!this.npcManager.npcs.length) return false;

        // Check distance to the nearest NPC (actual position)
        const nearestIndex = this.getNearestQueueIndex(playerPos);
        const npc = this.npcManager.npcs.find(n => n.queueIndex === nearestIndex);

        // If we found an NPC, use their position. If not (shouldn't happen if length > 0), fallback to static.
        const pos = npc ? npc.group.position : this.npcManager._getQueuePosition(nearestIndex);

        return pos.distanceTo(playerPos) < this.gameState.detectionRange;
    }

    // Deprecated but kept for compatibility if needed, or redirected
    isNearQueueGap(playerPos) {
        return this.isNearQueue(playerPos);
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

        // If no specific index provided, find the nearest one
        if (queueIndex === null) {
            if (!this.isNearQueue(playerGroup.position)) return false;
            queueIndex = this.getNearestQueueIndex(playerGroup.position);
        }

        if (!this.npcManager.canPlayerInsert()) {
            this.npcManager.playerCaught(this.soundManager);
            return false;
        }

        this._insertPlayerAtQueueIndex(playerGroup, queueIndex);
        return true;
    }

    _insertPlayerAtQueueIndex(playerGroup, index) {
        // 1. Ordenar NPCs por su queueIndex real
        const orderedNPCs = [...this.npcManager.npcs].sort((a, b) => a.queueIndex - b.queueIndex);

        console.log('=== INSERTING PLAYER ===');
        console.log('Insertion index:', index);
        console.log('NPCs before insertion:', orderedNPCs.map(n => `NPC${n.queueIndex}`).join(', '));

        // 2. Move NPCs at or after the insertion point forward by a smaller amount
        // Instead of incrementing their queueIndex (which moves them a full spacing),
        // we'll just shift them forward by a partial amount
        const shiftDistance = this.queueConfig.spacing * 0.5; // Move forward by half spacing
        const shiftVector = this.queueConfig.direction.clone().multiplyScalar(shiftDistance);

        orderedNPCs.forEach(npc => {
            if (npc.queueIndex >= index) {
                npc.queueIndex++;
                npc.queueMove.start.copy(npc.group.position);
                // Instead of moving to the calculated position, just shift forward slightly
                npc.queueMove.target.copy(npc.group.position).add(shiftVector);
                npc.queueMove.elapsed = 0;
                npc.queueMove.duration = this.queueConfig.moveDuration;
                npc.queueMove.active = true;
            }
        });

        // After changing queueIndex values, reorder the npc list so array order matches queue positions
        orderedNPCs.sort((a, b) => a.queueIndex - b.queueIndex);
        this.npcManager.npcs.length = 0;
        orderedNPCs.forEach(n => this.npcManager.npcs.push(n));

        console.log('NPCs after insertion:', orderedNPCs.map(n => `NPC${n.queueIndex}`).join(', '));

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
