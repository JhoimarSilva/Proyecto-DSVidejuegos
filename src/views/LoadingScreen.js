export class LoadingScreen {
    constructor() {
        this.container = null;
        this.currentImageIndex = 0;
        this.images = [
            '/loading-screens/1.png',
            '/loading-screens/2.png',
            '/loading-screens/3.png',
            '/loading-screens/4.png'
        ];
        this.rotationInterval = null;
        this.isVisible = false;
        this.onImageFourCallback = null;
        this.keyListener = null;
    }

    /**
     * Crea la estructura HTML de la pantalla de carga
     */
    create() {
        // Contenedor principal
        this.container = document.createElement('div');
        this.container.id = 'loading-screen';
        Object.assign(this.container.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: '#0d1117',
            display: 'none',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '9999',
        });

        // Imagen rotativa
        this.imageElement = document.createElement('img');
        this.imageElement.id = 'loading-image';
        Object.assign(this.imageElement.style, {
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
            marginBottom: '20px',
            cursor: 'pointer',
        });

        // Texto de instrucciones
        this.loadingText = document.createElement('p');
        this.loadingText.textContent = 'Click o presiona ESPACIO para continuar...';
        Object.assign(this.loadingText.style, {
            color: '#fff',
            fontSize: '18px',
            fontFamily: 'sans-serif',
            margin: '0',
            marginTop: '20px',
        });

        // Indicador de progreso (imágenes)
        this.progressIndicator = document.createElement('p');
        Object.assign(this.progressIndicator.style, {
            color: '#aaa',
            fontSize: '14px',
            fontFamily: 'sans-serif',
            margin: '10px 0 0 0',
        });

        // Agregar elementos al contenedor
        this.container.appendChild(this.imageElement);
        this.container.appendChild(this.loadingText);
        this.container.appendChild(this.progressIndicator);

        document.body.appendChild(this.container);
    }

    /**
     * Muestra la pantalla de carga en modo manual
     */
    show() {
        if (!this.container) {
            this.create();
        }
        this.container.style.display = 'flex';
        this.isVisible = true;
        this.currentImageIndex = 0;
        this.showImage(0);
        this.setupManualNavigation();
    }

    /**
     * Oculta la pantalla de carga
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
        this.isVisible = false;
        this.removeManualNavigation();
    }

    /**
     * Configura la navegación manual (click y espacio)
     */
    setupManualNavigation() {
        // Click en la imagen
        this.imageElement.addEventListener('click', () => this.nextImage());

        // Tecla Espacio
        this.keyListener = (event) => {
            if (event.code === 'Space') {
                event.preventDefault();
                this.nextImage();
            }
        };
        document.addEventListener('keydown', this.keyListener);
    }

    /**
     * Remueve los listeners de navegación manual
     */
    removeManualNavigation() {
        if (this.imageElement) {
            this.imageElement.removeEventListener('click', () => this.nextImage());
        }
        if (this.keyListener) {
            document.removeEventListener('keydown', this.keyListener);
            this.keyListener = null;
        }
    }

    /**
     * Avanza a la siguiente imagen
     */
    nextImage() {
        if (this.currentImageIndex < this.images.length - 1) {
            this.currentImageIndex++;
            this.showImage(this.currentImageIndex);

            // Si llegamos a la imagen 4 (índice 3), ejecutar callback
            if (this.currentImageIndex === 3 && this.onImageFourCallback) {
                this.onImageFourCallback();
            }
        }
    }

    /**
     * Muestra una imagen específica
     */
    showImage(index) {
        if (this.images[index]) {
            this.imageElement.src = this.images[index];
            this.updateProgressIndicator(index);
        }
    }

    /**
     * Actualiza el indicador de progreso
     */
    updateProgressIndicator(index) {
        this.progressIndicator.textContent = `Imagen ${index + 1} de ${this.images.length}`;
    }

    /**
     * Establece el callback cuando se alcanza la 4ta imagen
     */
    onReachImageFour(callback) {
        this.onImageFourCallback = callback;
    }

    /**
     * Personaliza las imágenes de carga
     * @param {string[]} imagePaths - Array de rutas a las imágenes
     */
    setImages(imagePaths) {
        this.images = imagePaths;
        this.currentImageIndex = 0;
    }
}
