class InvarianceBackground {
    constructor() {
        this.container = document.querySelector('.scale-container');
        this.layers = [];
        this.particles = [];
        this.init();
    }

    init() {
        // Create multiple scale layers
        for (let i = 0; i < 8; i++) {
            this.createScaleLayer(i);
        }
        
        // Create particles
        this.createParticles();
        
        // Start animation
        this.animate();
    }

    createScaleLayer(index) {
        const layer = document.createElement('div');
        layer.className = 'scale-layer';
        
        // Exponential size increase for each layer
        const size = Math.pow(2, index + 4);
        layer.style.width = `${size}px`;
        layer.style.height = `${size}px`;
        
        // Create orbital rings for each layer
        for (let i = 0; i < 3; i++) {
            const orbital = document.createElement('div');
            orbital.className = 'orbital';
            orbital.style.width = `${size * 0.8 - i * 20}px`;
            orbital.style.height = `${size * 0.8 - i * 20}px`;
            orbital.style.animation = `rotate ${20 + i * 5}s linear infinite`;
            layer.appendChild(orbital);
        }
        
        this.container.appendChild(layer);
        this.layers.push(layer);
    }

    createParticles() {
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            // Random size between 2 and 6 pixels
            const size = Math.random() * 4 + 2;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            
            // Random position within container
            this.resetParticle(particle);
            
            this.container.appendChild(particle);
            this.particles.push(particle);
        }
    }

    resetParticle(particle) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 600;
        
        particle.style.left = `${Math.cos(angle) * distance}px`;
        particle.style.top = `${Math.sin(angle) * distance}px`;
        particle.style.animation = `pulse ${Math.random() * 3 + 2}s infinite`;
    }

    animate() {
        // Scale breathing animation
        let scale = 1;
        let increasing = true;
        
        setInterval(() => {
            if (increasing) {
                scale *= 1.01;
                if (scale >= 1.2) increasing = false;
            } else {
                scale *= 0.99;
                if (scale <= 0.8) increasing = true;
            }
            
            this.container.style.transform = `translate(-50%, -50%) scale(${scale})`;
        }, 50);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new InvarianceBackground();
});
