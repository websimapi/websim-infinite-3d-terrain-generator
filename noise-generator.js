export class NoiseGenerator {
    constructor() {
        // Configuration
        this.seed = Math.floor(Math.random() * 1000000);
        this.octaves = 6; // Number of noise layers
        this.persistence = 0.5; // How much each octave contributes
        this.lacunarity = 2.0; // How much detail is added with each octave
        this.baseScale = 0.001; // Base scale for the main terrain features
        this.minHeight = -100;
        this.maxHeight = 400;
        
        // Constants for improved Perlin noise
        this.permutation = this.generatePermutationTable();
        this.gradients = this.generateGradients();
    }
    
    getHeightAt(x, z) {
        // Get raw noise value
        const noise = this.getFractalNoise(x, z);
        
        // Map to height range
        return this.minHeight + (noise * (this.maxHeight - this.minHeight));
    }
    
    getFractalNoise(x, z) {
        let noise = 0;
        let amplitude = 1;
        let frequency = this.baseScale;
        let maxValue = 0;
        
        // Add multiple layers of noise at different scales
        for (let i = 0; i < this.octaves; i++) {
            // Add the noise layer
            noise += this.getSimplexNoise(x * frequency, z * frequency) * amplitude;
            
            // Keep track of maximum possible value
            maxValue += amplitude;
            
            // Prepare for next octave
            amplitude *= this.persistence;
            frequency *= this.lacunarity;
        }
        
        // Normalize the result
        return noise / maxValue;
    }
    
    getNoise(x, y, seed = 0) {
        // This is a simplified implementation for texture generation
        // It's separate from the terrain height generation
        const seedOffset = seed || 0;
        return this.improvedNoise(x + seedOffset, y + seedOffset, 0.5);
    }
    
    improvedNoise(x, y, z) {
        // Get integer and fractional parts
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        const zi = Math.floor(z) & 255;
        
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const zf = z - Math.floor(z);
        
        // Fade curves
        const u = this.fade(xf);
        const v = this.fade(yf);
        const w = this.fade(zf);
        
        // Hash coordinates of the 8 cube corners
        const aaa = this.permutation[this.permutation[this.permutation[xi] + yi] + zi];
        const aba = this.permutation[this.permutation[this.permutation[xi] + yi + 1] + zi];
        const aab = this.permutation[this.permutation[this.permutation[xi] + yi] + zi + 1];
        const abb = this.permutation[this.permutation[this.permutation[xi] + yi + 1] + zi + 1];
        const baa = this.permutation[this.permutation[this.permutation[xi + 1] + yi] + zi];
        const bba = this.permutation[this.permutation[this.permutation[xi + 1] + yi + 1] + zi];
        const bab = this.permutation[this.permutation[this.permutation[xi + 1] + yi] + zi + 1];
        const bbb = this.permutation[this.permutation[this.permutation[xi + 1] + yi + 1] + zi + 1];
        
        // Gradients
        const g1 = this.gradients[aaa % 12];
        const g2 = this.gradients[baa % 12];
        const g3 = this.gradients[aba % 12];
        const g4 = this.gradients[bba % 12];
        const g5 = this.gradients[aab % 12];
        const g6 = this.gradients[bab % 12];
        const g7 = this.gradients[abb % 12];
        const g8 = this.gradients[bbb % 12];
        
        // Dot products
        const d1 = this.dot3(g1, xf, yf, zf);
        const d2 = this.dot3(g2, xf - 1, yf, zf);
        const d3 = this.dot3(g3, xf, yf - 1, zf);
        const d4 = this.dot3(g4, xf - 1, yf - 1, zf);
        const d5 = this.dot3(g5, xf, yf, zf - 1);
        const d6 = this.dot3(g6, xf - 1, yf, zf - 1);
        const d7 = this.dot3(g7, xf, yf - 1, zf - 1);
        const d8 = this.dot3(g8, xf - 1, yf - 1, zf - 1);
        
        // Trilinear interpolation
        const x1 = this.lerp(d1, d2, u);
        const x2 = this.lerp(d3, d4, u);
        const y1 = this.lerp(x1, x2, v);
        
        const x3 = this.lerp(d5, d6, u);
        const x4 = this.lerp(d7, d8, u);
        const y2 = this.lerp(x3, x4, v);
        
        // Scale to -1 to 1 range
        return this.lerp(y1, y2, w);
    }
    
    // Simplex noise - better quality and less directional artifacts than Perlin
    getSimplexNoise(x, z) {
        // 2D simplex noise implementation
        
        // Skew input space to determine simplex cell
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const s = (x + z) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(z + s);
        
        // Unskew back to normal space
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = z - Y0;
        
        // Determine which simplex we're in
        let i1, j1;
        if (x0 > y0) {
            i1 = 1; j1 = 0; // Lower triangle
        } else {
            i1 = 0; j1 = 1; // Upper triangle
        }
        
        // Offsets for corners
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;
        
        // Hashed gradient indices
        const hash0 = this.permutation[(i + this.permutation[j & 255]) & 255] % 12;
        const hash1 = this.permutation[(i + i1 + this.permutation[(j + j1) & 255]) & 255] % 12;
        const hash2 = this.permutation[(i + 1 + this.permutation[(j + 1) & 255]) & 255] % 12;
        
        // Calculate corner contributions
        const n0 = this.simplexCornerContribution(x0, y0, hash0);
        const n1 = this.simplexCornerContribution(x1, y1, hash1);
        const n2 = this.simplexCornerContribution(x2, y2, hash2);
        
        // Return scaled result
        return 70.0 * (n0 + n1 + n2);
    }
    
    simplexCornerContribution(x, y, hash) {
        // Get gradient from hash
        const grad = this.gradients[hash];
        
        // Calculate distance contribution
        const t = 0.5 - x*x - y*y;
        if (t < 0) return 0;
        
        // Calculate noise contribution
        const t2 = t * t;
        return t2 * t2 * this.dot2(grad, x, y);
    }
    
    dot2(g, x, y) {
        return g[0] * x + g[1] * y;
    }
    
    dot3(g, x, y, z) {
        return g[0] * x + g[1] * y + g[2] * z;
    }
    
    fade(t) {
        // Improved fade function for Perlin noise
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    lerp(a, b, t) {
        return a + t * (b - a);
    }
    
    generatePermutationTable() {
        // Create permutation table with the specific seed
        const p = new Array(512);
        
        // Create initial array
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }
        
        // Shuffle using Fisher-Yates with seeded random
        let random = this.seededRandom(this.seed);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        
        // Duplicate to avoid overflow
        for (let i = 0; i < 256; i++) {
            p[i + 256] = p[i];
        }
        
        return p;
    }
    
    generateGradients() {
        // 3D gradients for Perlin noise
        return [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
    }
    
    seededRandom(seed) {
        return function() {
            // Simple LCG random number generator with seed
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }
}

