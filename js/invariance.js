class InvarianceAnimation {
    constructor() {
        // Define scale stages before initialization
        this.scaleStages = [
            { name: 'universe', particleCount: 2000, clusterCount: 15 },
            { name: 'galaxyClusters', particleCount: 1500, clusterCount: 12 },
            { name: 'galaxies', particleCount: 1200, clusterCount: 10 },
            { name: 'starClusters', particleCount: 1000, clusterCount: 8 },
            { name: 'solarSystems', particleCount: 800, clusterCount: 6 },
            { name: 'planets', particleCount: 600, clusterCount: 5 },
            { name: 'macroLife', particleCount: 400, clusterCount: 4 },
            { name: 'mediumLife', particleCount: 300, clusterCount: 3 },
            { name: 'microLife', particleCount: 200, clusterCount: 3 },
            { name: 'cellular', particleCount: 150, clusterCount: 2 },
            { name: 'molecular', particleCount: 100, clusterCount: 2 },
            { name: 'atomic', particleCount: 2000, clusterCount: 15 } // Matches universe for seamless loop
        ];
        
        this.currentStageIndex = 0;
        this.zoomDuration = 15000; // 15 seconds for full loop
        this.stageTransitionTime = this.zoomDuration / this.scaleStages.length;
        this.particles = [];
        this.clusters = [];
        
        // Initialize after properties are defined
        this.init();
    }

    init() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'invariance-container';
        document.body.appendChild(this.container);

        // Create zoom wrapper
        this.zoomWrapper = document.createElement('div');
        this.zoomWrapper.className = 'zoom-wrapper';
        this.container.appendChild(this.zoomWrapper);

        // Add necessary styles
        this.addStyles();
        
        // Initialize particles and clusters
        this.initializeParticles();
        this.initializeClusters();
        
        // Start animation loop
        this.startAnimation();
    }

    addStyles() {
        const styles = `
            .invariance-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: -2;
                background: var(--darker-bg, #050505);
                overflow: hidden;
                perspective: 1000px;
            }

            .zoom-wrapper {
                position: absolute;
                width: 100%;
                height: 100%;
                transform-style: preserve-3d;
            }

            .particle {
                position: absolute;
                width: 2px;
                height: 2px;
                background: radial-gradient(circle at center, 
                    rgba(107, 58, 255, 0.8) 0%, 
                    rgba(107, 58, 255, 0.1) 100%);
                border-radius: 50%;
                transform-style: preserve-3d;
                will-change: transform;
            }

            .cluster {
                position: absolute;
                width: 100px;
                height: 100px;
                border-radius: 50%;
                background: radial-gradient(circle at center,
                    rgba(255, 51, 102, 0.4) 0%,
                    rgba(255, 51, 102, 0.1) 50%,
                    transparent 100%);
                transform-style: preserve-3d;
                will-change: transform;
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    initializeParticles() {
        const maxParticles = Math.max(...this.scaleStages.map(stage => stage.particleCount));
        
        for (let i = 0; i < maxParticles; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            this.zoomWrapper.appendChild(particle);
            this.particles.push({
                element: particle,
                x: 0,
                y: 0,
                z: 0,
                scale: 1,
                opacity: 1
            });
        }
    }

    initializeClusters() {
        const maxClusters = Math.max(...this.scaleStages.map(stage => stage.clusterCount));
        
        for (let i = 0; i < maxClusters; i++) {
            const cluster = document.createElement('div');
            cluster.className = 'cluster';
            this.zoomWrapper.appendChild(cluster);
            this.clusters.push({
                element: cluster,
                x: 0,
                y: 0,
                z: 0,
                scale: 1,
                opacity: 1
            });
        }
    }

    updateStage(progress) {
        const currentStage = this.scaleStages[this.currentStageIndex];
        const nextStageIndex = (this.currentStageIndex + 1) % this.scaleStages.length;
        const nextStage = this.scaleStages[nextStageIndex];

        // Update particles
        this.particles.forEach((particle, index) => {
            if (index < Math.max(currentStage.particleCount, nextStage.particleCount)) {
                const scale = this.interpolateZoom(progress);
                const opacity = index < nextStage.particleCount ? 1 : 1 - progress;

                particle.element.style.transform = `translate3d(${particle.x}px, ${particle.y}px, ${particle.z * scale}px) scale(${scale})`;
                particle.element.style.opacity = opacity;
            }
        });

        // Update clusters
        this.clusters.forEach((cluster, index) => {
            if (index < Math.max(currentStage.clusterCount, nextStage.clusterCount)) {
                const scale = this.interpolateZoom(progress);
                const opacity = index < nextStage.clusterCount ? 1 : 1 - progress;

                cluster.element.style.transform = `translate3d(${cluster.x}px, ${cluster.y}px, ${cluster.z * scale}px) scale(${scale})`;
                cluster.element.style.opacity = opacity;
            }
        });
    }

    interpolateZoom(progress) {
        // Exponential zoom effect
        return Math.pow(2, progress * 4);
    }

    startAnimation() {
        let startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = (elapsed % this.stageTransitionTime) / this.stageTransitionTime;

            if (elapsed >= this.stageTransitionTime) {
                this.currentStageIndex = (this.currentStageIndex + 1) % this.scaleStages.length;
                startTime = currentTime;
                this.repositionElements();
            }

            this.updateStage(progress);
            requestAnimationFrame(animate);
        };

        // Initial positioning
        this.repositionElements();
        requestAnimationFrame(animate);
    }

    repositionElements() {
        const stage = this.scaleStages[this.currentStageIndex];
        
        // Reposition particles
        this.particles.forEach((particle, index) => {
            if (index < stage.particleCount) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos((Math.random() * 2) - 1);
                const radius = Math.random() * 1000;

                particle.x = radius * Math.sin(phi) * Math.cos(theta);
                particle.y = radius * Math.sin(phi) * Math.sin(theta);
                particle.z = radius * Math.cos(phi);
            }
        });

        // Reposition clusters
        this.clusters.forEach((cluster, index) => {
            if (index < stage.clusterCount) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos((Math.random() * 2) - 1);
                const radius = Math.random() * 800;

                cluster.x = radius * Math.sin(phi) * Math.cos(theta);
                cluster.y = radius * Math.sin(phi) * Math.sin(theta);
                cluster.z = radius * Math.cos(phi);
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new InvarianceAnimation();
});
