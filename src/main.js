import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 3);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(light);

const loader = new GLTFLoader();

loader.load('./models/man1.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    
    console.log("Animaciones:", gltf.animations);

    const mixer = new THREE.AnimationMixer(model);

    
    let walkClip =
        THREE.AnimationClip.findByName(gltf.animations, "Walk") ||
        THREE.AnimationClip.findByName(gltf.animations, "HumanArmature|Man_Walk") ||
        gltf.animations[1]; 

    const action = mixer.clipAction(walkClip);
    action.play();

    function animate() {
        requestAnimationFrame(animate);
        mixer.update(0.01);
        renderer.render(scene, camera);
    }
    animate();
});
