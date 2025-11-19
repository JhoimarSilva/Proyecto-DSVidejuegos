import Phaser from 'phaser';
import { createGameConfig } from './game/config.js';

const game = new Phaser.Game(createGameConfig());

export default game;
