import Phaser from 'phaser';
import { ThreeWorld } from '../three/world/ThreeWorld.js';
import { gameContext } from '../contexts/GameContext.js';

/**
 * MainGameView - Escena del juego principal donde el jugador explora y se cuela en la fila
 */
export default class MainGameView extends Phaser.Scene {
    constructor() {
        super('MainGameView');
        this.threeWorld = null;
        this.cursors = null;
        this.wasd = null;
        this.runKey = null;
        this.jumpKey = null;
        this.lastPointerX = null;
        this.pointerHandlers = null;
        this.queueGapButton = null;
        this.eKey = null;
        this.ambiente = null;
        this.sonandoAbucheo = false;
    }

    preload() {
        this.load.audio('alerta', '/sounds/ambiente.wav');
        this.load.audio('descubierto', '/sounds/abucheos.wav');
    }

    create() {
        this._configurePhaserCanvas();
        const container = document.getElementById('game-container');
        this.threeWorld = new ThreeWorld(container);

        this._createHud();
        this._createControls();
        this._registerEvents();

        // Crear sonido ambiente (se reproducirá cuando el jugador haga clic)
        this.ambiente = this.sound.add('alerta', {
            volume: 0.3,
            loop: true
        });

        this.sonandoAbucheo = false;

        // Solicitar pointer lock y reanudar audio solo tras gesto del usuario
        this.input.once('pointerdown', async () => {
            try {
                // Request pointer lock
                const maybePromise = this.input.mouse.requestPointerLock();
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.catch((err) => console.warn('Pointer lock request failed (promise):', err));
                }
            } catch (err) {
                console.warn('Pointer lock request failed (sync):', err);
            }

            // Reanudar AudioContext y reproducir sonido ambiente
            try {
                if (this.sound && this.sound.context && this.sound.context.state === 'suspended') {
                    await this.sound.context.resume();
                }
                if (this.ambiente && !this.ambiente.isPlaying) {
                    this.ambiente.play();
                }
            } catch (audioErr) {
                console.warn('AudioContext resume/play failed:', audioErr);
            }
        });
    }

    update(_, delta) {
        this._updatePlayerInput();
        this._updateQueueGapUI();
        this.threeWorld?.update(delta);
    }

    detectarJugador() {
        if (this.sonandoAbucheo) return;
        this.sonandoAbucheo = true;

        this.sound.play('descubierto', {
            volume: 1
        });

        console.log("¡Jugador detectado!");

        this.time.delayedCall(1500, () => {
            this.sonandoAbucheo = false;
        });
    }

    _createHud() {
        const style = {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#ffffff'
        };

        this.add
            .text(16, 48, 'Mover: WASD / Flechas', {
                ...style,
                fontSize: '16px',
                color: '#00000088'
            })
            .setDepth(10)
            .setScrollFactor(0);

        this.add
            .text(16, 70, 'Shift: Correr | Space: Saltar', {
                ...style,
                fontSize: '16px',
                color: '#00000088'
            })
            .setDepth(10)
            .setScrollFactor(0);

        this.add
            .text(16, 92, 'Mueve el mouse para rotar la cámara', {
                ...style,
                fontSize: '16px',
                color: '#00000088'
            })
            .setDepth(10)
            .setScrollFactor(0);

        this.add
            .text(16, 114, 'E: ingresar a la fila', {
                ...style,
                fontSize: '16px',
                color: '#00000088'
            })
            .setDepth(10)
            .setScrollFactor(0);


        // Create queue gap button (initially hidden)
        this.queueGapButton = this.add
            .rectangle(window.innerWidth / 2, window.innerHeight - 80, 300, 60, 0x00aa00)
            .setDepth(100)
            .setScrollFactor(0)
            .setInteractive()
            .on('pointerdown', () => this._tryInsertInQueue())
            .setVisible(false)
            .setAlpha(0.9);

        this.queueGapButtonText = this.add
            .text(
                window.innerWidth / 2,
                window.innerHeight - 80,
                'Presiona E para colarte',
                {
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    color: '#ffffff',
                    fontStyle: 'bold',
                    backgroundColor: '#00000066',
                    padding: { x: 15, y: 8 }
                }
            )
            .setOrigin(0.5)
            .setDepth(101)
            .setScrollFactor(0)
            .setVisible(false)
            .setName('queueGapButtonText');
    }

    _createControls() {
        // Request pointer lock directly on canvas on first click
        const canvas = this.game.canvas;
        if (canvas && !this._pointerLockRequested) {
            this._pointerLockRequested = false;
            canvas.addEventListener('click', () => {
                if (!this._pointerLockRequested) {
                    this._pointerLockRequested = true;
                    if (canvas.requestPointerLock) {
                        canvas.requestPointerLock().catch((err) => {
                            console.warn('Canvas requestPointerLock failed:', err);
                        });
                    }
                }
            }, { once: true });
        }

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.runKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

        this._setupPointerRotation();
    }

    _updatePlayerInput() {
        if (!this.threeWorld || !this.cursors || !this.wasd) {
            return;
        }

        const forward =
            Number(this.cursors.up.isDown || this.wasd.up.isDown) -
            Number(this.cursors.down.isDown || this.wasd.down.isDown);
        const strafe =
            Number(this.cursors.left.isDown || this.wasd.left.isDown) -
            Number(this.cursors.right.isDown || this.wasd.right.isDown);

        const run = Boolean(this.runKey?.isDown);
        const jump = this.jumpKey ? Phaser.Input.Keyboard.JustDown(this.jumpKey) : false;

        this.threeWorld.setPlayerInput({ forward, strafe, run, jump });
    }

    _updateQueueGapUI() {
        if (!this.threeWorld || !this.queueGapButton) {
            return;
        }

        const gameState = this.threeWorld.getGameState();

        const shouldShow = (gameState.nearQueueGap || gameState.playerInQueue) && !gameState.playerCaught;
        this.queueGapButton.setVisible(shouldShow);

        const buttonText = this.children.getByName('queueGapButtonText');
        if (buttonText) {
            if (gameState.playerInQueue) {
                buttonText.setText('Presiona E para salir de la fila');
            } else {
                buttonText.setText('Presiona E para colarte');
            }
            buttonText.setVisible(shouldShow);
        }

        // Manejar la tecla E
        if (shouldShow && this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) {
            if (gameState.playerInQueue) {
                this.threeWorld.exitPlayerFromQueue();
            } else if (gameState.nearQueueGap) {
                this._tryInsertInQueue();
            }
        }
    }

    _tryInsertInQueue() {
        if (!this.threeWorld) {
            return;
        }

        const gameState = this.threeWorld.getGameState();
        if (!gameState.nearQueueGap) {
            return;
        }

        this.threeWorld.insertPlayerInQueue(gameState.queueGapIndex);
    }

    _registerEvents() {
        this.scale.on(Phaser.Scale.Events.RESIZE, this._handleResize, this);
        this.events.on(Phaser.Scenes.Events.SHUTDOWN, this._shutdown, this);

        this._handleResize(this.scale.gameSize);
    }

    _handleResize(gameSize) {
        const width = gameSize?.width ?? window.innerWidth;
        const height = gameSize?.height ?? window.innerHeight;

        this._sizePhaserCanvas(width, height);
        this.threeWorld?.resize(width, height);
    }

    _configurePhaserCanvas() {
        const canvas = this.game.canvas;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '1';
    }

    _sizePhaserCanvas(width, height) {
        this.game.canvas.style.width = `${width}px`;
        this.game.canvas.style.height = `${height}px`;
    }

    _shutdown() {
        this.scale.off(Phaser.Scale.Events.RESIZE, this._handleResize, this);
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, this._shutdown, this);
        this.runKey?.destroy();
        this.jumpKey?.destroy();
        this.eKey?.destroy();
        this._teardownPointerRotation();
        this.threeWorld?.destroy();
    }

    _setupPointerRotation() {
        if (!this.input || this.pointerHandlers) {
            return;
        }

        this.pointerHandlers = {
            over: (pointer) => {
                this.lastPointerX = pointer.x;
            },
            out: () => {
                this.lastPointerX = null;
            },
            move: (pointer) => {
                if (this.input.mouse.locked) {
                    this.threeWorld?.rotateCamera(pointer.movementX);
                    return;
                }

                // Normal mode (sin pointer lock)
                if (this.lastPointerX == null) {
                    this.lastPointerX = pointer.x;
                    return;
                }

                const deltaX = pointer.x - this.lastPointerX;
                this.lastPointerX = pointer.x;

                if (deltaX !== 0) {
                    this.threeWorld?.rotateCamera(deltaX);
                }
            }
        };

        this.input.on('pointerover', this.pointerHandlers.over);
        this.input.on('pointerout', this.pointerHandlers.out);
        this.input.on('pointermove', this.pointerHandlers.move);
    }

    _teardownPointerRotation() {
        if (!this.input || !this.pointerHandlers) {
            return;
        }

        this.input.off('pointerover', this.pointerHandlers.over);
        this.input.off('pointerout', this.pointerHandlers.out);
        this.input.off('pointermove', this.pointerHandlers.move);
        this.pointerHandlers = null;
        this.lastPointerX = null;
    }
}
