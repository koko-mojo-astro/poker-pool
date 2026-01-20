import { Player, RoomConfig, GameStatus, Card, Rank } from '../../shared/types';
import { WebSocket } from 'ws';

export interface ServerPlayer extends Player {
    socket: WebSocket;
}

export interface Room {
    id: string;
    config: RoomConfig;
    players: ServerPlayer[];
    status: GameStatus;
    deck: Card[];
    pottedCards: Rank[];
    winnerId: string | null;
    history: GameResult[];
}

import { GameResult } from '../../shared/types';
