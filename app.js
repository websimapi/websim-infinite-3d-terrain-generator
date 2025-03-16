import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { TerrainChunkManager } from './terrain-chunk-manager.js';
import { NoiseGenerator } from './noise-generator.js';

class App {
    constructor() {
        this.initialize();
        this.setupEvents();
        this.createScene();
        this.createLighting();
        this.createCamera();
        this.createControls();
        this.createTerrain();
        this.setupMovementControls();
        
        // Start animation loop
        this.animate();
        
        // Hide loading screen after initial chunks are loaded
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
        }, 2000);
    }
    
    initialize() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0025);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
        
        this.clock = new THREE.Clock();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.frameCount = 0;
    }
    
    setupEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    createScene() {
        // Add sky
        const skyGeometry = new THREE.SphereGeometry(8000, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87ceeb,
            side: THREE.BackSide
        });
        this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(this.sky);
    }
    
    createLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.sunLight.position.set(100, 1000, 100);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 500;
        this.sunLight.shadow.camera.far = 1500;
        this.sunLight.shadow.camera.left = -1000;
        this.sunLight.shadow.camera.right = 1000;
        this.sunLight.shadow.camera.top = 1000;
        this.sunLight.shadow.camera.bottom = -1000;
        this.scene.add(this.sunLight);
    }
    
    createCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
        this.camera.position.y = 250;
    }
    
    createControls() {
        this.controls = new PointerLockControls(this.camera, document.body);
        
        this.scene.add(this.controls.getObject());
        
        const onClickToStart = () => {
            this.controls.lock();
        };
        
        document.addEventListener('click', onClickToStart);
        
        this.controls.addEventListener('lock', () => {
            document.removeEventListener('click', onClickToStart);
        });
        
        this.controls.addEventListener('unlock', () => {
            document.addEventListener('click', onClickToStart);
        });
    }
    
    createTerrain() {
        // Initialize noise generator
        this.noiseGenerator = new NoiseGenerator();
        
        // Initialize terrain chunk manager
        this.chunkManager = new TerrainChunkManager(this.scene, this.noiseGenerator, this.camera);
        
        // Initial position height adjustment
        const heightAtPosition = this.noiseGenerator.getHeightAt(0, 0) + 20;
        this.camera.position.y = heightAtPosition;
    }
    
    setupMovementControls() {
        const onKeyDown = (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'Space': this.moveUp = true; break;
                case 'ShiftLeft': this.moveDown = true; break;
            }
        };
        
        const onKeyUp = (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'Space': this.moveUp = false; break;
                case 'ShiftLeft': this.moveDown = false; break;
            }
        };
        
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
    }
    
    updatePosition() {
        const time = this.clock.getDelta();
        
        this.velocity.x -= this.velocity.x * 10.0 * time;
        this.velocity.z -= this.velocity.z * 10.0 * time;
        this.velocity.y -= this.velocity.y * 10.0 * time; // Add damping for y direction
        
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.y = Number(this.moveUp) - Number(this.moveDown);
        this.direction.normalize();
        
        const speed = 400.0;
        
        if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * time;
        if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * time;
        if (this.moveUp || this.moveDown) this.velocity.y += this.direction.y * speed * time;
        
        this.controls.moveRight(-this.velocity.x * time);
        this.controls.moveForward(-this.velocity.z * time);
        
        // Move up/down manually since PointerLockControls doesn't support it
        this.controls.getObject().position.y += this.velocity.y * time;
        
        // Update position display
        const position = this.controls.getObject().position;
        document.getElementById('position').textContent = 
            `${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)}`;
    }
    
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        if (this.controls.isLocked) {
            this.updatePosition();
        }
        
        // Update terrain chunks every frame
        this.chunkManager.update();
        
        // Increment frame counter
        this.frameCount++;
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Start application when page is loaded
window.addEventListener('load', () => {
    new App();
});

