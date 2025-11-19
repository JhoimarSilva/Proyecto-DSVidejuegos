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

const STATE_KEYS = Object.keys(NPC_STATE_ICONS).filter((key) => key !== 'unknown');

export function getRandomNpcState() {
    const index = Math.floor(Math.random() * STATE_KEYS.length);
    return STATE_KEYS[index] ?? DEFAULT_NPC_STATE;
}

