import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x808080); 

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);


const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(light);


const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();


const stateSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
        map: textureLoader.load('/icons/Enojado.png'), //icono inicial
        transparent: true
    })
);
stateSprite.scale.set(0.5, 0.5, 8); 
scene.add(stateSprite);

let mixer;
let headBone = null;

// const npcEstados = ["Distraido", "Alerta", "Enojado"];

/* function getRandomState() {
    const index = Math.floor(Math.random() * npcEstados.length); //Para que veas cada icono sin cambiarlo aqui
    return npcEstados[index];
} */



loader.load('/models/man1.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    
    mixer = new THREE.AnimationMixer(model);

   
    const walkClip =
        THREE.AnimationClip.findByName(gltf.animations, "Walk") ||
        THREE.AnimationClip.findByName(gltf.animations, "CharacterArmature|Walk") ||
        gltf.animations.find(a => a.name.toLowerCase().includes("walk"));

    const action = mixer.clipAction(walkClip);
    action.play();

   
    model.traverse((obj) => {
        if (obj.isBone && obj.name.toLowerCase().includes("head")) {
            console.log("Head bone encontrado:", obj.name);
            headBone = obj;
        }
    });

   /* setInterval(() => {
    const newState = getRandomState();
    changeStateIcon(newState);
    console.log("Estado cambiado a:", newState);    
    }, 9000); // cambia cada 3 segundos */ 


}, undefined, (err) => {
    console.error("Error cargando GLB:", err);
});

export function changeStateIcon(type) {
    let icon = "/icons/alert.png";

    if (type === "angry") icon = "/icons/Enojado.png";
    if (type === "distracted") icon = "/icons/Distraido.png"; 
    if (type === "alert") icon = "/icons/Alerta.png";
    

   /* textureLoader.load(icon, (tex) => {
    stateSprite.material.dispose();     
    stateSprite.material = new THREE.SpriteMaterial({
        map: tex, transparent: true
    })
    
    }); */

}


function animate() {
    requestAnimationFrame(animate);

    if (mixer) mixer.update(0.01);

    if (headBone) {
        const pos = new THREE.Vector3();
        headBone.getWorldPosition(pos);
        pos.y += 1; // Posición en la cabeza
        stateSprite.position.copy(pos);
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
