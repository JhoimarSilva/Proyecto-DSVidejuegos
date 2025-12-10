import * as THREE from 'three';
import { gameContext } from '../../../contexts/GameContext.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CHARACTER_TARGET_HEIGHT = 1.8;

export class PlayerManager {
    constructor(scene, loader, physicsManager, worldManager) {
        this.scene = scene;
        this.loader = loader;
        this.physicsManager = physicsManager;
        this.worldManager = worldManager;
        this.raycaster = new THREE.Raycaster();
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
            queueIndex: null,
            queueMove: null,
            inQueue: false,
            collisionRadius: 0.35
        };
        this.tempVector = new THREE.Vector3();
        this.rayDirection = new THREE.Vector3(0, -1, 0);
    }

    loadPlayer() {
        // Obtener el personaje seleccionado del GameContext
        const selectedCharacter = gameContext.getSelectedCharacter();
        const PLAYER_MODEL = selectedCharacter || '/models/man1.glb';

        console.log('Cargando personaje del jugador:', PLAYER_MODEL);

        this.loader.load(
            PLAYER_MODEL,
            (gltf) => {
                const model = gltf.scene;
                this._prepareCharacterModel(model);

                const group = new THREE.Group();
                group.add(model);

                // Choose spawn position based on world bounds if available
                let spawnPos = new THREE.Vector3(0, 5, 0);
                try {
                    if (this.worldManager && this.worldManager.getEnvironmentBounds) {
                        const envBounds = this.worldManager.getEnvironmentBounds();
                        if (envBounds && !envBounds.isEmpty()) {
                            const center = new THREE.Vector3();
                            envBounds.getCenter(center);
                            spawnPos.copy(center);
                            spawnPos.y = (envBounds.min.y ?? 0) + 1.6; // slightly above ground (raised)
                        }
                    }
                } catch (e) {
                    console.warn('Could not determine spawn position from worldManager:', e.message);
                }

                group.position.copy(spawnPos);
                this.scene.add(group);

                // If world meshes are available, raycast down from above spawn to find ground
                try {
                    if (this.worldManager && Array.isArray(this.worldManager.worldMeshes) && this.worldManager.worldMeshes.length > 0) {
                        const rc = new THREE.Raycaster();
                        const testOrigin = spawnPos.clone();
                        testOrigin.y += 5.0; // start well above
                        rc.set(testOrigin, new THREE.Vector3(0, -1, 0));
                        const hits = rc.intersectObjects(this.worldManager.worldMeshes, true);
                        if (hits.length > 0) {
                            const groundY = hits[0].point.y;
                            const desiredY = groundY + 1.6; // keep player above ground
                            group.position.y = desiredY;
                            console.log('Adjusted player spawn to above ground:', desiredY, 'groundY:', groundY);
                        } else if (this.worldManager && this.worldManager.groundMesh) {
                            // fallback to simple ground mesh
                            const g = this.worldManager.groundMesh.position.y;
                            group.position.y = Math.max(group.position.y, g + 1.6);
                            console.log('Adjusted player spawn to simple ground:', group.position.y);
                        }
                    }
                } catch (e) {
                    console.warn('Error adjusting player spawn to ground:', e.message);
                }

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

    setPlayerInput({ forward = 0, strafe = 0, run = false, jump = false } = {}) {
        // Ignore player inputs while in queue
        if (this.player.inQueue) return;

        this.player.input.forward = THREE.MathUtils.clamp(forward, -1, 1);
        this.player.input.strafe = THREE.MathUtils.clamp(strafe, -1, 1);
        this.player.input.run = Boolean(run);
        this.player.input.jump = this.player.input.jump || Boolean(jump);
    }

    setInQueue(flag = false) {
        this.player.inQueue = Boolean(flag);
        if (this.player.inQueue) {
            // stop movement inputs when entering queue
            this.player.input = { forward: 0, strafe: 0, run: false, jump: false };
            // freeze velocity
            this.player.velocity.set(0, 0, 0);
        }
    }

    setAction(name) {
        // public wrapper to change player animation
        this._setPlayerAction(name);
    }

    updatePlayer(deltaSeconds, cameraDirection, cameraRight) {
        if (!this.player.group) return;

        if (this.player.mixer) this.player.mixer.update(deltaSeconds);

        // Detect ground using raycasting
        this._updateGroundDetection();

        const hasMoveInput =
            Math.abs(this.player.input.forward) > 0.01 || Math.abs(this.player.input.strafe) > 0.01;

        if (this.player.input.jump && this.player.onGround) {
            this.player.verticalVelocity = this.player.jumpSpeed;
            this.player.onGround = false;
        }
        this.player.input.jump = false;

        // Reset velocity then apply inputs
        this.player.velocity.set(0, 0, 0);
        this.player.velocity.addScaledVector(cameraDirection, this.player.input.forward);
        this.player.velocity.addScaledVector(cameraRight, this.player.input.strafe);

        // Check for wall collisions before moving
        if (this.player.velocity.lengthSq() > 0.0001) {
            const speed = this.player.input.run ? this.player.speed.run : this.player.speed.walk;
            this.player.velocity.normalize().multiplyScalar(speed * deltaSeconds);
            
            // Check collision ahead
            const nextPos = this.player.group.position.clone().add(this.player.velocity);
            if (!this._checkWallCollision(nextPos)) {
                this.player.group.position.add(this.player.velocity);
                const targetAngle = Math.atan2(this.player.velocity.x, this.player.velocity.z);
                this.player.group.rotation.y = targetAngle;
            }
        } else {
            this.player.velocity.set(0, 0, 0);
        }

        // vertical physics (jump/gravity)
        if (!this.player.onGround || this.player.verticalVelocity !== 0) {
            this.player.verticalVelocity += this.player.gravity * deltaSeconds;
            this.player.group.position.y += this.player.verticalVelocity * deltaSeconds;

            // Clamp position to ground
            if (this.player.group.position.y <= this.player.groundHeight) {
                this.player.group.position.y = this.player.groundHeight;
                this.player.verticalVelocity = 0;
                this.player.onGround = true;
            } else if (this.player.verticalVelocity < 0) {
                this.player.onGround = false;
            }
        }

        // set animation based on speed / in-air
        // BUT only if not in queue (queue controls animation)
        if (!this.player.inQueue) {
            const horizontalSpeedSq = this.player.velocity.lengthSq();
            let desiredAction = 'idle';
            if (!this.player.onGround) {
                desiredAction = 'jump';
            } else if (horizontalSpeedSq > 0.0001) {
                desiredAction = this.player.input.run ? 'run' : 'walk';
            }
            this._setPlayerAction(desiredAction);
        }

        this._updateSpritePosition(this.player);
    }

    /**
     * Detects ground height using raycasting
     */
    _updateGroundDetection() {
        if (!this.player.group) return;

        try {
            // Use Three.js raycaster to detect ground
            const rayOrigin = this.player.group.position.clone();
            rayOrigin.y += 0.5; // Start from slightly above player
            
            this.raycaster.set(rayOrigin, this.rayDirection);
            
            // Get all meshes in the world for intersection
            let objectsToTest = [];
            if (this.worldManager && this.worldManager.worldMeshes) {
                objectsToTest = this.worldManager.worldMeshes;
            } else if (this.worldManager && this.worldManager.groundMesh) {
                objectsToTest = [this.worldManager.groundMesh];
            }

            if (objectsToTest.length === 0) {
                // No world meshes, use a default ground at Y=0
                this.player.groundHeight = 0;
                this.player.onGround = this.player.group.position.y <= 0.1;
                return;
            }

            const intersects = this.raycaster.intersectObjects(objectsToTest, true);
            
            if (intersects.length > 0) {
                const hit = intersects[0];
                this.player.groundHeight = hit.point.y;
                
                // Player is on ground if close to surface
                const distanceToGround = this.player.group.position.y - this.player.groundHeight;
                this.player.onGround = distanceToGround < 0.3;
            } else {
                // No ground detected, falling
                this.player.onGround = false;
                this.player.groundHeight = -1000;
            }
        } catch (error) {
            console.warn('Error in ground detection:', error.message);
            // Fallback - assume ground at Y=0
            this.player.groundHeight = 0;
            this.player.onGround = this.player.group.position.y <= 0.1;
        }
    }

    /**
     * Check for wall collision ahead
     * @param {THREE.Vector3} position - Position to check
     * @returns {boolean} True if collision detected
     */
    _checkWallCollision(position) {
        if (!this.worldManager || !this.worldManager.worldMeshes || this.worldManager.worldMeshes.length === 0) {
            return false;
        }

        try {
            // Create a sphere to check for collisions
            const moveDir = position.clone().sub(this.player.group.position);
            
            if (moveDir.length() < 0.001) return false;
            
            moveDir.normalize();
            
            this.raycaster.set(this.player.group.position, moveDir);
            
            const intersects = this.raycaster.intersectObjects(this.worldManager.worldMeshes, true);
            
            // Check if there's a collision close enough
            if (intersects.length > 0) {
                const hit = intersects[0];
                // If hit is very close, it's a wall collision
                if (hit.distance < this.player.collisionRadius * 2) {
                    return true;
                }
            }
        } catch (error) {
            console.warn('Error in wall collision check:', error.message);
        }

        return false;
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

    _findHeadBone(root) {
        let head = null;
        root.traverse((obj) => {
            if (obj.isBone && obj.name.toLowerCase().includes('head')) {
                head = obj;
            }
        });
        return head;
    }

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

        Object.values(actions).forEach(a => a && (a.paused = false) && a.play && a.play());
        return actions;
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

    _setPlayerAction(actionName) {
        if (!this.player.mixer) return;

        const action = this.player.actions[actionName];
        if (!action) return;

        if (this.player.activeAction !== action) {
            // fade out old
            if (this.player.activeAction) {
                this.player.activeAction.fadeOut(0.2);
            }
            // fade in new
            action.reset().fadeIn(0.2).play();
            this.player.activeAction = action;
        }
    }

    _updateSpritePosition(character, offset = 1.2) {
        if (!character?.headBone || !character.sprite) return;
        character.headBone.getWorldPosition(this.tempVector);
        this.tempVector.y += offset;
        character.sprite.position.copy(this.tempVector);
    }

    getPosition() {
        return this.player.group?.position ?? new THREE.Vector3();
    }

    destroy() {
        Object.values(this.player.actions).forEach(action => {
            if (action) action.stop?.();
        });
        this.player.mixer?.stopAllAction();
    }
}
