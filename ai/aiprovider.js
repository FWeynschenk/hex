/**
 * AI Provider - Interface for managing different AI implementations
 * 
 * This module provides:
 * - Registry of available AI implementations
 * - Difficulty configuration for each AI
 * - Interface for the UI to discover and use AIs
 * - Auto-registration of AIs with metadata
 */

class AIProvider {
    constructor() {
        this.ais = new Map();
        this.currentAI = null;
    }

    /**
     * Auto-register an AI from its class (reads metadata from the class)
     * @param {Object} aiClass - AI class constructor with static metadata property
     */
    autoRegisterAI(aiClass) {
        if (!aiClass.metadata) {
            console.warn('AI class missing metadata, skipping auto-registration', aiClass);
            return false;
        }

        const metadata = aiClass.metadata;
        this.registerAI(metadata.id, aiClass, metadata);
        return true;
    }

    /**
     * Register a new AI implementation
     * @param {string} id - Unique identifier for the AI
     * @param {Object} aiClass - AI class constructor
     * @param {Object} metadata - AI metadata (name, description, difficulties, etc.)
     */
    registerAI(id, aiClass, metadata) {
        this.ais.set(id, {
            id,
            class: aiClass,
            metadata: {
                name: metadata.name || id,
                description: metadata.description || '',
                author: metadata.author || 'Unknown',
                version: metadata.version || '1.0',
                supportsAnalytics: metadata.supportsAnalytics || false,
                difficulties: metadata.difficulties || {
                    easy: { name: 'Easy', description: 'Beginner level', config: {} },
                    medium: { name: 'Medium', description: 'Intermediate level', config: {} },
                    hard: { name: 'Hard', description: 'Advanced level', config: {} }
                }
            }
        });
    }

    /**
     * Get all registered AIs
     * @returns {Array} Array of AI metadata
     */
    getAvailableAIs() {
        return Array.from(this.ais.values()).map(ai => ({
            id: ai.id,
            name: ai.metadata.name,
            description: ai.metadata.description,
            author: ai.metadata.author,
            difficulties: Object.keys(ai.metadata.difficulties)
        }));
    }

    /**
     * Get difficulties for a specific AI
     * @param {string} aiId - AI identifier
     * @returns {Object} Difficulty configurations
     */
    getDifficulties(aiId) {
        const ai = this.ais.get(aiId);
        if (!ai) {
            throw new Error(`AI with id '${aiId}' not found`);
        }
        return ai.metadata.difficulties;
    }

    /**
     * Create an AI instance with specific difficulty
     * @param {string} aiId - AI identifier
     * @param {string} difficulty - Difficulty level
     * @param {Object} gameState - Current game state for context
     * @returns {Object} AI instance
     */
    createAI(aiId, difficulty, gameState = null) {
        const ai = this.ais.get(aiId);
        if (!ai) {
            throw new Error(`AI with id '${aiId}' not found`);
        }

        const difficultyConfig = ai.metadata.difficulties[difficulty];
        if (!difficultyConfig) {
            throw new Error(`Difficulty '${difficulty}' not found for AI '${aiId}'`);
        }

        // Create AI instance with difficulty configuration
        const aiInstance = new ai.class(difficultyConfig.config, gameState);
        
        // Store reference to current AI
        this.currentAI = {
            id: aiId,
            difficulty,
            instance: aiInstance,
            metadata: ai.metadata
        };

        return aiInstance;
    }

    /**
     * Get the currently active AI
     * @returns {Object|null} Current AI instance and metadata
     */
    getCurrentAI() {
        return this.currentAI;
    }

    /**
     * Check if an AI supports analytics
     * @param {string} aiId - AI identifier (optional, uses current AI if not provided)
     * @returns {boolean} True if AI supports analytics
     */
    supportsAnalytics(aiId = null) {
        if (aiId) {
            const ai = this.ais.get(aiId);
            return ai ? ai.metadata.supportsAnalytics : false;
        }
        return this.currentAI ? this.currentAI.metadata.supportsAnalytics : false;
    }

    /**
     * Set which player the current AI should play as
     * @param {number} player - Player constant (PLAYER_RED or PLAYER_BLUE)
     */
    setAIPlayer(player) {
        if (this.currentAI && this.currentAI.instance) {
            if (typeof this.currentAI.instance.setPlayer === 'function') {
                this.currentAI.instance.setPlayer(player);
            }
        }
    }

    /**
     * Get the best move from the current AI
     * @param {Object} boardState - Current board state
     * @param {string} difficulty - Difficulty level
     * @returns {Array|null} [row, col] move or null
     */
    getBestMove(boardState, difficulty) {
        if (!this.currentAI || !this.currentAI.instance) {
            throw new Error('No AI instance is currently active');
        }

        return this.currentAI.instance.getMove(boardState, difficulty);
    }

    /**
     * Initialize and auto-register all available AIs
     * This should be called after all AI scripts are loaded
     */
    initializeAIs() {
        // Auto-register all AIs that have been loaded
        // AIs will register themselves via their metadata
        const aiClasses = [
            typeof AdvancedHexAI !== 'undefined' ? AdvancedHexAI : null,
            typeof MCTSAI !== 'undefined' ? MCTSAI : null,
            typeof HeuristicAI !== 'undefined' ? HeuristicAI : null,
            // typeof RandomAI !== 'undefined' ? RandomAI : null,
        ].filter(Boolean);

        aiClasses.forEach(aiClass => {
            this.autoRegisterAI(aiClass);
        });

        console.log(`AI Provider initialized with ${this.ais.size} AI(s)`);
        return this.ais.size;
    }
}

// Create global AI provider instance
const aiProvider = new AIProvider();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIProvider, aiProvider };
}

