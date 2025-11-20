importScripts(
    './hexGame.js',
    '../ai/hexUtils.js',
    '../ai/aiprovider.js',
    // '../ai/randomAI.js',
    '../ai/heuristicAI.js',
    '../ai/mctsAI.js',
    '../ai/advancedHexAI.js'
);

// Initialize AIs
aiProvider.initializeAIs();

let currentAI = null;
let currentDifficulty = 'medium';
let currentAIPlayer = PLAYER_BLUE; // Default

self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            initAI(data.aiId, data.difficulty, data.player);
            break;
        case 'getMove':
            makeMove(data.gameState);
            break;
        case 'getScores':
            getScores(data.gameState);
            break;
    }
};

function initAI(aiId, difficulty, player) {
    try {
        currentDifficulty = difficulty;
        currentAIPlayer = player;
        // Create a dummy game for initialization if needed
        const dummyGame = new HexGame(7); 
        currentAI = aiProvider.createAI(aiId, difficulty, dummyGame);
        aiProvider.setAIPlayer(player);
        self.postMessage({ type: 'initComplete', success: true });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
}

function makeMove(gameState) {
    if (!currentAI) {
        self.postMessage({ type: 'error', error: 'AI not initialized' });
        return;
    }

    try {
        // Rehydrate game state
        const game = HexGame.fromState(gameState);
        
        // Ensure AI has correct player reference
        if (typeof currentAI.setPlayer === 'function') {
            currentAI.setPlayer(currentAIPlayer);
        }
        
        const move = currentAI.getMove(game, currentDifficulty);
        self.postMessage({ type: 'move', move: move });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
}

function getScores(gameState) {
     if (!currentAI || typeof currentAI.getNormalizedScores !== 'function') {
        self.postMessage({ type: 'scores', scores: null });
        return;
    }

    try {
        const scores = currentAI.getNormalizedScores();
        self.postMessage({ type: 'scores', scores: scores });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
}

