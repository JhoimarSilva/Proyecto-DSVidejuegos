/**
 * GameContext: Contexto global para estado del juego
 * Maneja: nombre del jugador, personaje seleccionado, estado de juego, etc.
 */
export class GameContext {
    constructor() {
        this.playerName = null;
        this.selectedCharacter = null;
        this.gameState = 'menu'; // menu, characterSelect, usernameInput, playing, paused
        this.listeners = [];
    }

    /**
     * Suscribirse a cambios en el contexto
     * @param {Function} listener - Función que se ejecuta cuando hay cambios
     */
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Notificar a todos los listeners de cambios
     */
    _notify() {
        this.listeners.forEach(listener => listener(this.getState()));
    }

    /**
     * Establecer nombre del jugador
     * @param {string} name
     */
    setPlayerName(name) {
        this.playerName = name;
        this._notify();
    }

    /**
     * Obtener nombre del jugador
     */
    getPlayerName() {
        return this.playerName;
    }

    /**
     * Establecer personaje seleccionado
     * @param {string} character
     */
    setSelectedCharacter(character) {
        this.selectedCharacter = character;
        this._notify();
    }

    /**
     * Obtener personaje seleccionado
     */
    getSelectedCharacter() {
        return this.selectedCharacter;
    }

    /**
     * Cambiar estado del juego
     * @param {string} state
     */
    setGameState(state) {
        this.gameState = state;
        this._notify();
    }

    /**
     * Obtener estado actual del juego
     */
    getGameState() {
        return this.gameState;
    }

    /**
     * Obtener estado completo
     */
    getState() {
        return {
            playerName: this.playerName,
            selectedCharacter: this.selectedCharacter,
            gameState: this.gameState
        };
    }

    /**
     * Resetear contexto
     */
    reset() {
        this.playerName = null;
        this.selectedCharacter = null;
        this.gameState = 'menu';
        this._notify();
    }
}

// Instancia global única
export const gameContext = new GameContext();
