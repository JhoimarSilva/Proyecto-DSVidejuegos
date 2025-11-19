import Phaser from 'phaser';
import MainScene from './scenes/MainScene.js';

export function createGameConfig() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    return {
        type: Phaser.AUTO,
        parent: 'game-container',
        width,
        height,
        backgroundColor: '#1b1f23',
        scene: [MainScene],
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

