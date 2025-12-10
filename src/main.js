import Phaser from 'phaser';
import { createGameConfig } from './config.js';
import { LoadingScreen } from './views/LoadingScreen.js';

// Crear instancia de pantalla de carga
const loadingScreen = new LoadingScreen();

// Configurar las imágenes de carga
loadingScreen.setImages([
    '/loading-screens/1.png',
    '/loading-screens/2.png',
    '/loading-screens/3.png',
    '/loading-screens/4.png',
    '/loading-screens/Derrota.png',
    '/loading-screens/victoria.png'
]);

// Crear el juego
const game = new Phaser.Game(createGameConfig());

export default game;
export { loadingScreen };
