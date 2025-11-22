import Phaser from 'phaser';
import MainMenuView from '../views/MainMenuView.js';
import CharacterSelectView from '../views/CharacterSelectView.js';
import UsernameInputView from '../views/UsernameInputView.js';
import MainGameView from '../views/MainGameView.js';

export function createGameConfig() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    return {
        type: Phaser.AUTO,
        parent: 'game-container',
        width,
        height,
        backgroundColor: '#1b1f23',
        transparent: true,
        scene: [MainMenuView, CharacterSelectView, UsernameInputView, MainGameView],
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        render: {
            pixelArt: false,
            antialias: true
        }
    };
}

