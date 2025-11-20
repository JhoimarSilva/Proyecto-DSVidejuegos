import * as THREE from 'three';
import { Audio, AudioListener, AudioLoader } from 'three';

export class SoundManager {
    constructor(camera) {
        this.listener = new AudioListener();
        camera.add(this.listener);
        
        this.audioLoader = new AudioLoader();
        this.booSound = new Audio(this.listener);
        this.ambienteSound = null;
        this.sonandoAbucheo = false;
    }

    loadBooSound() {
        this.audioLoader.load('/sounds/abucheos.wav', (buffer) => {
            this.booSound.setBuffer(buffer);
            this.booSound.setVolume(1.0);
        });
    }

    loadAmbienceSound(scene) {
        return new Promise((resolve) => {
            // Esta función se llamará desde MainScene que ya maneja el sonido ambiente
            resolve();
        });
    }

    playBooSound() {
        if (this.booSound && !this.booSound.isPlaying) {
            this.booSound.play();
        }
    }

    destroy() {
        this.booSound?.stop();
        this.listener?.disconnect();
    }
}
