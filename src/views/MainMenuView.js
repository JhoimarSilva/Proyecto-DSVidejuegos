import Phaser from 'phaser';
import { gameContext } from '../contexts/GameContext.js';
import { loadingScreen } from '../main.js';

/**
 * MainMenuView - Pantalla de menú principal
 */
export default class MainMenuView extends Phaser.Scene {
    constructor() {
        super('MainMenuView');
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const style = {
            fontFamily: 'monospace',
            fontSize: '32px',
            color: '#ffffff'
        };

        this.add.text(width / 2, height / 2 - 100, 'MENÚ PRINCIPAL', {
            ...style,
            align: 'center'
        })
            .setOrigin(0.5);

        // Botón: Seleccionar Personaje
        const btnSelect = this.add
            .rectangle(width / 2, height / 2, 200, 50, 0x0066cc)
            .setInteractive()
            .on('pointerdown', () => {
                this.scene.start('CharacterSelectView');
            });

        this.add
            .text(width / 2, height / 2, 'Seleccionar Personaje', {
                ...style,
                fontSize: '16px',
                color: '#000000'
            })
            .setOrigin(0.5);

        // Botón: Iniciar Juego (debug)
        const btnStart = this.add
            .rectangle(width / 2, height / 2 + 70, 200, 50, 0x00aa00)
            .setInteractive()
            .on('pointerdown', () => {
                this.startGameWithLoadingScreen();
            });

        this.add
            .text(width / 2, height / 2 + 70, 'Iniciar Juego', {
                ...style,
                fontSize: '16px',
                color: '#000000'
            })
            .setOrigin(0.5);
    }

    /**
     * Inicia el juego con la pantalla de carga
     */
    startGameWithLoadingScreen() {
        // Configurar callback para cuando se alcance la imagen 4
        loadingScreen.onReachImageFour(() => {
            // Ocultar pantalla de carga e iniciar juego
            loadingScreen.hide();
            gameContext.setGameState('playing');
            this.scene.start('MainGameView');
        });

        // Mostrar pantalla de carga
        loadingScreen.show();
    }
}
