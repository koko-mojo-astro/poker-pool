import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { RoomManager } from './RoomManager';
import { ClientMessage, ServerMessage, GameState, Player } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const roomManager = new RoomManager();
const PORT = process.env.PORT || 3000;

// Serve static files from the React app dist folder
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

wss.on('connection', (ws: WebSocket) => {
    let currentPlayerId: string | null = null;
    let currentRoomId: string | null = null;

    console.log('New client connected');

    ws.on('message', (data) => {
        try {
            const message: ClientMessage = JSON.parse(data.toString());
            handleMessage(ws, message);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${currentPlayerId} from ${currentRoomId}`);
        if (currentRoomId && currentPlayerId) {
            const room = roomManager.getRoom(currentRoomId);
            if (room) {
                // Always mark disconnected, never remove immediately to allow reconnect
                const player = room.players.find(p => p.id === currentPlayerId);
                if (player) {
                    player.isConnected = false;
                    broadcastGameUpdate(room.id);
                }
            }
        }
    });

    function handleMessage(ws: WebSocket, msg: ClientMessage) {
        switch (msg.type) {
            case 'CREATE_ROOM': {
                const { gameAmount, jokerAmount, creatorName } = msg.payload;
                const result = roomManager.createRoom({ gameAmount, jokerAmount }, creatorName, ws);

                currentPlayerId = result.player.id;
                currentRoomId = result.room.id;

                // Notify creator
                send(ws, {
                    type: 'ROOM_CREATED',
                    payload: {
                        roomId: result.room.id,
                        playerId: result.player.id
                    }
                });
                // Also send initial state
                send(ws, {
                    type: 'JOINED_ROOM',
                    payload: {
                        roomId: result.room.id,
                        playerId: result.player.id,
                        state: roomManager.getPublicState(result.room)
                    }
                });
                break;
            }
            case 'JOIN_ROOM': {
                const { roomId, name } = msg.payload;
                const result = roomManager.joinRoom(roomId, name, ws);
                if (result.error || !result.room || !result.player) {
                    send(ws, { type: 'ERROR', payload: { message: result.error || 'Failed to join' } });
                    return;
                }

                currentPlayerId = result.player.id;
                currentRoomId = result.room.id;

                // Notify joiner
                send(ws, {
                    type: 'JOINED_ROOM',
                    payload: {
                        roomId: result.room.id,
                        playerId: result.player.id,
                        state: roomManager.getPublicState(result.room)
                    }
                });

                // Broadcast to room
                broadcastGameUpdate(result.room.id);
                break;
            }
            case 'START_GAME': {
                if (!currentRoomId || !currentPlayerId) return;
                const room = roomManager.startGame(currentRoomId, currentPlayerId);
                if (room) {
                    broadcastGameUpdate(room.id);
                }
                break;
            }
            case 'POT_CARD': {
                if (!currentRoomId || !currentPlayerId) return;
                const { cardId } = msg.payload;
                const result = roomManager.potCard(currentRoomId, currentPlayerId, cardId);
                if (result.success) {
                    broadcastGameUpdate(currentRoomId);
                }
                break;
            }
            case 'DRAW_CARD': {
                if (!currentRoomId || !currentPlayerId) return;
                const result = roomManager.drawCard(currentRoomId, currentPlayerId);
                if (result.success) {
                    broadcastGameUpdate(currentRoomId);
                } else {
                    if (result.error) {
                        send(ws, { type: 'ERROR', payload: { message: result.error } });
                    }
                }
                break;
            }
            case 'MARK_FOUL': {
                if (!currentRoomId || !currentPlayerId) return;
                const result = roomManager.markFoul(currentRoomId, currentPlayerId);
                if (result.success) {
                    broadcastGameUpdate(currentRoomId);
                } else if (result.error) {
                    send(ws, { type: 'ERROR', payload: { message: result.error } });
                }
                break;
            }
            case 'UPDATE_JOKER': {
                if (!currentRoomId || !currentPlayerId) return;
                const { type, delta } = msg.payload;
                const result = roomManager.updateJokerCount(currentRoomId, currentPlayerId, type, delta);
                if (result.success) {
                    broadcastGameUpdate(currentRoomId);
                } else if (result.error) {
                    send(ws, { type: 'ERROR', payload: { message: result.error } });
                }
                break;
            }
            case 'RESTART_GAME': {
                if (!currentRoomId || !currentPlayerId) return;
                const room = roomManager.restartGame(currentRoomId, currentPlayerId);
                if (room) {
                    broadcastGameUpdate(room.id);
                }
                break;
            }
            case 'RECONNECT': {
                const { roomId, playerId } = msg.payload;
                const result = roomManager.reconnectPlayer(roomId, playerId, ws);

                if (result.success && result.room && result.player) {
                    currentPlayerId = result.player.id;
                    currentRoomId = result.room.id;

                    send(ws, {
                        type: 'JOINED_ROOM',
                        payload: {
                            roomId: result.room.id,
                            playerId: result.player.id,
                            state: roomManager.getPublicState(result.room)
                        }
                    });

                    broadcastGameUpdate(result.room.id);
                } else {
                    send(ws, { type: 'ERROR', payload: { message: result.error || 'Reconnection failed' } });
                }
                break;
            }
            case 'EXIT_ROOM': {
                if (!currentRoomId || !currentPlayerId) return;
                const room = roomManager.getRoom(currentRoomId);
                if (!room) return;

                const player = room.players.find(p => p.id === currentPlayerId);
                if (!player) return;

                if (player.isCreator) {
                    // Creator Exit: Delete room and notify everyone
                    room.players.forEach(p => {
                        send(p.socket, { type: 'ROOM_CLOSED', payload: { reason: 'Host disbanded the room' } });
                    });
                    roomManager.deleteRoom(currentRoomId);
                } else {
                    // Joiner Exit: Remove player and notify room
                    const result = roomManager.removePlayer(currentRoomId, currentPlayerId);
                    if (result.success && result.room) {
                        broadcastGameUpdate(result.room.id);
                        // Notify the exiting player too so they clear state
                        send(ws, { type: 'ROOM_CLOSED', payload: { reason: 'You left the room' } });
                    }
                }
                break;
            }
        }
    }

    function send(client: WebSocket, msg: ServerMessage) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg));
        }
    }

    function broadcastGameUpdate(roomId: string) {
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        room.players.forEach(p => {
            if (p.socket && p.socket.readyState === WebSocket.OPEN) {
                const stateForPlayer: GameState = {
                    ...roomManager.getPublicState(room),
                    players: room.players.map(otherP => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { socket, ...rest } = otherP;
                        if (otherP.id === p.id) {
                            return { ...rest, cardCount: otherP.hand.length } as Player; // ME: see hand
                        } else {
                            // OTHERS: hide hand
                            return { ...rest, hand: [], cardCount: otherP.hand.length } as Player;
                        }
                    })
                };
                p.socket.send(JSON.stringify({ type: 'GAME_UPDATE', payload: stateForPlayer }));
            }
        });
    }
});

// Any other request that doesn't match an API or static file, send back index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
