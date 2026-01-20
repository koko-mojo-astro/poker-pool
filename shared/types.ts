// --- Card & Deck Types ---
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
    suit: Suit;
    rank: Rank;
    id: string; // Unique ID for React keys and specific card tracking
}

// --- Player Types ---
export interface Player {
    id: string;
    name: string;
    // Note: Server sends Hand, Client receives Hand. 
    // Other players see cardCount, so we might need a separate PublicPlayer type for client view
    hand: Card[];
    hasLicense: boolean;
    jokerBalls: {
        direct: number;
        all: number;
    };
    isCreator: boolean;
    isConnected: boolean;
    cardCount: number;
}

export interface PublicPlayer extends Omit<Player, 'hand'> {
    cardCount: number;
}

// --- Room & Game State ---
export type GameStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface RoomConfig {
    gameAmount: number;
    jokerAmount: number;
}

export interface GameState {
    roomId: string;
    config: RoomConfig;
    status: GameStatus;
    players: Player[]; // Complete player list (server-side source of truth)
    pottedCards: Rank[]; // Values like '7', 'K' that are potted
    deckCount: number;
    winnerId: string | null;
    payouts?: PayoutInfo[];
    history: GameResult[];
}

export interface GameResult {
    winnerId: string;
    winnerName: string;
    timestamp: number;
    netChanges: Record<string, number>; // PlayerId -> Net Amount (+/-)
}

export interface PayoutInfo {
    playerId: string;
    amountToPay: number; // Positive means they pay, could be negative or handled differently
    calculation: string; // "2.00 + (5 * 0.50)"
}


// --- WebSocket Messages ---

export type ClientMessage =
    | { type: 'CREATE_ROOM'; payload: { gameAmount: number; jokerAmount: number; creatorName: string } }
    | { type: 'JOIN_ROOM'; payload: { roomId: string; name: string } }
    | { type: 'START_GAME' }
    | { type: 'POT_CARD'; payload: { cardId: string } }
    | { type: 'DRAW_CARD' }
    | { type: 'MARK_FOUL' }
    | { type: 'UPDATE_JOKER'; payload: { type: 'direct' | 'all'; delta: 1 | -1 } }
    | { type: 'RESTART_GAME' }
    | { type: 'RECONNECT'; payload: { roomId: string; playerId: string } }
    | { type: 'EXIT_ROOM' };

export type ServerMessage =
    | { type: 'ROOM_CREATED'; payload: { roomId: string; playerId: string } } // playerId is the creator's ID
    | { type: 'JOINED_ROOM'; payload: { roomId: string; playerId: string; state: GameState } }
    | { type: 'GAME_UPDATE'; payload: GameState }
    | { type: 'ERROR'; payload: { message: string } }
    | { type: 'PLAYER_ACTION_ACK'; payload: { action: string; success: boolean } }
    | { type: 'ROOM_CLOSED'; payload: { reason: string } };
