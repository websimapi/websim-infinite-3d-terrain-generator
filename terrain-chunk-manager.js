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
        
        // Database connection
        this.room = new WebsimSocket();
        
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
    
    async createChunk(chunkX, chunkZ, chunkId) {
        // Define the world position of the chunk
        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;
        
        try {
            // Check if chunk data exists in database
            const existingChunks = this.room.collection('terrain_chunks')
                .filter({ 
                    terrainId: this.noiseGenerator.terrainId,
                    chunkId: chunkId 
                })
                .getList();
                
            let texture;
            let retryCount = 0;
            const maxRetries = 3;
            
            if (existingChunks && existingChunks.length > 0) {
                // Use texture from database
                console.log(`Loading chunk ${chunkId} from database`);
                texture = await this.loadTextureFromUrl(existingChunks[0].textureUrl);
            } else {
                // Generate new texture with retry logic
                while (!texture && retryCount < maxRetries) {
                    try {
                        // Generate texture for this chunk
                        texture = await this.getChunkTexture(chunkX, chunkZ);
                        
                        // Save successful texture to database
                        if (texture && texture.image) {
                            const textureUrl = texture.image.src;
                            await this.room.collection('terrain_chunks').create({
                                terrainId: this.noiseGenerator.terrainId,
                                chunkId: chunkId,
                                chunkX: chunkX,
                                chunkZ: chunkZ,
                                textureUrl: textureUrl
                            });
                        }
                    } catch (error) {
                        console.warn(`Texture generation attempt ${retryCount + 1} failed for chunk ${chunkId}:`, error);
                        retryCount++;
                        
                        // Wait a bit before retrying
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                // Use fallback texture if all retries failed
                if (!texture) {
                    console.error(`All texture generation attempts failed for chunk ${chunkId}, using fallback`);
                    texture = this.generateFallbackTexture();
                }
            }
            
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
        } catch (error) {
            console.error(`Error creating chunk ${chunkId}:`, error);
            // Create a fallback chunk with basic texture
            this.createFallbackChunk(chunkX, chunkZ, chunkId);
        }
    }
    
    createFallbackChunk(chunkX, chunkZ, chunkId) {
        // Define the world position of the chunk
        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;
        
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
        
        // Create material with fallback texture
        const material = new THREE.MeshStandardMaterial({
            map: this.generateFallbackTexture(),
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
    }
    
    async getChunkTexture(chunkX, chunkZ) {
        // Use the AI to generate a texture based on the chunk location and terrain type
        try {
            // Generate a text description first
            const prompt = this.generateTexturePrompt(chunkX, chunkZ);
            
            // Use the text description to generate an image
            const imageUrl = await this.generateTextureImage(prompt);
            
            // Create a texture from the generated image
            return this.loadTextureFromUrl(imageUrl);
        } catch (error) {
            console.error("Error generating texture:", error);
            return this.generateFallbackTexture();
        }
    }
    
    async generateTextureImage(prompt) {
        try {
            // Use the LLM to generate an image based on the prompt
            const result = await websim.imageGen({
                prompt: prompt,
                width: 512,
                height: 512,
            });
            
            return result.url;
        } catch (error) {
            console.error("Error generating image with AI:", error);
            throw error;
        }
    }
    
    async loadTextureFromUrl(url) {
        return new Promise((resolve, reject) => {
            // Use the Three.js texture loader
            const textureLoader = new THREE.TextureLoader();
            let attempts = 0;
            const maxAttempts = 3;
            
            const attemptLoad = () => {
                attempts++;
                
                // Try loading the texture directly
                textureLoader.load(
                    url,
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        resolve(texture);
                    },
                    undefined,
                    (error) => {
                        console.warn(`Direct texture loading failed (attempt ${attempts}/${maxAttempts}):`, error);
                        
                        if (attempts < maxAttempts) {
                            setTimeout(attemptLoad, 1000); // Wait before retrying
                        } else {
                            console.warn("All direct attempts failed, trying with CORS proxy");
                            this.loadTextureWithProxy(url)
                                .then(resolve)
                                .catch(() => {
                                    console.error("All texture loading methods failed, using fallback");
                                    resolve(this.generateFallbackTexture());
                                });
                        }
                    }
                );
            };
            
            attemptLoad();
        });
    }
    
    async loadTextureWithProxy(url) {
        return new Promise((resolve, reject) => {
            // List of CORS proxies to try in order
            const proxies = [
                "https://corsproxy.io/",
                "https://proxy.cors.sh/",
                "https://cors-proxy.htmldriven.com/?url=",
                "https://thingproxy.freeboard.io/fetch/",
                "https://api.allorigins.win/get?url=",
                "https://api.codetabs.com/v1/proxy?quest="
            ];
            
            // Try each proxy until one works
            const tryProxyAtIndex = (index) => {
                if (index >= proxies.length) {
                    console.error("All proxies failed, using fallback texture");
                    resolve(this.generateFallbackTexture());
                    return;
                }
                
                const proxyUrl = proxies[index] + encodeURIComponent(url);
                const textureLoader = new THREE.TextureLoader();
                
                textureLoader.load(
                    proxyUrl,
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        resolve(texture);
                    },
                    undefined,
                    () => {
                        console.warn(`Proxy ${proxies[index]} failed, trying next...`);
                        tryProxyAtIndex(index + 1);
                    }
                );
            };
            
            tryProxyAtIndex(0);
        });
    }
    
    generateTexturePrompt(chunkX, chunkZ) {
        // Sample several points in the chunk to determine terrain type and features
        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;
        
        // Sample heights at different points in the chunk
        const center = this.noiseGenerator.getHeightAt(worldX + this.chunkSize/2, worldZ + this.chunkSize/2);
        const minHeight = this.noiseGenerator.minHeight;
        const maxHeight = this.noiseGenerator.maxHeight;
        const heightRange = maxHeight - minHeight;
        const normalizedHeight = (center - minHeight) / heightRange;
        
        // Determine primary terrain type based on height
        let terrainType = "lush green grassland";
        let additionalFeatures = "";
        
        if (normalizedHeight < 0.2) {
            terrainType = "sandy beach";
            additionalFeatures = "with scattered shells and pebbles";
        } else if (normalizedHeight < 0.3) {
            terrainType = "coastal sand";
            additionalFeatures = "with patches of dry grass";
        } else if (normalizedHeight < 0.4) {
            terrainType = "grassy plains";
            additionalFeatures = "with wildflowers and tall grass";
        } else if (normalizedHeight < 0.6) {
            terrainType = "forest floor";
            additionalFeatures = "with fallen leaves, moss patches and small plants";
        } else if (normalizedHeight < 0.75) {
            terrainType = "rocky mountainside";
            additionalFeatures = "with sparse vegetation and exposed stone";
        } else if (normalizedHeight < 0.9) {
            terrainType = "alpine rocky terrain";
            additionalFeatures = "with snow patches and small hardy plants";
        } else {
            terrainType = "snowy mountain peak";
            additionalFeatures = "with ice crystals and bare rock outcrops";
        }
        
        // Create a detailed prompt
        return `A seamless top-down texture of ${terrainType} ${additionalFeatures}. Natural colors, realistic, detailed, for a video game terrain. No text. Tile-able pattern.`;
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