import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClientMessage, ServerMessage, GameState } from '@shared/types';

export function useWebSocket() {
    const socketRef = useRef<WebSocket | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Create WebSocket connection.
        // In production, we connect to the same host using wss or ws
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host; // includes port if present
        // Use environment variable for local dev if needed, or just let it fall back
        const wsUrl = import.meta.env.DEV ? 'ws://localhost:3000' : `${protocol}//${host}`;
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to server');
            setIsConnected(true);
            setError(null);

            // Attempt reconnect
            const savedSession = sessionStorage.getItem('poker_session');
            if (savedSession) {
                try {
                    const session = JSON.parse(savedSession);
                    if (session.roomId && session.playerId) {
                        ws.send(JSON.stringify({
                            type: 'RECONNECT',
                            payload: { roomId: session.roomId, playerId: session.playerId }
                        }));
                    }
                } catch (e) {
                    console.error('Invalid session', e);
                }
            }
        };

        ws.onmessage = (event) => {
            try {
                const msg: ServerMessage = JSON.parse(event.data);
                handleServerMessage(msg);
            } catch (e) {
                console.error('Main failed to parse:', e);
            }
        };

        ws.onclose = () => {
            console.log('Disconnected');
            setIsConnected(false);
        };

        ws.onerror = () => {
            setError('Connection failed');
        };

        return () => {
            ws.close();
        };
    }, []);

    const handleServerMessage = useCallback((msg: ServerMessage) => {
        switch (msg.type) {
            case 'ROOM_CREATED':
            case 'JOINED_ROOM':
                setPlayerId(msg.payload.playerId);

                // Save session
                sessionStorage.setItem('poker_session', JSON.stringify({
                    roomId: msg.payload.roomId,
                    playerId: msg.payload.playerId
                }));

                // If it's joined_room, we also get state
                if ('state' in msg.payload) {
                    setGameState(msg.payload.state);
                }
                break;
            case 'GAME_UPDATE':
                setGameState(msg.payload);
                break;
            case 'ROOM_CLOSED':
                console.log('Room closed:', msg.payload.reason);
                sessionStorage.removeItem('poker_session');
                setGameState(null);
                setPlayerId(null);
                // Optional: set an error or toast to explain why
                break;
            case 'ERROR':
                // If error occurs during reconnect (or generally fatal), we might want to clear session if it's invalid
                // For now, just show error. If message is "Room not found" etc., maybe clear.
                if (msg.payload.message === 'Room not found' || msg.payload.message === 'Player not found') {
                    sessionStorage.removeItem('poker_session');
                    setGameState(null); // Go to home
                }
                setError(msg.payload.message);
                setTimeout(() => setError(null), 5000); // Clear error after 5s
                break;
        }
    }, []);

    const sendMessage = useCallback((msg: ClientMessage) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(msg));
        } else {
            console.warn('Socket not connected');
        }
    }, []);

    return { sendMessage, gameState, playerId, error, isConnected };
}
