import Phaser from 'phaser';
import { ThreeWorld } from '../../three/ThreeWorld.js';

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.threeWorld = null;
        this.cursors = null;
        this.wasd = null;
        this.lastPointerX = null;
        this.pointerHandlers = null;
    }

    create() {
        this._configurePhaserCanvas();
        const container = document.getElementById('game-container');
        this.threeWorld = new ThreeWorld(container);

        this._createHud();
        this._createControls();
        this._registerEvents();
    }

    update(_, delta) {
        this._updatePlayerInput();
        this.threeWorld?.update(delta);
    }

    _createHud() {
        const style = {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#ffffff'
        };

        this.add
            .text(16, 16, 'Explora la escuela', style)
            .setDepth(10)
            .setScrollFactor(0);

        this.add
            .text(16, 48, 'Mover: WASD / Flechas', {
                ...style,
                fontSize: '16px',
                color: '#c9d1d9'
            })
            .setDepth(10)
            .setScrollFactor(0);

        this.add
            .text(16, 70, 'Mueve el mouse para rotar la cámara', {
                ...style,
                fontSize: '16px',
                color: '#c9d1d9'
            })
            .setDepth(10)
            .setScrollFactor(0);

        this.add
            .text(16, 92, 'Observa los estados de los NPC', {
                ...style,
                fontSize: '16px',
                color: '#c9d1d9'
            })
            .setDepth(10)
            .setScrollFactor(0);
    }

    _createControls() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

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
            Number(this.cursors.right.isDown || this.wasd.right.isDown) -
            Number(this.cursors.left.isDown || this.wasd.left.isDown);

        this.threeWorld.setPlayerInput({ forward, strafe });
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

