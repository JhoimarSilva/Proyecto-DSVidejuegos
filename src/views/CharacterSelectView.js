import Phaser from 'phaser';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gameContext } from '../contexts/GameContext.js';

/**
 * CharacterSelectView - Pantalla para seleccionar el personaje principal con vista previa 3D
 */
export default class CharacterSelectView extends Phaser.Scene {
    constructor() {
        super('CharacterSelectView');

        // Lista de personajes disponibles
        this.characters = [
            { name: 'Jorge', model: '/models/man1.glb' },
            { name: 'Sebastían', model: '/models/man6.glb' },
            { name: 'Diego', model: '/models/man8.glb' },
            { name: 'Monica', model: '/models/woman1.glb' },
            { name: 'Sofia', model: '/models/woman5.glb' }
        ];

        this.selectedIndex = 0;
        this.threeScene = null;
        this.threeCamera = null;
        this.threeRenderer = null;
        this.currentModel = null;
        this.loader = null;
        this.mixer = null;
        this.clock = null;
        this.characterButtons = [];
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Inicializar Three.js para la vista previa
        this._initThreeJS();

        const style = {
            fontFamily: 'monospace',
            fontSize: '32px',
            color: '#ffffff'
        };

        // Título
        this.add.text(width / 2, 50, 'SELECCIONAR PERSONAJE', {
            ...style,
            align: 'center'
        })
            .setOrigin(0.5)
            .setDepth(10);

        // Crear botones de personajes - Posicionados a la izquierda
        this._createCharacterButtons(width, height, style);

        // Botón: Continuar
        this.add
            .rectangle(width / 2, height - 80, 200, 50, 0x00aa00)
            .setInteractive()
            .on('pointerdown', () => {
                const character = this.characters[this.selectedIndex];
                // Guardar el modelo seleccionado en GameContext
                gameContext.setSelectedCharacter(character.model);
                console.log('Personaje seleccionado:', character.model);
                this._cleanupThreeJS();
                this.scene.start('UsernameInputView');
            })
            .setDepth(10);

        this.add
            .text(width / 2, height - 80, 'Continuar', {
                ...style,
                fontSize: '16px',
                color: '#000000'
            })
            .setOrigin(0.5)
            .setDepth(10);

        // Cargar el primer personaje
        this._loadCharacterModel(this.selectedIndex);
    }

    update() {
        if (this.mixer && this.clock) {
            const delta = this.clock.getDelta();
            this.mixer.update(delta);
        }

        if (this.threeRenderer && this.threeScene && this.threeCamera) {
            this.threeRenderer.render(this.threeScene, this.threeCamera);
        }

        // Rotar el modelo lentamente
        if (this.currentModel) {
            this.currentModel.rotation.y += 0.01;
        }
    }

    _initThreeJS() {
        // Crear escena
        this.threeScene = new THREE.Scene();
        this.threeScene.background = new THREE.Color(0x1a1a2e);

        // Crear cámara
        this.threeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.threeCamera.position.set(0, 1.5, 3.5);
        this.threeCamera.lookAt(0, 1, 0);

        // Crear renderer - Posicionado a la derecha
        this.threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.threeRenderer.setSize(450, 550);
        this.threeRenderer.domElement.style.position = 'absolute';
        this.threeRenderer.domElement.style.right = '100px'; // Posicionado a la derecha
        this.threeRenderer.domElement.style.top = '50%';
        this.threeRenderer.domElement.style.transform = 'translateY(-50%)';
        this.threeRenderer.domElement.style.pointerEvents = 'none';
        this.threeRenderer.domElement.style.zIndex = '5';

        const container = document.getElementById('game-container');
        if (container) {
            container.appendChild(this.threeRenderer.domElement);
        }

        // Añadir luces
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.threeScene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(2, 3, 2);
        this.threeScene.add(directionalLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
        backLight.position.set(-2, 2, -2);
        this.threeScene.add(backLight);

        // Inicializar loader y clock
        this.loader = new GLTFLoader();
        this.clock = new THREE.Clock();
    }

    _createCharacterButtons(width, height, style) {
        const startY = 120;
        const buttonWidth = 180;
        const buttonHeight = 50;
        const spacing = 60;
        const columns = 2;
        // Mover los botones más a la izquierda
        const leftX = 150;
        const rightX = leftX + buttonWidth + 20;

        this.characters.forEach((char, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const xPos = column === 0 ? leftX : rightX;
            const yPos = startY + row * spacing;

            const isSelected = index === this.selectedIndex;
            const color = isSelected ? 0xff6b35 : 0x0066cc;

            const button = this.add
                .rectangle(xPos, yPos, buttonWidth, buttonHeight, color)
                .setInteractive()
                .on('pointerdown', () => {
                    this.selectedIndex = index;
                    this._loadCharacterModel(index);
                    this._updateButtonColors();
                })
                .setDepth(10);

            this.characterButtons.push(button);

            this.add
                .text(xPos, yPos, char.name, {
                    ...style,
                    fontSize: '14px',
                    color: '#ffffff'
                })
                .setOrigin(0.5)
                .setDepth(10);
        });
    }

    _updateButtonColors() {
        this.characterButtons.forEach((button, index) => {
            const isSelected = index === this.selectedIndex;
            button.setFillStyle(isSelected ? 0xff6b35 : 0x0066cc);
        });
    }

    _loadCharacterModel(index) {
        if (!this.loader || !this.threeScene) return;

        // Limpiar modelo anterior
        if (this.currentModel) {
            this.threeScene.remove(this.currentModel);
            this.currentModel = null;
        }

        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }

        const character = this.characters[index];

        this.loader.load(
            character.model,
            (gltf) => {
                const model = gltf.scene;

                // Escalar y posicionar modelo
                this._prepareCharacterModel(model);
                model.position.set(0, 0, 0);

                this.currentModel = model;
                this.threeScene.add(model);

                // Configurar animación idle si está disponible
                if (gltf.animations?.length) {
                    this.mixer = new THREE.AnimationMixer(model);

                    // Buscar animación idle
                    const idleClip = gltf.animations.find(clip =>
                        clip.name.toLowerCase().includes('idle')
                    ) || gltf.animations[0];

                    if (idleClip) {
                        const action = this.mixer.clipAction(idleClip);
                        action.play();
                    }
                }
            },
            undefined,
            (error) => {
                console.error('Error cargando modelo:', error);
            }
        );
    }

    _prepareCharacterModel(root, targetHeight = 1.8) {
        if (!root) return;

        const bounds = new THREE.Box3().setFromObject(root);
        if (bounds.isEmpty()) return;

        const size = new THREE.Vector3();
        bounds.getSize(size);
        if (size.y <= 0.0001) return;

        const uniformScale = targetHeight / size.y;
        root.scale.setScalar(uniformScale);
        root.updateMatrixWorld(true);

        const scaledBounds = new THREE.Box3().setFromObject(root);
        if (!scaledBounds.isEmpty()) {
            const offsetY = scaledBounds.min.y;
            root.position.y -= offsetY;
            root.updateMatrixWorld(true);
        }
    }

    _cleanupThreeJS() {
        if (this.threeRenderer) {
            const container = document.getElementById('game-container');
            if (container && container.contains(this.threeRenderer.domElement)) {
                container.removeChild(this.threeRenderer.domElement);
            }
            this.threeRenderer.dispose();
            this.threeRenderer = null;
        }

        if (this.currentModel) {
            this.threeScene.remove(this.currentModel);
            this.currentModel = null;
        }

        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }

        this.threeScene = null;
        this.threeCamera = null;
        this.loader = null;
        this.clock = null;
    }

    shutdown() {
        this._cleanupThreeJS();
        this.characterButtons = [];
        super.shutdown();
    }
}
