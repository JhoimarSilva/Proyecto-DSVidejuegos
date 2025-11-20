import Phaser from 'phaser';
import { gameContext } from '../contexts/GameContext.js';

/**
 * CharacterSelectView - Pantalla para seleccionar el personaje principal
 */
export default class CharacterSelectView extends Phaser.Scene {
    constructor() {
        super('CharacterSelectView');
        this.characters = ['Personaje 1', 'Personaje 2', 'Personaje 3'];
        this.selectedIndex = 0;
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const style = {
            fontFamily: 'monospace',
            fontSize: '32px',
            color: '#ffffff'
        };

        this.add.text(width / 2, 50, 'SELECCIONAR PERSONAJE', {
            ...style,
            align: 'center'
        })
            .setOrigin(0.5);

        // Mostrar opciones de personajes
        const startY = 150;
        const spacing = 80;

        this.characters.forEach((char, index) => {
            const isSelected = index === this.selectedIndex;
            const color = isSelected ? 0xff0000 : 0x0066cc;
            const yPos = startY + index * spacing;

            this.add
                .rectangle(width / 2, yPos, 300, 60, color)
                .setInteractive()
                .on('pointerdown', () => {
                    this.selectedIndex = index;
                    gameContext.setSelectedCharacter(char);
                    this.scene.restart();
                });

            this.add
                .text(width / 2, yPos, char, {
                    ...style,
                    fontSize: '18px',
                    color: '#000000'
                })
                .setOrigin(0.5);
        });

        // Botón: Continuar
        this.add
            .rectangle(width / 2, height - 80, 200, 50, 0x00aa00)
            .setInteractive()
            .on('pointerdown', () => {
                const character = this.characters[this.selectedIndex];
                gameContext.setSelectedCharacter(character);
                this.scene.start('UsernameInputView');
            });

        this.add
            .text(width / 2, height - 80, 'Continuar', {
                ...style,
                fontSize: '16px',
                color: '#000000'
            })
            .setOrigin(0.5);
    }
}
