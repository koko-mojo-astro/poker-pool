/* eslint-disable @typescript-eslint/no-explicit-any */

import { db } from '../lib/db';
import type { ClientMessage, GameState, GameStatus, VisitAction } from '../types';
import { id, tx } from '@instantdb/react';
import { GameEngine } from '../lib/GameEngine.ts';
import { useEffect, useRef, useState } from 'react';
import { useAlert } from '../components/AlertContext';

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
    const { showAlert } = useAlert();
    const remoteActionInFlightRef = useRef(false);
    const draftActionsRef = useRef<VisitAction[]>([]);
    const [draftActions, setDraftActions] = useState<VisitAction[]>([]);
    const remoteActions = new Set<ClientMessage['type']>([
        'CREATE_ROOM',
        'JOIN_ROOM',
        'EXIT_ROOM',
        'START_GAME',
        'COMMIT_VISIT',
        'RESTART_GAME',
        'DRAW_CARD',
        'MARK_FOUL',
        'UPDATE_JOKER'
    ]);

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

    useEffect(() => {
        draftActionsRef.current = draftActions;
    }, [draftActions]);

    useEffect(() => {
        draftActionsRef.current = [];
        setDraftActions([]);
    }, [activeRoom?.id, activeRoom?.status]);

    // Build the GameState object that the UI expects
    let gameState: GameState | null = null;

    if (activeRoom) {
        const baseRoomData = {
            ...activeRoom,
            players: activeRoom.players || []
        };
        let displayRoomData = baseRoomData;
        if (activePlayerId && activeRoom.status === 'PLAYING' && draftActions.length > 0) {
            try {
                displayRoomData = GameEngine.applyVisitActions(baseRoomData, activePlayerId, draftActions);
            } catch {
                displayRoomData = baseRoomData;
            }
        }

        const roomPlayersData = displayRoomData.players || [];
        const matches = activeRoom.matches || [];

        // Sort matches by timestamp to get correct history
        const history = [...matches].sort((a: any, b: any) => a.timestamp - b.timestamp);

        // Find current match settlements (last match played)
        const currentMatchSettlements = history.length > 0
            ? history[history.length - 1].settlements
            : [];

        // Apply turn order if available
        const sortedPlayersData = [...roomPlayersData];

        let turnOrderArr = activeRoom.turnOrder || [];
        // InstantDB JSON arrays are usually returned as arrays, but fallback to Object.values just in case
        if (!Array.isArray(turnOrderArr) && typeof turnOrderArr === 'object') {
            turnOrderArr = Object.values(turnOrderArr);
        }

        if (Array.isArray(turnOrderArr) && turnOrderArr.length > 0) {
            sortedPlayersData.sort((a: any, b: any) => {
                const indexA = turnOrderArr.findIndex((id: any) => String(id) === String(a.id));
                const indexB = turnOrderArr.findIndex((id: any) => String(id) === String(b.id));

                const scoreA = indexA !== -1 ? indexA : 9999;
                const scoreB = indexB !== -1 ? indexB : 9999;

                return scoreA - scoreB;
            });
        }

        gameState = {
            roomId: activeRoom.roomCode || activeRoom.id,
            config: activeRoom.config,
            status: activeRoom.status as GameStatus,
            pottedCards: displayRoomData.pottedCards || [],
            deckCount: displayRoomData.deck ? displayRoomData.deck.length : 0,
            winnerId: activeRoom.winnerId || null,
            stagedVisitActions: draftActions,
            players: sortedPlayersData.map((rp: any) => ({
                id: rp.id,
                profileId: rp.profile?.[0]?.id || rp.profile?.id || null,
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

    const getFreshRoomData = async () => {
        if (!activeRoom?.id) return null;

        const roomLookup = await db.queryOnce({
            rooms: {
                $: { where: { id: activeRoom.id } },
                players: {
                    profile: {}
                },
                matches: {}
            }
        });

        const latestRoom = roomLookup.data?.rooms?.[0];
        if (!latestRoom) return null;

        return {
            ...latestRoom,
            players: latestRoom.players || [],
            matches: latestRoom.matches || [],
        };
    };

    const stageVisitAction = (action: VisitAction) => {
        if (!roomData || roomData.status !== 'PLAYING' || !activePlayerId) return;

        const nextDraftActions = [...draftActions, action];
        GameEngine.applyVisitActions(roomData, activePlayerId, nextDraftActions);
        draftActionsRef.current = nextDraftActions;
        setDraftActions(nextDraftActions);
    };

    const sendMessage = async (msg: ClientMessage) => {
        if (!user) return;
        const shouldLockRemoteAction = remoteActions.has(msg.type);

        if (shouldLockRemoteAction) {
            if (remoteActionInFlightRef.current) return;
            remoteActionInFlightRef.current = true;
        }

        try {
            switch (msg.type) {
                case 'CREATE_ROOM': {
                    const { gameAmount, jokerAmount } = msg.payload;
                    const roomId = id();
                    const playerRecordId = id();
                    const roomCode = generateRoomCode();

                    const profileId = resolvedProfile?.id;
                    if (!profileId) {
                        showAlert('Profile not found. Please set up your profile first.', 'error');
                        return;
                    }

                    await db.transact([
                        tx.rooms[roomId].update({
                            roomCode,
                            status: 'WAITING',
                            config: { gameAmount, jokerAmount },
                            pottedCards: [],
                            deck: [],
                            turnOrder: [],
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
                        showAlert('Profile not found. Please set up your profile first.', 'error');
                        return;
                    }

                    // Look up the room by roomCode
                    const roomLookup = await db.queryOnce({
                        rooms: { $: { where: { roomCode: roomCode.toUpperCase() } } }
                    });
                    const targetRoom = roomLookup.data?.rooms?.[0];
                    if (!targetRoom) {
                        showAlert('Room not found. Please check the code and try again.', 'error');
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
                        await GameEngine.exitRoom(db, roomData, activePlayerId);
                        // Deleting the roomPlayer record removes the link,
                        // so useQuery will stop finding an active room
                    }
                    break;
                }
                // --- Game Engine Logic ---
                case 'START_GAME':
                    if (activeRoom && activePlayerId) {
                        const latestRoomData = await getFreshRoomData();
                        if (latestRoomData) await GameEngine.startGame(db, latestRoomData, activePlayerId);
                    }
                    break;
                case 'DRAW_CARD':
                    if (activeRoom && activePlayerId && activeRoom.status === 'PLAYING') {
                        const latestRoomData = await getFreshRoomData();
                        if (latestRoomData) await GameEngine.commitVisit(db, latestRoomData, activePlayerId, [{ type: 'DRAW_CARD' }]);
                    }
                    break;
                case 'POT_CARD': {
                    const payload = msg.payload as { cardId?: string; rank?: string };
                    if (payload && 'rank' in payload && payload.rank) {
                        if (activeRoom && activePlayerId && activeRoom.status === 'PLAYING') {
                            const latestRoomData = await getFreshRoomData();
                            if (latestRoomData) await GameEngine.commitVisit(db, latestRoomData, activePlayerId, [{ type: 'POT_CARD', payload: msg.payload }]);
                        }
                    } else {
                        stageVisitAction({ type: 'POT_CARD', payload: msg.payload });
                    }
                    break;
                }
                case 'MARK_FOUL':
                    if (activeRoom && activePlayerId && activeRoom.status === 'PLAYING') {
                        const latestRoomData = await getFreshRoomData();
                        if (latestRoomData) await GameEngine.commitVisit(db, latestRoomData, activePlayerId, [{ type: 'MARK_FOUL' }]);
                    }
                    break;
                case 'UPDATE_JOKER':
                    if (activeRoom && activePlayerId && activeRoom.status === 'PLAYING') {
                        const latestRoomData = await getFreshRoomData();
                        if (latestRoomData) await GameEngine.commitVisit(db, latestRoomData, activePlayerId, [{ type: 'UPDATE_JOKER', payload: msg.payload }]);
                    }
                    break;
                case 'UNDO_VISIT_ACTION':
                    draftActionsRef.current = draftActionsRef.current.slice(0, -1);
                    setDraftActions(draftActionsRef.current);
                    break;
                case 'CLEAR_VISIT_DRAFT':
                    draftActionsRef.current = [];
                    setDraftActions([]);
                    break;
                case 'COMMIT_VISIT':
                    if (activeRoom && activePlayerId && draftActionsRef.current.length > 0) {
                        const latestRoomData = await getFreshRoomData();
                        if (latestRoomData) {
                            await GameEngine.commitVisit(db, latestRoomData, activePlayerId, draftActionsRef.current);
                            draftActionsRef.current = [];
                            setDraftActions([]);
                        }
                    }
                    break;
                case 'RESTART_GAME':
                    if (activeRoom && activePlayerId) {
                        const latestRoomData = await getFreshRoomData();
                        if (latestRoomData) await GameEngine.restartGame(db, latestRoomData, activePlayerId);
                    }
                    break;
                case 'RECONNECT':
                    // No-op: with InstantDB, the user's active room is always
                    // derived from the database. Just refreshing the page works.
                    break;
            }
        } catch (e: any) {
            showAlert("Action failed: " + e.message, 'error');
        } finally {
            if (shouldLockRemoteAction) {
                remoteActionInFlightRef.current = false;
            }
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
