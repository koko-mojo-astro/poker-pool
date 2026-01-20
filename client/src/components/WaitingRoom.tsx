import type { GameState, ClientMessage } from '@shared/types';
import { useState } from 'react';
import { LeaderboardModal } from './LeaderboardModal';

interface WaitingRoomProps {
    gameState: GameState;
    playerId: string | null;
    sendMessage: (msg: ClientMessage) => void;
}

export function WaitingRoom({ gameState, playerId, sendMessage }: WaitingRoomProps) {
    const isCreator = gameState.players.find(p => p.id === playerId)?.isCreator;
    const canStart = gameState.players.length >= 2;
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(window.location.origin + '?room=' + gameState.roomId);
        // TODO: Toast
    };

    const handleStart = () => {
        sendMessage({ type: 'START_GAME' });
    };

    return (
        <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4rem' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '600px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                    <button onClick={() => setShowLeaderboard(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', padding: '8px 16px', borderRadius: '8px', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🏆 Leaderboard
                    </button>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Room Code</h2>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '4px', fontFamily: 'monospace', color: 'var(--primary)' }}>
                            {gameState.roomId}
                        </span>
                        <button
                            onClick={handleCopy}
                            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', padding: '8px', borderRadius: '6px', color: 'var(--text-muted)' }}
                            title="Copy Link"
                        >
                            📋
                        </button>
                    </div>



                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Game Prize</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{gameState.config.gameAmount} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>NZD</span></div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Joker Value</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{gameState.config.jokerAmount} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>NZD</span></div>
                        </div>
                    </div>

                    <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                        Players ({gameState.players.length}/4)
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
                        {gameState.players.map(p => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', marginRight: '1rem' }}>
                                    {p.name.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontSize: '1.1rem', flex: 1 }}>
                                    {p.name} {p.id === playerId && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(You)</span>}
                                </span>
                                {p.isCreator && <span style={{ fontSize: '0.8rem', background: 'var(--primary)', padding: '2px 8px', borderRadius: '12px' }}>HOST</span>}
                            </div>
                        ))}
                        {[...Array(4 - gameState.players.length)].map((_, i) => (
                            <div key={i} style={{ border: '1px dashed var(--glass-border)', padding: '12px', borderRadius: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                Waiting...
                            </div>
                        ))}
                    </div>

                    {
                        isCreator && (
                            <button
                                className="btn-primary"
                                style={{ width: '100%', padding: '16px', fontSize: '1.2rem', opacity: canStart ? 1 : 0.5, cursor: canStart ? 'pointer' : 'not-allowed' }}
                                disabled={!canStart}
                                onClick={handleStart}
                            >
                                {canStart ? 'Start Game' : `Waiting for players (${gameState.players.length}/2 min)`}
                            </button>
                        )
                    }
                    {
                        !isCreator && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Waiting for host to start...
                            </div>
                        )
                    }
                </div >

                {showLeaderboard && (
                    <LeaderboardModal
                        history={gameState.history || []}
                        players={gameState.players}
                        onClose={() => setShowLeaderboard(false)}
                    />
                )}
            </div>
        </div>
    );
}
