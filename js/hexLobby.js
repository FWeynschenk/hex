import { joinRoom } from './trystero-nostr.min.js';

// Board Size to Hex Radius mapping (to fit different sizes on screen)
const SIZE_RADIUS_MAP = {
    7: 35,
    11: 25,
    13: 22,
    14: 20,
    19: 15
};

class HexLobbyUI {
    constructor() {
        // Parse URL Parameters
        const params = new URLSearchParams(window.location.search);
        this.matchId = params.get('matchId');
        this.variant = params.get('variant') || 'pve'; // Default to pve if missing
        this.playerId = params.get('playerId') || 'player-' + Math.random().toString(36).substr(2, 9);
        this.displayName = params.get('displayName') || 'Player';

        this.boardSize = 7; // Default
        this.hexRadius = SIZE_RADIUS_MAP[this.boardSize];
        
        // DOM Elements
        this.svg = document.getElementById('board');
        this.statusEl = document.getElementById('status');
        this.aiThinkingEl = document.getElementById('aiThinking');
        this.newGameBtn = document.getElementById('newGameBtn');
        this.swapBtn = document.getElementById('swapBtn');
        this.analyticsBtn = document.getElementById('analyticsBtn');
        this.resignBtn = document.getElementById('resignBtn');
        this.returnLobbyBtn = document.getElementById('returnLobbyBtn');
        this.modal = document.getElementById('newGameModal');
        this.modalTitle = document.getElementById('modalTitle');
        this.startGameBtn = document.getElementById('startGameBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.returnToLobbyModalBtn = document.getElementById('returnToLobbyModalBtn');
        this.aiOptionsEl = document.getElementById('aiOptions');
        this.difficultyOptionsEl = document.getElementById('difficultyOptions');
        this.boardSizeBtns = document.querySelectorAll('[data-size]');
        this.firstPlayerBtns = document.querySelectorAll('[data-first]');
        this.difficultyLevelEl = document.getElementById('difficultyLevel');
        this.boardSizeDisplayEl = document.getElementById('boardSizeDisplay');
        this.opponentInfoEl = document.getElementById('opponentInfo');
        this.pveOptionsDiv = document.getElementById('pveOptions');
        this.modalActionButtons = document.getElementById('modalActionButtons');

        // Negotiation Modal Elements
        this.negotiationModal = document.getElementById('negotiationModal');
        this.negotiationStatusEl = document.getElementById('negotiationStatus');
        this.sendVoteBtn = document.getElementById('sendVoteBtn');
        this.negotiationBoardSizeBtns = document.querySelectorAll('[data-vote-size]');

        // State
        this.game = null;
        this.humanPlayer = 1; // Red
        this.aiPlayer = 2; // Blue
        this.hexElements = [];
        this.analyticsEnabled = false;
        
        // Settings
        this.selectedAI = null;
        this.selectedDifficulty = 'medium';
        this.selectedBoardSize = 7;
        this.selectedFirstPlayer = 'player';

        // PvP Specific
        this.room = null;
        this.sendMove = null;
        this.sendRematch = null;
        this.sendResign = null;
        this.sendVote = null;
        this.opponentName = 'Opponent';
        this.opponentPeerId = null;
        this.isHost = false; // Determined by sort order of player IDs
        this.rematchRequested = false;
        this.opponentRematchRequested = false;
        this.opponentLeft = false;
        
        // Negotiation State
        this.myVote = 11; // Default vote
        this.opponentVote = null;

        // Verify critical DOM elements
        if (!this.negotiationModal || !this.sendVoteBtn) {
            console.error('Critical DOM elements missing. Please clear cache and refresh.');
        }

        this.init();
    }

    init() {
        if (this.variant === 'pve') {
            this.initPvE();
        } else if (this.variant === 'pvp') {
            this.initPvP();
        } else {
            console.error('Unknown variant:', this.variant);
            alert('Unknown game variant.');
        }
        
        // Common Event Listeners
        if (this.newGameBtn) this.newGameBtn.addEventListener('click', () => this.showNewGameModal());
        if (this.analyticsBtn) this.analyticsBtn.addEventListener('click', () => this.toggleAnalytics());
        if (this.returnLobbyBtn) this.returnLobbyBtn.addEventListener('click', () => this.returnToLobby());
        if (this.returnToLobbyModalBtn) this.returnToLobbyModalBtn.addEventListener('click', () => this.returnToLobby());
        if (this.resignBtn) this.resignBtn.addEventListener('click', () => this.resignGame());
        if (this.swapBtn) this.swapBtn.addEventListener('click', () => this.handleSwap());
        
        // Board Size Selection (PvE)
        this.boardSizeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.boardSizeBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedBoardSize = parseInt(btn.dataset.size);
            });
        });

        // Board Size Voting (PvP)
        if (this.negotiationBoardSizeBtns) {
            this.negotiationBoardSizeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.negotiationBoardSizeBtns.forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this.myVote = parseInt(btn.dataset.voteSize);
                });
            });
        }
        
        if (this.sendVoteBtn) {
            this.sendVoteBtn.addEventListener('click', () => this.submitVote());
        }

        // First Player Selection
        this.firstPlayerBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.firstPlayerBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedFirstPlayer = btn.dataset.first;
            });
        });

        // Modal Setup
        this.startGameBtn.addEventListener('click', () => this.handleStartGameClick());
        this.cancelBtn.addEventListener('click', () => this.hideModal());
    }

    initPvE() {
        console.log('Initializing PvE Mode');
        this.game = new HexGame(this.boardSize);
        
        // Setup Worker
        this.worker = new Worker('js/ai-worker.js');
        this.workerBusy = false;
        this.setupWorker();
        
        // UI Adjustments
        this.newGameBtn.style.display = 'inline-block';
        this.resignBtn.style.display = 'none'; // No resign in PvE usually, just New Game
        this.returnLobbyBtn.style.display = 'inline-block'; // Allow return to lobby
        this.pveOptionsDiv.style.display = 'block';
        this.returnToLobbyModalBtn.style.display = 'inline-block';
        
        // Populate AI Options
        this.populateAIOptions();
        
        // Initial Draw
        this.drawBoard();
        this.updateStatus();
        this.updateDifficultyIndicator();

        // Init default AI
        if (this.selectedAI) {
            this.workerBusy = true;
            this.worker.postMessage({
                type: 'init',
                data: {
                    aiId: this.selectedAI,
                    difficulty: this.selectedDifficulty,
                    player: this.aiPlayer
                }
            });
        }
    }

    async initPvP() {
        console.log('Initializing PvP Mode');
        this.pveOptionsDiv.style.display = 'none'; // Hide PvE settings
        this.newGameBtn.style.display = 'none'; // Replaced by Rematch flow
        this.resignBtn.style.display = 'none'; // Hidden until game starts
        this.returnLobbyBtn.style.display = 'inline-block';
        this.analyticsBtn.style.display = 'none'; // No analytics in PvP
        this.swapBtn.style.display = 'none'; // Swap rule handled differently in PvP (TBD: simplifed for now)
        
        this.statusEl.textContent = 'Connecting to opponent...';
        this.difficultyLevelEl.textContent = 'Human Opponent';
        
        if (!this.matchId) {
            alert('No Match ID provided!');
            return;
        }

        // Trystero Connection
        const config = { appId: 'hex-game' };
        this.room = joinRoom(config, this.matchId);

        // Actions
        const [sendMove, getMove] = this.room.makeAction('move');
        const [sendRematch, getRematch] = this.room.makeAction('rematch');
        const [sendResign, getResign] = this.room.makeAction('resign');
        const [sendName, getName] = this.room.makeAction('name');
        const [sendVote, getVote] = this.room.makeAction('vote');

        this.sendMove = sendMove;
        this.sendRematch = sendRematch;
        this.sendResign = sendResign;
        this.sendVote = sendVote;

        // Handlers
        this.room.onPeerJoin(peerId => {
            console.log('Peer joined:', peerId);
            this.opponentPeerId = peerId;
            this.statusEl.textContent = 'Opponent connected. Negotiating game setup...';
            sendName(this.displayName);
            
            // Start Negotiation
            this.showNegotiationModal();
        });

        this.room.onPeerLeave(peerId => {
            console.log('Peer left:', peerId);
            this.statusEl.textContent = 'Opponent disconnected.';
            this.opponentLeft = true;
            this.opponentPeerId = null;
            
            this.hideNegotiationModal(); // If in negotiation, close it

            if (!this.game?.gameOver) {
                // Win by default if opponent leaves during game
                this.handlePvPWin(this.humanPlayer, 'Opponent disconnected');
            } else {
                // Disable rematch if game is over
                this.startGameBtn.disabled = true;
                this.startGameBtn.textContent = 'Opponent Left';
            }
        });

        getMove((data, peerId) => {
            console.log('Received move:', data);
            const { row, col, type } = data;
            
            if (!this.game) {
                console.warn('Received move before game started. Ignoring.');
                return;
            }

            if (type === 'swap') {
                this.performSwap();
                this.updateStatus();
            } else {
                this.game.makeMove(row, col);
                this.updateHex(row, col);
                
                // Enable center hex if 7x7
                if (this.boardSize === 7) {
                    const centerHex = this.hexElements[3][3].g;
                    if (centerHex) centerHex.classList.remove('disabled');
                }

                this.updateStatus();

                if (this.game.gameOver) {
                    this.handlePvPWin(this.game.winner, 'Win');
                } else {
                    // Check if swap is available for us now
                     if (this.game.swapAvailable && this.humanPlayer === this.game.currentPlayer && this.humanPlayer === 1) { // Assuming Red can swap if played second? Actually rule is 2nd player swaps.
                         // Swap logic: Player 1 places. Player 2 can swap.
                         // If I am Player 2 (Blue), and moveCount is 1, I can swap.
                         // Logic is in HexGame.makeMove setting swapAvailable.
                         if (this.game.swapAvailable && this.humanPlayer === this.game.currentPlayer) {
                             this.swapBtn.style.display = 'inline-block';
                         }
                     }
                }
            }
        });

        getRematch((data, peerId) => {
            console.log('Opponent requested rematch');
            this.opponentRematchRequested = true;
            if (this.modal.classList.contains('active')) {
                this.updateRematchButtonState();
            }
        });

        getResign((data, peerId) => {
            console.log('Opponent resigned');
            this.handlePvPWin(this.humanPlayer, 'Opponent Resigned');
        });
        
        getVote((vote, peerId) => {
            console.log('Received vote:', vote);
            this.opponentVote = vote;
            this.checkVoteAgreement();
        });

        getName((name, peerId) => {
            this.opponentName = name;
            this.difficultyLevelEl.textContent = name;
        });

        // Initial wait status
        this.statusEl.textContent = 'Waiting for opponent...';
    }

    showNegotiationModal() {
        if (!this.negotiationModal) return;
        this.negotiationModal.classList.add('active');
        if (this.sendVoteBtn) {
            this.sendVoteBtn.textContent = 'Vote';
            this.sendVoteBtn.disabled = false;
        }
        if (this.negotiationStatusEl) this.negotiationStatusEl.textContent = 'Vote for board size...';
        this.opponentVote = null; // Reset on show
        // Reset my selection to default or keep last? Let's default to 11
        // this.myVote = 11; 
        // Update UI selection
        if (this.negotiationBoardSizeBtns) {
            this.negotiationBoardSizeBtns.forEach(btn => {
                if (parseInt(btn.dataset.voteSize) === this.myVote) btn.classList.add('selected');
                else btn.classList.remove('selected');
            });
        }
    }

    hideNegotiationModal() {
        if (this.negotiationModal) this.negotiationModal.classList.remove('active');
    }

    submitVote() {
        this.sendVote(this.myVote);
        this.sendVoteBtn.textContent = 'Vote Sent';
        this.sendVoteBtn.disabled = true;
        this.negotiationStatusEl.textContent = 'Waiting for opponent\'s vote...';
        this.checkVoteAgreement();
    }

    checkVoteAgreement() {
        if (this.opponentVote === null) {
            // Still waiting
            if (this.sendVoteBtn.disabled) {
                this.negotiationStatusEl.textContent = `You voted ${this.myVote}×${this.myVote}. Waiting for opponent...`;
            }
            return;
        }
        
        // Both have voted (assuming I voted if button is disabled, or check if I've sent? sendVoteBtn.disabled is a proxy)
        if (!this.sendVoteBtn.disabled) {
            this.negotiationStatusEl.textContent = `Opponent voted ${this.opponentVote}×${this.opponentVote}. Cast your vote!`;
            return; 
        }

        // Both voted
        if (this.myVote === this.opponentVote) {
            this.negotiationStatusEl.textContent = `Agreed on ${this.myVote}×${this.myVote}! Starting game...`;
            setTimeout(() => {
                this.hideNegotiationModal();
                this.boardSize = this.myVote;
                this.hexRadius = SIZE_RADIUS_MAP[this.boardSize];
                this.startGamePvP();
            }, 1500);
        } else {
            this.negotiationStatusEl.textContent = `Mismatch! You: ${this.myVote}, Opponent: ${this.opponentVote}. Vote again!`;
            this.opponentVote = null; // Reset to force new round of voting
            setTimeout(() => {
                 this.sendVoteBtn.disabled = false;
                 this.sendVoteBtn.textContent = 'Vote Again';
            }, 2000);
        }
    }

    startGamePvP() {
        // Determine who is Player 1 (Red) and Player 2 (Blue) based on playerId sort order
        // This ensures both peers agree without extra negotiation messages
        const myId = this.playerId;
        const theirId = this.opponentPeerId; // Actually we don't know their ID exactly same format, but we can use sorted peer IDs if we exchange them. 
        // However, trystero peer IDs are random session IDs. Ideally we use the ones in URL.
        // But we don't have their URL params. 
        // Simple convention: Sort by Trystero Peer ID.
        // Self ID is not directly exposed in simple Trystero API on the object, but we can just assume we are sorted against the peerId we see.
        // Wait, Trystero uses 'selfId' export. 
        
        // Let's just use a random roll sent by both? Or simpler: Host (lobby creator) vs Joiner?
        // The lobby URL doesn't specify who is host.
        // Let's use the alphabetical order of Trystero Peer IDs.
        
        // We need our own peer ID. Trystero 'joinRoom' returns room, does it expose selfId?
        // The `trystero-nostr.min.js` exports `selfId`.
        
        import('./trystero-nostr.min.js').then(module => {
            const myPeerId = module.selfId;
            const ids = [myPeerId, this.opponentPeerId].sort();
            
            if (myPeerId === ids[0]) {
                this.humanPlayer = 1; // Red
                this.aiPlayer = 2; // Blue (Opponent)
                this.isHost = true;
            } else {
                this.humanPlayer = 2; // Blue
                this.aiPlayer = 1; // Red (Opponent)
                this.isHost = false;
            }
            
            console.log(`I am ${this.humanPlayer === 1 ? 'Red' : 'Blue'}`);
            
            // Reset Game
            // this.boardSize = 11; // Now set via negotiation
            // this.hexRadius = SIZE_RADIUS_MAP[this.boardSize];
            
            this.startNewGameInternal();
        });
    }

    startNewGameInternal() {
        this.game = new HexGame(this.boardSize);
        this.drawBoard();
        this.updateStatus();
        this.resignBtn.style.display = 'inline-block';
        this.swapBtn.style.display = 'none';
        this.rematchRequested = false;
        this.opponentRematchRequested = false;
        this.hideModal();
        
        // Update UI
        this.boardSizeDisplayEl.textContent = `${this.boardSize}×${this.boardSize}`;
    }
    
    handleStartGameClick() {
        if (this.variant === 'pve') {
            this.startNewGamePvE();
        } else {
            // Rematch logic
            this.requestRematch();
        }
    }

    requestRematch() {
        if (this.opponentLeft) return;
        
        this.rematchRequested = true;
        this.sendRematch(true);
        this.startGameBtn.textContent = 'Waiting for opponent...';
        this.startGameBtn.disabled = true;
        
        this.checkRematchStart();
    }

    updateRematchButtonState() {
        if (this.opponentRematchRequested) {
            this.startGameBtn.textContent = 'Accept Rematch';
            this.checkRematchStart(); // If we already clicked, this will trigger
        }
    }

    checkRematchStart() {
        if (this.rematchRequested && this.opponentRematchRequested) {
            // Start new game
            // Swap colors for rematch? Standard is usually loser chooses or swap.
            // Let's just swap colors for variety.
            const oldHuman = this.humanPlayer;
            this.humanPlayer = this.aiPlayer;
            this.aiPlayer = oldHuman;
            
            this.startNewGameInternal();
        }
    }

    // PvE Specific Methods
    setupWorker() {
        this.worker.onmessage = (e) => {
            const { type, move, scores, error } = e.data;
            if (type === 'error') {
                console.error('AI Worker Error:', error);
                this.workerBusy = false;
            } else if (type === 'initComplete') {
                this.workerBusy = false;
                if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
            } else if (type === 'move') {
                this.workerBusy = false;
                if (this._resolveMove) { this._resolveMove(move); this._resolveMove = null; }
            } else if (type === 'scores') {
                if (this._resolveScores) { this._resolveScores(scores); this._resolveScores = null; }
            }
        };
    }
    
    populateAIOptions() {
        const availableAIs = aiProvider.getAvailableAIs();
        this.aiOptionsEl.innerHTML = '';
        
        if (!this.selectedAI && availableAIs.length > 0) {
            this.selectedAI = availableAIs[0].id;
        }
        
        availableAIs.forEach(ai => {
            const isSelected = ai.id === this.selectedAI;
            const aiBtn = document.createElement('div');
            aiBtn.className = 'ai-btn' + (isSelected ? ' selected' : '');
            aiBtn.dataset.aiId = ai.id;
            aiBtn.innerHTML = `<div class="ai-title">${ai.name}</div><div class="ai-desc">${ai.description}</div>`;
            
            aiBtn.addEventListener('click', () => {
                document.querySelectorAll('.ai-btn').forEach(b => b.classList.remove('selected'));
                aiBtn.classList.add('selected');
                this.selectedAI = ai.id;
                this.updateDifficultyOptions(ai.id);
            });
            
            this.aiOptionsEl.appendChild(aiBtn);
        });
        
        if (this.selectedAI) this.updateDifficultyOptions(this.selectedAI);
    }

    updateDifficultyOptions(aiId) {
        const difficulties = aiProvider.getDifficulties(aiId);
        this.difficultyOptionsEl.innerHTML = '';
        
        const difficultyKeys = Object.keys(difficulties);
        difficultyKeys.forEach(key => {
            const diff = difficulties[key];
            const diffBtn = document.createElement('div');
            diffBtn.className = 'difficulty-btn' + (key === this.selectedDifficulty ? ' selected' : '');
            diffBtn.dataset.difficulty = key;
            diffBtn.innerHTML = `<div class="difficulty-title">${diff.name}</div><div class="difficulty-desc">${diff.description}</div>`;
            
            diffBtn.addEventListener('click', () => {
                document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
                diffBtn.classList.add('selected');
                this.selectedDifficulty = key;
            });
            
            this.difficultyOptionsEl.appendChild(diffBtn);
        });

        if (!difficulties[this.selectedDifficulty] && difficultyKeys.length > 0) {
            this.selectedDifficulty = difficultyKeys[0];
        }
    }

    async startNewGamePvE() {
        this.boardSize = this.selectedBoardSize;
        this.hexRadius = SIZE_RADIUS_MAP[this.boardSize];
        
        if (this.selectedFirstPlayer === 'player') {
            this.humanPlayer = 1;
            this.aiPlayer = 2;
        } else {
            this.humanPlayer = 2;
            this.aiPlayer = 1;
        }
        
        this.workerBusy = true;
        this.worker.postMessage({
            type: 'init',
            data: {
                aiId: this.selectedAI,
                difficulty: this.selectedDifficulty,
                player: this.aiPlayer
            }
        });

        await new Promise(resolve => { this._resolveInit = resolve; });
        
        if (aiProvider.supportsAnalytics(this.selectedAI)) {
            this.analyticsBtn.style.display = 'inline-block';
        } else {
            this.analyticsBtn.style.display = 'none';
            this.analyticsEnabled = false;
        }
        
        this.updateDifficultyIndicator();
        this.hideModal();
        this.startNewGameInternal();
        
        if (this.selectedFirstPlayer === 'ai') {
            await this.makeAIMove();
        }
    }

    // Core Game Logic
    drawBoard() {
        this.svg.innerHTML = '';
        this.hexElements = [];
        const hexHeight = this.hexRadius * Math.sqrt(3);
        const hexWidth = this.hexRadius * 2;
        const hexHoriz = hexWidth * 0.75;

        const maxX = 100 + (this.game.size - 1) * hexHoriz + (this.game.size - 1) * hexHoriz / 2 + this.hexRadius + 50;
        const maxY = 100 + (this.game.size - 1) * hexHeight + this.hexRadius + 50;
        
        this.svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
        this.svg.setAttribute('width', Math.min(600, maxX));
        this.svg.setAttribute('height', Math.min(600, maxY));

        this.drawEdgeMarkers();

        for (let row = 0; row < this.game.size; row++) {
            this.hexElements[row] = [];
            for (let col = 0; col < this.game.size; col++) {
                this.drawHex(row, col);
            }
        }
    }

    drawEdgeMarkers() {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'edge-markers');
        const hexHeight = this.hexRadius * Math.sqrt(3);
        const hexWidth = this.hexRadius * 2;
        const hexHoriz = hexWidth * 0.75;
        
        const topLeft = this.getHexCenter(0, 0);
        const topRight = this.getHexCenter(0, this.game.size - 1);
        const bottomLeft = this.getHexCenter(this.game.size - 1, 0);
        const bottomRight = this.getHexCenter(this.game.size - 1, this.game.size - 1);

        const createLine = (x1, y1, x2, y2, cls) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('class', cls);
            g.appendChild(line);
        };

        createLine(topLeft[0] - this.hexRadius, topLeft[1] - hexHeight/2, topRight[0] + this.hexRadius, topRight[1] - hexHeight/2, 'edge-marker edge-red');
        createLine(bottomLeft[0] - this.hexRadius, bottomLeft[1] + hexHeight/2, bottomRight[0] + this.hexRadius, bottomRight[1] + hexHeight/2, 'edge-marker edge-red');
        createLine(topLeft[0] - hexHoriz, topLeft[1], bottomLeft[0] - hexHoriz, bottomLeft[1], 'edge-marker edge-blue');
        createLine(topRight[0] + hexHoriz, topRight[1], bottomRight[0] + hexHoriz, bottomRight[1], 'edge-marker edge-blue');

        this.svg.appendChild(g);
    }

    drawHex(row, col) {
        const [x, y] = this.getHexCenter(row, col);
        const points = this.getHexPoints(x, y);
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'hex');
        
        if (this.boardSize === 7 && row === 3 && col === 3) g.classList.add('disabled');

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points);
        polygon.setAttribute('class', 'hex-fill');
        g.appendChild(polygon);

        g.addEventListener('click', () => this.handleHexClick(row, col));
        this.svg.appendChild(g);
        this.hexElements[row][col] = { g, polygon, x, y };
    }

    getHexCenter(row, col) {
        const hexWidth = this.hexRadius * 2;
        const hexHoriz = hexWidth * 0.75;
        const hexHeight = this.hexRadius * Math.sqrt(3);
        const x = 100 + col * hexHoriz + row * hexHoriz / 2;
        const y = 100 + row * hexHeight;
        return [x, y];
    }

    getHexPoints(x, y) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            points.push([x + this.hexRadius * Math.cos(angle), y + this.hexRadius * Math.sin(angle)]);
        }
        return points.map(p => p.join(',')).join(' ');
    }

    async handleHexClick(row, col) {
        if (this.game.gameOver || this.game.currentPlayer !== this.humanPlayer) return;
        
        const hexGroup = this.hexElements[row][col].g;
        if (hexGroup.classList.contains('disabled')) return;

        if (this.game.makeMove(row, col)) {
            this.updateHex(row, col);
            if (this.boardSize === 7) {
                const centerHex = this.hexElements[3][3].g;
                centerHex.classList.remove('disabled');
            }
            this.updateStatus();
            if (this.analyticsEnabled) this.clearAnalytics();

            // Check for swap availability for opponent
            if (this.variant === 'pve' && this.game.swapAvailable && this.humanPlayer === 1) {
                this.swapBtn.style.display = 'inline-block';
            } else if (this.variant === 'pvp') {
                // Send move to opponent
                this.sendMove({ row, col, type: 'move' });
            }

            if (this.game.gameOver) {
                this.handleWin(this.game.winner);
                return;
            }

            if (this.variant === 'pve') {
                await this.makeAIMove();
            }
        }
    }

    async makeAIMove() {
        // AI Swap Logic
        if (this.game.swapAvailable && this.aiPlayer === 2) {
            // Simplified swap check for now or call worker for eval
             // For now, just use simple logic: if move is central, swap
             const firstMove = this.game.history[0];
             const center = Math.floor(this.game.size / 2);
             if (firstMove && (Math.abs(firstMove.row - center) + Math.abs(firstMove.col - center)) <= 1) {
                 this.aiThinkingEl.textContent = 'AI swapping...';
                 await new Promise(r => setTimeout(r, 1000));
                 this.performSwap();
                 this.aiThinkingEl.textContent = '';
                 this.updateStatus();
                 return;
             }
        }

        this.aiThinkingEl.textContent = 'AI Thinking...';
        this.workerBusy = true;
        this.worker.postMessage({ type: 'getMove', data: { gameState: this.game } });
        
        const move = await new Promise(resolve => { this._resolveMove = resolve; });
        
        if (move) {
            this.game.makeMove(move[0], move[1]);
            this.updateHex(move[0], move[1]);
            if (this.boardSize === 7) this.hexElements[3][3].g.classList.remove('disabled');
            
            this.updateStatus();
            if (this.game.gameOver) this.handleWin(this.game.winner);
        }
        this.aiThinkingEl.textContent = '';
    }

    performSwap() {
         if (this.game.swapSides()) {
            this.swapBtn.style.display = 'none';
            for (let r = 0; r < this.game.size; r++) {
                for (let c = 0; c < this.game.size; c++) {
                    this.updateHex(r, c);
                }
            }
        }
    }

    handleSwap() {
        if (this.variant === 'pvp') {
             this.performSwap();
             this.sendMove({ type: 'swap' });
             this.updateStatus();
        } else {
             this.performSwap();
             this.updateStatus();
             // If PvE, now it's AI turn (Red)
             // Actually if I swap, I become Blue, AI becomes Red. 
             // Game logic: currentPlayer resets to Red.
             // If I was Red and played, now I am Blue. AI is Red.
             // AI must play now.
             this.makeAIMove();
        }
    }
    
    updateHex(row, col) {
        const hexData = this.hexElements[row][col];
        const player = this.game.board[row][col];
        hexData.polygon.classList.remove('red', 'blue');
        hexData.g.classList.remove('occupied');
        
        if (player === 1) { hexData.polygon.classList.add('red'); hexData.g.classList.add('occupied'); }
        else if (player === 2) { hexData.polygon.classList.add('blue'); hexData.g.classList.add('occupied'); }
    }

    updateStatus() {
        if (this.game.gameOver) return; // Handled in handleWin
        const color = this.game.currentPlayer === 1 ? 'Red' : 'Blue';
        const isMe = this.game.currentPlayer === this.humanPlayer;
        this.statusEl.innerHTML = `<span class="player-${color.toLowerCase()}">${isMe ? 'Your' : (this.variant === 'pvp' ? 'Opponent' : 'AI')} (${color}) turn</span>`;
    }

    handleWin(winner) {
        this.game.winner = winner; // Ensure set
        this.showWinningPath();
        const isWin = winner === this.humanPlayer;
        const color = winner === 1 ? 'Red' : 'Blue';
        this.statusEl.innerHTML = `<span class="player-${color.toLowerCase()}">${isWin ? 'You' : (this.variant === 'pvp' ? 'Opponent' : 'AI')} Win!</span>`;
        
        this.saveStats(isWin);
        
        // Show modal
        setTimeout(() => {
             this.modalTitle.textContent = isWin ? 'Victory!' : 'Defeat';
             this.modal.classList.add('active');
             if (this.variant === 'pvp') {
                 this.startGameBtn.textContent = 'Request Rematch';
                 this.startGameBtn.disabled = false;
                 if (this.opponentLeft) {
                     this.startGameBtn.disabled = true;
                     this.startGameBtn.textContent = 'Opponent Left';
                 }
             } else {
                 this.startGameBtn.textContent = 'New Game';
             }
        }, 1500);
    }

    handlePvPWin(winner, reason) {
        // Specific handler for PvP win via resign/disconnect
        this.game.gameOver = true;
        this.game.winner = winner;
        const isWin = winner === this.humanPlayer;
        this.statusEl.textContent = reason;
        
        this.saveStats(isWin);
        
        this.modalTitle.textContent = isWin ? 'Victory!' : 'Defeat';
        this.modal.classList.add('active');
        
        this.startGameBtn.textContent = 'Request Rematch';
        this.startGameBtn.disabled = false;
        
        if (this.opponentLeft) {
             this.startGameBtn.disabled = true;
             this.startGameBtn.textContent = 'Opponent Left';
        }
    }

    resignGame() {
        if (confirm('Are you sure you want to resign?')) {
            if (this.variant === 'pvp') {
                this.sendResign(true);
                this.handlePvPWin(this.aiPlayer, 'You Resigned');
            }
        }
    }

    saveStats(isWin) {
        try {
            if (this.variant === 'pve') {
                const stats = JSON.parse(localStorage.getItem('hex_pve_stats') || '{}');
                if (!stats[this.selectedAI]) stats[this.selectedAI] = { wins: 0, losses: 0 };
                if (isWin) stats[this.selectedAI].wins++;
                else stats[this.selectedAI].losses++;
                localStorage.setItem('hex_pve_stats', JSON.stringify(stats));
            } else {
                const stats = JSON.parse(localStorage.getItem('hex_pvp_stats') || '{ "wins": 0, "losses": 0 }');
                if (isWin) stats.wins++;
                else stats.losses++;
                localStorage.setItem('hex_pvp_stats', JSON.stringify(stats));
            }
        } catch (e) {
            console.error('Failed to save stats', e);
        }
    }

    showWinningPath() {
         const path = this.game.getWinningPath(this.game.winner);
         if (!path || path.length < 2) return;
         const pathLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
         const points = path.map(([r, c]) => {
             const [x, y] = this.getHexCenter(r, c);
             return `${x},${y}`;
         }).join(' ');
         pathLine.setAttribute('points', points);
         pathLine.setAttribute('class', 'winning-path');
         this.svg.appendChild(pathLine);
    }

    showNewGameModal() {
        this.modalTitle.textContent = 'New Game';
        this.modal.classList.add('active');
        this.startGameBtn.textContent = 'Start Game';
        this.startGameBtn.disabled = false;
    }

    hideModal() {
        this.modal.classList.remove('active');
    }

    returnToLobby() {
        // Go to lobby URL - assuming specific URL from spec or just up one level if hosted in repo
        window.location.href = 'https://flwe.nl/lobby/index.html'; 
    }

    updateDifficultyIndicator() {
        if (this.variant === 'pvp') return;
        let aiName = 'AI';
        let diffName = this.selectedDifficulty;
        const ai = aiProvider.getAvailableAIs().find(a => a.id === this.selectedAI);
        if (ai) {
            aiName = ai.name;
            const diffs = aiProvider.getDifficulties(this.selectedAI);
            if (diffs && diffs[this.selectedDifficulty]) diffName = diffs[this.selectedDifficulty].name;
        }
        this.difficultyLevelEl.textContent = `${aiName} (${diffName})`;
        this.boardSizeDisplayEl.textContent = `${this.boardSize}×${this.boardSize}`;
    }
    
    // Analytics (copy from HexUI)
    toggleAnalytics() {
        this.analyticsEnabled = !this.analyticsEnabled;
        this.analyticsBtn.textContent = `Analytics: ${this.analyticsEnabled ? 'ON' : 'OFF'}`;
        this.analyticsBtn.classList.toggle('active', this.analyticsEnabled);
        if (this.analyticsEnabled) this.showAnalytics();
        else this.clearAnalytics();
    }

    async showAnalytics() {
         if (!aiProvider.supportsAnalytics(this.selectedAI)) return;
         this.worker.postMessage({ type: 'getScores', data: { gameState: this.game } });
         const scores = await new Promise(r => { this._resolveScores = r; });
         if (!scores) return;
         this.clearAnalytics();
         const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
         g.setAttribute('id', 'analytics-layer');
         for (const [key, score] of scores.entries()) {
             const [r, c] = key.split(',').map(Number);
             if (this.game.board[r][c] !== 0) continue;
             const {x, y} = this.hexElements[r][c];
             const color = this.getScoreColor(score);
             const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
             circle.setAttribute('cx', x); circle.setAttribute('cy', y);
             circle.setAttribute('r', this.hexRadius * 0.6);
             circle.setAttribute('fill', color);
             circle.setAttribute('class', 'analytics-score-bg');
             g.appendChild(circle);
             const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
             text.setAttribute('x', x); text.setAttribute('y', y);
             text.setAttribute('class', 'analytics-overlay');
             text.setAttribute('fill', 'white');
             text.textContent = Math.round(score);
             g.appendChild(text);
         }
         this.svg.appendChild(g);
    }

    clearAnalytics() {
        const el = document.getElementById('analytics-layer');
        if (el) el.remove();
    }

    getScoreColor(score) {
        if (score < 50) {
            const ratio = score / 50;
            return `rgb(255, ${Math.round(ratio * 255)}, 0)`;
        } else {
            const ratio = (score - 50) / 50;
            return `rgb(${Math.round((1 - ratio) * 255)}, 255, 0)`;
        }
    }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    // Wait for global scripts to load
    if (typeof HexGame !== 'undefined' && typeof aiProvider !== 'undefined') {
        aiProvider.initializeAIs();
        new HexLobbyUI();
    } else {
        console.error('Required scripts not loaded');
    }
});

