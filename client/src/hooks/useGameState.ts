/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '../lib/db';
import type { ClientMessage, GameState, GameStatus } from '../../../shared/types';
import { id, tx } from '@instantdb/react';
import { GameEngine } from '../lib/GameEngine.ts';

/** Generate a short 8-character alphanumeric room code */
function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit confusing chars (0,O,1,I)
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export function useGameState() {
    // 1. Auth state
    const { user, isLoading: isAuthLoading } = db.useAuth();

    // 2. Query the user's profile → roomPlayers → room to find their active session
    //    This replaces ALL localStorage usage. InstantDB's reactive useQuery
    //    automatically updates when data changes (create/join/exit room).
    const { data: userData, isLoading: isUserLoading } = db.useQuery(
        user ? {
            $users: {
                $: { where: { id: user.id } },
                profile: {
                    roomPlayers: {
                        room: {
                            players: {
                                profile: {}
                            },
                            matches: {}
                        }
                    }
                }
            }
        } : null
    );

    // Resolve the user's profile
    const userRecord = userData?.$users?.[0];
    const profileRaw = userRecord?.profile as any;
    const resolvedProfile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;

    // Find the active roomPlayer (room status is WAITING or PLAYING or FINISHED)
    const roomPlayers: any[] = resolvedProfile?.roomPlayers || [];
    const activeRoomPlayer = roomPlayers.find((rp: any) => {
        const room = Array.isArray(rp.room) ? rp.room[0] : rp.room;
        return room && (room.status === 'WAITING' || room.status === 'PLAYING' || room.status === 'FINISHED');
    });

    const activePlayerId = activeRoomPlayer?.id || null;
    const activeRoomRaw = activeRoomPlayer?.room;
    const activeRoom = Array.isArray(activeRoomRaw) ? activeRoomRaw[0] : activeRoomRaw;

    // Build the GameState object that the UI expects
    let gameState: GameState | null = null;

    if (activeRoom) {
        const roomPlayersData = activeRoom.players || [];
        const matches = activeRoom.matches || [];
        
        // Sort matches by timestamp to get correct history
        const history = [...matches].sort((a: any, b: any) => a.timestamp - b.timestamp);
        
        // Find current match settlements (last match played)
        const currentMatchSettlements = history.length > 0 
            ? history[history.length - 1].settlements 
            : [];

        gameState = {
            roomId: activeRoom.roomCode || activeRoom.id,
            config: activeRoom.config,
            status: activeRoom.status as GameStatus,
            pottedCards: activeRoom.pottedCards || [],
            deckCount: activeRoom.deck ? activeRoom.deck.length : 0,
            winnerId: activeRoom.winnerId || null,
            players: roomPlayersData.map((rp: any) => ({
                id: rp.id,
                name: rp.profile?.[0]?.displayName || rp.profile?.displayName || 'Unknown',
                hand: rp.hand || [],
                hasLicense: rp.hasLicense,
                jokerBalls: rp.jokerBalls || { direct: 0, all: 0 },
                isCreator: rp.isCreator,
                isConnected: true,
                cardCount: (rp.hand || []).length
            })),
            history,
            settlements: currentMatchSettlements,
            totalSettlements: activeRoom.totalSettlements || {}
        };
    }

    // The roomData object needed by GameEngine (raw InstantDB shape with players array)
    const roomData = activeRoom ? {
        ...activeRoom,
        players: activeRoom.players || []
    } : null;

    const sendMessage = async (msg: ClientMessage) => {
        if (!user) return;

        try {
            switch (msg.type) {
                case 'CREATE_ROOM': {
                    const { gameAmount, jokerAmount } = msg.payload;
                    const roomId = id();
                    const playerRecordId = id();
                    const roomCode = generateRoomCode();

                    const profileId = resolvedProfile?.id;
                    if (!profileId) {
                        alert('Profile not found. Please set up your profile first.');
                        return;
                    }

                    await db.transact([
                        tx.rooms[roomId].update({
                            roomCode,
                            status: 'WAITING',
                            config: { gameAmount, jokerAmount },
                            pottedCards: [],
                            deck: [],
                        }),
                        tx.roomPlayers[playerRecordId].update({
                            hasLicense: false,
                            jokerBalls: { direct: 0, all: 0 },
                            isCreator: true,
                            hand: [],
                            cardCount: 0
                        }),
                        tx.roomPlayers[playerRecordId].link({ room: roomId }),
                        tx.roomPlayers[playerRecordId].link({ profile: profileId })
                    ]);
                    // No localStorage needed — useQuery will reactively pick up
                    // the new roomPlayer→room link automatically
                    break;
                }
                case 'JOIN_ROOM': {
                    const { roomId: roomCode } = msg.payload;
                    const playerRecordId = id();

                    const profileId = resolvedProfile?.id;
                    if (!profileId) {
                        alert('Profile not found. Please set up your profile first.');
                        return;
                    }

                    // Look up the room by roomCode
                    const roomLookup = await db.queryOnce({
                        rooms: { $: { where: { roomCode: roomCode.toUpperCase() } } }
                    });
                    const targetRoom = roomLookup.data?.rooms?.[0];
                    if (!targetRoom) {
                        alert('Room not found. Please check the code and try again.');
                        return;
                    }

                    await db.transact([
                        tx.roomPlayers[playerRecordId].update({
                            hasLicense: false,
                            jokerBalls: { direct: 0, all: 0 },
                            isCreator: false,
                            hand: [],
                            cardCount: 0
                        }).link({ room: targetRoom.id }).link({ profile: profileId })
                    ]);
                    // No localStorage needed — useQuery auto-updates
                    break;
                }
                case 'EXIT_ROOM': {
                    if (activeRoom && activePlayerId) {
                        await GameEngine.exitRoom(db, activeRoom.id, activePlayerId);
                        // Deleting the roomPlayer record removes the link,
                        // so useQuery will stop finding an active room
                    }
                    break;
                }
                // --- Game Engine Logic ---
                case 'START_GAME':
                    if (activeRoom && activePlayerId) await GameEngine.startGame(db, roomData, activePlayerId);
                    break;
                case 'DRAW_CARD':
                    if (activeRoom && activePlayerId) await GameEngine.drawCard(db, roomData, activePlayerId);
                    break;
                case 'POT_CARD':
                    if (activeRoom && activePlayerId) await GameEngine.potCard(db, roomData, activePlayerId, msg.payload.cardId);
                    break;
                case 'MARK_FOUL':
                    if (activeRoom && activePlayerId) await GameEngine.markFoul(db, roomData, activePlayerId);
                    break;
                case 'UPDATE_JOKER':
                    if (activeRoom && activePlayerId) await GameEngine.updateJokerCount(db, roomData, activePlayerId, msg.payload.type, msg.payload.delta);
                    break;
                case 'RESTART_GAME':
                    if (activeRoom && activePlayerId) await GameEngine.restartGame(db, roomData, activePlayerId);
                    break;
                case 'RECONNECT':
                    // No-op: with InstantDB, the user's active room is always
                    // derived from the database. Just refreshing the page works.
                    break;
            }
        } catch (e: any) {
            alert("Action failed: " + e.message);
        }
    };

    return {
        sendMessage,
        gameState,
        playerId: activePlayerId,
        error: null,
        isLoading: isAuthLoading || isUserLoading
    };
}
