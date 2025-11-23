import Phaser from 'phaser';
import { gameContext } from '../contexts/GameContext.js';

/**
 * UsernameInputView - Pantalla para ingresar el nombre de usuario
 */
export default class UsernameInputView extends Phaser.Scene {
    constructor() {
        super('UsernameInputView');
        this.inputField = null;
        this.playerName = '';
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const style = {
            fontFamily: 'monospace',
            fontSize: '32px',
            color: '#ffffff'
        };

        // Título
        this.add.text(width / 2, 50, 'INGRESA TU NOMBRE', {
            ...style,
            align: 'center'
        })
            .setOrigin(0.5);


        // Campo de entrada de texto (simulado con Phaser)
        this.add.rectangle(width / 2, 200, 400, 60, 0x333333)
            .setStrokeStyle(2, 0xffffff);

        const inputText = this.add.text(width / 2 - 180, 200 - 20, '', {
            fontFamily: 'monospace',
            fontSize: '24px',
            color: '#ffffff'
        });

        // Permitir entrada de texto desde el teclado
        this.input.keyboard.on('keydown', (event) => {
            const key = event.key;
            
            // Permitir letras, números y algunos caracteres especiales
            if (key.length === 1 && this.playerName.length < 20) {
                if (/^[a-zA-Z0-9_\s-]$/.test(key)) {
                    this.playerName += key;
                    inputText.setText(this.playerName);
                }
            }
            
            // Retroceso
            if (key === 'Backspace' && this.playerName.length > 0) {
                this.playerName = this.playerName.slice(0, -1);
                inputText.setText(this.playerName);
            }
            
            // Enter para confirmar
            if (key === 'Enter' && this.playerName.trim().length > 0) {
                this._startGame();
            }
        });

        // Botón: Confirmar
        this.add
            .rectangle(width / 2, height - 100, 200, 50, 0x00aa00)
            .setInteractive()
            .on('pointerdown', () => {
                if (this.playerName.trim().length > 0) {
                    this._startGame();
                }
            });

        this.add
            .text(width / 2, height - 100, 'Comenzar', {
                ...style,
                fontSize: '16px',
                color: '#000000'
            })
            .setOrigin(0.5);

        // Instrucción
        this.add.text(width / 2, height - 30, 'Escribe tu nombre y presiona Enter o haz click en "Comenzar"', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#999999'
        })
            .setOrigin(0.5);
    }

    _startGame() {
        if (this.playerName.trim().length === 0) return;

        gameContext.setPlayerName(this.playerName.trim());
        gameContext.setGameState('playing');
        this.scene.start('MainGameView');
    }
}
