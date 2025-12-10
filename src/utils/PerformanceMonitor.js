/**
 * PerformanceMonitor - Shows FPS, frame time, and memory usage
 * Activate via environment variable: VITE_SHOW_PERFORMANCE=true
 */
export class PerformanceMonitor {
    constructor() {
        // Check if performance monitoring is enabled via env var
        this.enabled = import.meta.env.VITE_SHOW_PERFORMANCE === 'true';
        
        if (!this.enabled) return;

        this.panel = null;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
        this.frameTime = 0;
        
        this._createPanel();
    }

    _createPanel() {
        if (!this.enabled) return;

        // Create container
        const panel = document.createElement('div');
        panel.id = 'performance-monitor';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #0f0;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border: 1px solid #0f0;
            border-radius: 4px;
            z-index: 9999;
            pointer-events: auto;
            min-width: 150px;
            line-height: 1.4;
        `;
        
        panel.innerHTML = `
            <div>FPS: <span id="perf-fps">0</span></div>
            <div>Frame: <span id="perf-frame">0</span>ms</div>
            <div>Memory: <span id="perf-memory">0</span>MB</div>
        `;
        
        document.body.appendChild(panel);
        this.panel = panel;
        this.fpsEl = panel.querySelector('#perf-fps');
        this.frameEl = panel.querySelector('#perf-frame');
        this.memoryEl = panel.querySelector('#perf-memory');
    }

    update() {
        if (!this.enabled || !this.panel) return;

        const now = performance.now();
        const deltaTime = now - this.lastTime;

        this.frameCount++;
        
        // Update FPS every second
        if (deltaTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / deltaTime);
            this.frameTime = (deltaTime / this.frameCount).toFixed(2);
            
            this.fpsEl.textContent = this.fps;
            this.frameEl.textContent = this.frameTime;
            
            // Update memory if available
            if (performance.memory) {
                const memMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
                this.memoryEl.textContent = memMB;
            }
            
            // Reset counter
            this.frameCount = 0;
            this.lastTime = now;
        }
    }

    dispose() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
    }
}
