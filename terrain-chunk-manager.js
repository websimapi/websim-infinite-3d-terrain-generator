import * as THREE from 'three';

export class TerrainChunkManager {
    constructor(scene, noiseGenerator, camera) {
        this.scene = scene;
        this.noiseGenerator = noiseGenerator;
        this.camera = camera;
        
        // Configuration
        this.chunkSize = 128; // Size of each chunk (width/length)
        this.chunkResolution = 64; // Resolution of the chunk mesh (vertices per side)
        this.loadDistance = 3; // How many chunks to load in each direction
        this.unloadDistance = 5; // Distance at which chunks are unloaded
        
        // Chunks storage
        this.chunks = new Map();
        this.loadingProgress = 0;
        this.totalChunksToLoad = Math.pow((this.loadDistance * 2) + 1, 2);
        
        // Initialize chunks around camera position
        this.lastCameraChunkPosition = new THREE.Vector2(
            Infinity, Infinity
        );
        
        this.update();
    }
    
    update() {
        // Get current camera position in chunk coordinates
        const cameraPosition = this.camera.position;
        const currentChunkX = Math.floor(cameraPosition.x / this.chunkSize);
        const currentChunkZ = Math.floor(cameraPosition.z / this.chunkSize);
        const currentChunkPosition = new THREE.Vector2(currentChunkX, currentChunkZ);
        
        // Only update chunks if player moved to a new chunk
        if (!this.lastCameraChunkPosition.equals(currentChunkPosition)) {
            this.lastCameraChunkPosition.copy(currentChunkPosition);
            this.updateChunks(currentChunkX, currentChunkZ);
        }
    }
    
    updateChunks(centerX, centerZ) {
        const chunksToLoad = [];
        const existingChunkIds = new Set();
        
        // Determine which chunks should be loaded
        for (let x = centerX - this.loadDistance; x <= centerX + this.loadDistance; x++) {
            for (let z = centerZ - this.loadDistance; z <= centerZ + this.loadDistance; z++) {
                const chunkId = `${x},${z}`;
                existingChunkIds.add(chunkId);
                
                if (!this.chunks.has(chunkId)) {
                    chunksToLoad.push({ x, z, id: chunkId });
                }
            }
        }
        
        // Unload chunks that are too far away
        for (const [chunkId, chunk] of this.chunks.entries()) {
            const [x, z] = chunkId.split(',').map(Number);
            
            if (
                Math.abs(x - centerX) > this.unloadDistance ||
                Math.abs(z - centerZ) > this.unloadDistance
            ) {
                this.scene.remove(chunk);
                this.chunks.delete(chunkId);
            }
        }
        
        // Load new chunks (with a small delay between each to avoid freezing)
        this.loadingProgress = 0;
        const totalChunks = chunksToLoad.length;
        
        if (totalChunks > 0) {
            const loadingProgressElement = document.getElementById('loading-progress');
            const loadingElement = document.getElementById('loading');
            
            if (totalChunks > 5) {
                loadingElement.style.display = 'flex';
            }
            
            chunksToLoad.forEach((chunk, index) => {
                setTimeout(() => {
                    this.createChunk(chunk.x, chunk.z, chunk.id);
                    this.loadingProgress++;
                    
                    if (loadingProgressElement) {
                        const progress = Math.floor((this.loadingProgress / totalChunks) * 100);
                        loadingProgressElement.style.width = `${progress}%`;
                        
                        if (this.loadingProgress === totalChunks) {
                            loadingElement.style.display = 'none';
                        }
                    }
                }, index * 50);
            });
        }
    }
    
    createChunk(chunkX, chunkZ, chunkId) {
        // Define the world position of the chunk
        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;
        
        // Get texture for this chunk
        this.getChunkTexture(chunkX, chunkZ).then(texture => {
            // Create terrain geometry
            const geometry = new THREE.PlaneGeometry(
                this.chunkSize, 
                this.chunkSize, 
                this.chunkResolution - 1, 
                this.chunkResolution - 1
            );
            
            // Rotate to be horizontal
            geometry.rotateX(-Math.PI / 2);
            
            // Apply height to each vertex based on noise
            const vertices = geometry.attributes.position.array;
            for (let i = 0; i < vertices.length; i += 3) {
                const x = vertices[i] + worldX;
                const z = vertices[i + 2] + worldZ;
                
                vertices[i + 1] = this.noiseGenerator.getHeightAt(x, z);
            }
            
            // Update geometry
            geometry.computeVertexNormals();
            
            // Create material
            const material = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.8,
                metalness: 0.2,
                receiveShadow: true
            });
            
            // Create mesh
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.set(worldX, 0, worldZ);
            
            // Add to scene and store in chunks map
            this.scene.add(mesh);
            this.chunks.set(chunkId, mesh);
        });
    }
    
    async getChunkTexture(chunkX, chunkZ) {
        // Use the AI to generate a texture based on the chunk location and terrain type
        const prompt = this.generateTexturePrompt(chunkX, chunkZ);
        
        try {
            // Generate an AI image texture for the terrain
            const imageUrl = await this.generateAIImage(prompt);
            
            if (imageUrl) {
                return this.loadTextureFromUrl(imageUrl);
            } else {
                return this.createTerrainTexture(this.determineTerrainType(chunkX, chunkZ), chunkX * this.chunkSize, chunkZ * this.chunkSize);
            }
        } catch (error) {
            // Fallback texture if the AI generation fails
            console.error("Error generating texture:", error);
            return this.createTerrainTexture(this.determineTerrainType(chunkX, chunkZ), chunkX * this.chunkSize, chunkZ * this.chunkSize);
        }
    }
    
    async generateAIImage(prompt) {
        try {
            // Use the LLM to generate an image
            const result = await websim.imageGen({
                prompt: prompt,
                aspect_ratio: "1:1",
                seed: Math.floor(Math.random() * 1000)
            });
            
            return result.url;
        } catch (error) {
            console.error("Error generating AI image:", error);
            return null;
        }
    }
    
    async loadTextureFromUrl(url) {
        try {
            // Use a CORS proxy to avoid cross-origin issues
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            
            return new Promise((resolve, reject) => {
                const textureLoader = new THREE.TextureLoader();
                textureLoader.crossOrigin = 'anonymous';
                
                textureLoader.load(
                    proxyUrl,
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        resolve(texture);
                    },
                    undefined,
                    (error) => {
                        console.error('Error loading texture:', error);
                        // Fallback to procedural texture
                        resolve(this.generateFallbackTexture());
                    }
                );
            });
        } catch (error) {
            console.error("Error loading texture:", error);
            return this.generateFallbackTexture();
        }
    }
    
    determineTerrainType(chunkX, chunkZ) {
        // Sample heights to determine terrain type
        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;
        
        // Sample height at the center of the chunk
        const center = this.noiseGenerator.getHeightAt(worldX + this.chunkSize/2, worldZ + this.chunkSize/2);
        const minHeight = this.noiseGenerator.minHeight;
        const maxHeight = this.noiseGenerator.maxHeight;
        const heightRange = maxHeight - minHeight;
        
        // Determine primary terrain type
        let terrainType = 'grass';
        if (center < minHeight + heightRange * 0.3) {
            terrainType = 'sand';
        } else if (center > minHeight + heightRange * 0.7) {
            terrainType = 'rock';
        }
        
        return terrainType;
    }
    
    generateTexturePrompt(chunkX, chunkZ) {
        // This creates a prompt for an AI to generate a texture
        // Based on the chunk location and terrain type
        const terrainType = this.determineTerrainType(chunkX, chunkZ);
        
        // Create a more detailed prompt based on terrain type
        let prompt = "";
        
        if (terrainType === 'sand') {
            prompt = `A top-down seamless sand texture with some small rocks and subtle ripples. Light tan color with natural variations.`;
        } else if (terrainType === 'grass') {
            prompt = `A top-down seamless grass texture with small flowers and varying shades of green. Natural ground cover texture from above.`;
        } else if (terrainType === 'rock') {
            prompt = `A top-down seamless rocky mountain terrain texture with cracks and variations in gray stone. Natural mountainous surface from above.`;
        }
        
        // Add some randomization based on chunk coordinates
        const seed = (chunkX * 13 + chunkZ * 17) % 5;
        if (seed === 0) prompt += " More densely packed.";
        if (seed === 1) prompt += " More sparse pattern.";
        if (seed === 2) prompt += " Slightly darker shades.";
        if (seed === 3) prompt += " Slightly lighter shades.";
        if (seed === 4) prompt += " With more color variations.";
        
        return prompt;
    }
    
    createTerrainTexture(terrainType, worldX, worldZ) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Base colors for different terrain types
        const terrainColors = {
            sand: { base: '#E2C799', dark: '#C7A76C', light: '#F7E4C5' },
            grass: { base: '#549154', dark: '#3D7E3D', light: '#87C387' },
            rock: { base: '#888888', dark: '#5E5E5E', light: '#A1A1A1' }
        };
        
        const colors = terrainColors[terrainType];
        
        // Fill with base color
        ctx.fillStyle = colors.base;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add noise patterns specific to the terrain type
        this.addNoiseToTexture(ctx, colors, terrainType, worldX, worldZ);
        
        // Create Three.js texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        return texture;
    }
    
    addNoiseToTexture(ctx, colors, terrainType, worldX, worldZ) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        
        // Use a smaller scale for the texture noise than the terrain noise
        const noiseScale = 0.03;
        
        // Add different noise patterns based on terrain type
        for (let x = 0; x < width; x += 2) {
            for (let y = 0; y < height; y += 2) {
                // Get noise value (using a different seed than the terrain height)
                const nx = (x / width + worldX * 0.01) * noiseScale;
                const ny = (y / height + worldZ * 0.01) * noiseScale;
                const noise = this.noiseGenerator.getNoise(nx, ny, 999) * 0.5 + 0.5;
                
                // Apply different patterns based on terrain type
                if (terrainType === 'sand') {
                    // Sand has smooth ripples
                    const ripples = Math.sin(nx * 100) * Math.sin(ny * 100) * 0.5 + 0.5;
                    const combined = noise * 0.7 + ripples * 0.3;
                    
                    ctx.fillStyle = this.lerpColor(colors.dark, colors.light, combined);
                    ctx.fillRect(x, y, 2, 2);
                } 
                else if (terrainType === 'grass') {
                    // Grass has small speckles and variations
                    const variation = Math.sin(nx * 50) * Math.cos(ny * 50) * 0.5 + 0.5;
                    const combined = noise * 0.6 + variation * 0.4;
                    
                    ctx.fillStyle = this.lerpColor(colors.dark, colors.light, combined);
                    ctx.fillRect(x, y, 2, 2);
                    
                    // Add occasional grass blade spots
                    if (noise > 0.7 && Math.random() > 0.95) {
                        ctx.fillStyle = colors.light;
                        ctx.fillRect(x, y, 2, 2);
                    }
                } 
                else if (terrainType === 'rock') {
                    // Rock has rough, sharp transitions
                    const sharpNoise = noise > 0.5 ? 0.8 : 0.2;
                    const cracks = Math.sin(nx * 200) * Math.sin(ny * 200) > 0.85 ? 0.1 : 0.6;
                    const combined = sharpNoise * 0.7 + cracks * 0.3;
                    
                    ctx.fillStyle = this.lerpColor(colors.dark, colors.light, combined);
                    ctx.fillRect(x, y, 2, 2);
                }
            }
        }
    }
    
    lerpColor(color1, color2, amount) {
        const r1 = parseInt(color1.substring(1, 3), 16);
        const g1 = parseInt(color1.substring(3, 5), 16);
        const b1 = parseInt(color1.substring(5, 7), 16);
        
        const r2 = parseInt(color2.substring(1, 3), 16);
        const g2 = parseInt(color2.substring(3, 5), 16);
        const b2 = parseInt(color2.substring(5, 7), 16);
        
        const r = Math.round(r1 + (r2 - r1) * amount);
        const g = Math.round(g1 + (g2 - g1) * amount);
        const b = Math.round(b1 + (b2 - b1) * amount);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    generateFallbackTexture() {
        // Create a simple procedural texture as fallback
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Green base
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add some noise
        for (let x = 0; x < canvas.width; x++) {
            for (let y = 0; y < canvas.height; y++) {
                if (Math.random() > 0.95) {
                    const brightness = 0.8 + Math.random() * 0.4;
                    ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.1})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        
        // Create Three.js texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        return texture;
    }
}