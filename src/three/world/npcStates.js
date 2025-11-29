export const NPC_STATE_ICONS = {
    alert: '/icons/Alerta.png',
    angry: '/icons/Enojado.png',
    distracted: '/icons/Distraido.png',
    unknown: '/icons/signo-de-interrogacion.png'
};

export const NPC_STATE_LABELS = {
    alert: 'Alerta',
    angry: 'Enojado',
    distracted: 'Distraído',
    unknown: 'Desconocido'
};

export const DEFAULT_NPC_STATE = 'alert';

export const NPC_STATE_SEQUENCE = ['alert', 'angry', 'distracted'];

// States that prevent the NPC from noticing queue cutting
export const NON_ALERT_STATES = ['distracted'];

const STATE_KEYS = Object.keys(NPC_STATE_ICONS).filter((key) => key !== 'unknown');

export function getRandomNpcState() {
    const index = Math.floor(Math.random() * STATE_KEYS.length);
    return STATE_KEYS[index] ?? DEFAULT_NPC_STATE;
}

export function setAllNpcsAngry(npcs) {
    npcs.forEach((npc) => {
        npc.stateKey = 'angry';
        npc.distractionTimer = 0;
    });
}

export function setAllNpcsDistracted(npcs) {
    npcs.forEach((npc) => {
        npc.stateKey = 'distracted';
        // reset their individual timers so they stay distracted for a short window
        npc.distractionTimer = 0;
    });
}

/**
 * Habilidad 1: Bomba de distracción - distrae a TODOS los NPCs
 */
export function distractAllNpcs(npcs, duration = 5000) {
    npcs.forEach((npc) => {
        npc.stateKey = 'distracted';
        npc.distractionTimer = 0;
        npc.distractionDuration = duration;
    });
}

/**
 * Habilidad 2: Sonido vergonzoso - distrae NPCs cercanos al jugador
 */
export function distractNearbyNpcs(npcs, playerPosition, radius = 5, duration = 4000) {
    npcs.forEach((npc) => {
        if (!npc.mesh) return;

        const distance = npc.mesh.position.distanceTo(playerPosition);
        if (distance <= radius) {
            npc.stateKey = 'distracted';
            npc.distractionTimer = 0;
            npc.distractionDuration = duration;
        }
    });
}

/**
 * Habilidad 3: Silbido fuerte - distrae NPCs en un área específica
 */
export function distractNpcsInArea(npcs, playerPosition, playerDirection, range = 8, angle = Math.PI / 3, duration = 3000) {
    npcs.forEach((npc) => {
        if (!npc.mesh) return;

        const toNpc = npc.mesh.position.clone().sub(playerPosition).normalize();
        const dotProduct = toNpc.dot(playerDirection);
        const distance = npc.mesh.position.distanceTo(playerPosition);

        // Si el NPC está dentro del cono de visión y rango
        if (dotProduct > Math.cos(angle / 2) && distance <= range) {
            npc.stateKey = 'distracted';
            npc.distractionTimer = 0;
            npc.distractionDuration = duration;
        }
    });
}
