export class DistractionAbilities {
    constructor(scene) {
        this.scene = scene;
        this.abilities = [];
        this.cooldowns = {
            bomb: 0,
            sound: 0,
            whistle: 0
        };
        this.cooldownDuration = 10000; // 10 segundos
        this.container = null;

        this._createUI();
    }

    _createUI() {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;

        // Posición base en la parte inferior central
        const baseY = height - 80;
        const spacing = 100;
        const startX = width / 2 - spacing;

        // Crear contenedor
        this.container = this.scene.add.container(0, 0);
        this.container.setDepth(200);
        this.container.setScrollFactor(0);

        // Habilidad 1: Bomba de distracción
        this.abilities.push(this._createAbilityButton(
            startX,
            baseY,
            '1',
            '💣',
            0xff6b35,
            'bomb'
        ));

        // Habilidad 2: Sonido vergonzoso
        this.abilities.push(this._createAbilityButton(
            startX + spacing,
            baseY,
            '2',
            '📢',
            0xffd700,
            'sound'
        ));

        // Habilidad 3: Silbido fuerte
        this.abilities.push(this._createAbilityButton(
            startX + spacing * 2,
            baseY,
            '3',
            '👄',
            0x4ecdc4,
            'whistle'
        ));
    }

    _createAbilityButton(x, y, keyText, emoji, color, abilityType) {
        const buttonSize = 60;

        // Círculo exterior (borde dorado)
        const outerCircle = this.scene.add.circle(x, y, buttonSize / 2 + 3, 0xd4af37);
        outerCircle.setStrokeStyle(2, 0xffd700);

        // Círculo principal
        const circle = this.scene.add.circle(x, y, buttonSize / 2, color);
        circle.setInteractive({ useHandCursor: true });
        circle.setAlpha(0.9);

        // Emoji/icono (centrado)
        const icon = this.scene.add.text(x, y, emoji, {
            fontSize: '28px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Fondo para la tecla (pequeño círculo en el borde inferior)
        const keyBg = this.scene.add.circle(x, y + 32, 12, 0x000000);
        keyBg.setStrokeStyle(2, 0xd4af37);
        keyBg.setAlpha(0.8);

        // Número de tecla (centrado en el círculo pequeño)
        const keyLabel = this.scene.add.text(x, y + 32, keyText, {
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Overlay de cooldown (inicialmente invisible)
        const cooldownOverlay = this.scene.add.circle(x, y, buttonSize / 2, 0x000000);
        cooldownOverlay.setAlpha(0);

        // Texto de cooldown
        const cooldownText = this.scene.add.text(x, y, '', {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        cooldownText.setVisible(false);

        // Añadir al contenedor
        this.container.add([outerCircle, circle, icon, cooldownOverlay, cooldownText, keyBg, keyLabel]);

        // Efectos hover
        circle.on('pointerover', () => {
            if (this.cooldowns[abilityType] <= 0) {
                circle.setScale(1.1);
                this.scene.tweens.add({
                    targets: circle,
                    alpha: 1,
                    duration: 100
                });
            }
        });

        circle.on('pointerout', () => {
            circle.setScale(1);
            if (this.cooldowns[abilityType] <= 0) {
                circle.setAlpha(0.9);
            }
        });

        // Click handler
        circle.on('pointerdown', () => {
            this.useAbility(abilityType);
        });

        return {
            type: abilityType,
            circle,
            outerCircle,
            icon,
            keyLabel,
            keyBg,
            cooldownOverlay,
            cooldownText,
            x,
            y
        };
    }

    useAbility(abilityType) {
        // Verificar si está en cooldown
        if (this.cooldowns[abilityType] > 0) {
            return false;
        }

        // Activar cooldown
        this.cooldowns[abilityType] = this.cooldownDuration;

        // Efecto visual de activación
        const ability = this.abilities.find(a => a.type === abilityType);
        if (ability) {
            this.scene.tweens.add({
                targets: ability.circle,
                scale: 1.2,
                alpha: 0.5,
                duration: 100,
                yoyo: true,
                onComplete: () => {
                    ability.circle.setScale(1);
                }
            });
        }

        return true;
    }

    update(delta) {
        // Actualizar cooldowns
        for (const abilityType in this.cooldowns) {
            if (this.cooldowns[abilityType] > 0) {
                this.cooldowns[abilityType] -= delta;
                if (this.cooldowns[abilityType] < 0) {
                    this.cooldowns[abilityType] = 0;
                }

                // Actualizar UI
                this._updateCooldownUI(abilityType);
            }
        }
    }

    _updateCooldownUI(abilityType) {
        const ability = this.abilities.find(a => a.type === abilityType);
        if (!ability) return;

        const cooldownRemaining = this.cooldowns[abilityType];

        if (cooldownRemaining > 0) {
            // Mostrar overlay de cooldown
            const progress = cooldownRemaining / this.cooldownDuration;
            ability.cooldownOverlay.setAlpha(0.7 * progress);
            ability.circle.setAlpha(0.5);

            // Mostrar tiempo restante
            const seconds = Math.ceil(cooldownRemaining / 1000);
            ability.cooldownText.setText(`${seconds}s`);
            ability.cooldownText.setVisible(true);
        } else {
            // Habilidad disponible
            ability.cooldownOverlay.setAlpha(0);
            ability.circle.setAlpha(0.9);
            ability.cooldownText.setVisible(false);
        }
    }

    resize(width, height) {
        if (!this.container) return;

        const baseY = height - 80;
        const spacing = 100;
        const startX = width / 2 - spacing;

        this.abilities.forEach((ability, index) => {
            const newX = startX + spacing * index;
            const elements = [
                ability.outerCircle,
                ability.circle,
                ability.icon,
                ability.keyLabel,
                ability.keyBg,
                ability.cooldownOverlay,
                ability.cooldownText
            ];

            elements.forEach(element => {
                if (element === ability.keyLabel || element === ability.keyBg) {
                    element.setPosition(newX, baseY + 32);
                } else {
                    element.setPosition(newX, baseY);
                }
            });

            ability.x = newX;
            ability.y = baseY;
        });
    }

    isAbilityReady(abilityType) {
        return this.cooldowns[abilityType] <= 0;
    }

    destroy() {
        if (this.container) {
            this.container.destroy();
        }
    }
}
