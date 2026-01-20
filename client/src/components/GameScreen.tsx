import React from 'react';
import type { GameState, ClientMessage } from '@shared/types';
import { Card } from './Card';
import { useToast } from './Toast';
import { useState } from 'react';
import { LeaderboardModal } from './LeaderboardModal';

interface GameScreenProps {
    gameState: GameState;
    playerId: string | null;
    sendMessage: (msg: ClientMessage) => void;
}

export function GameScreen({ gameState, playerId, sendMessage }: GameScreenProps) {
    const { showToast } = useToast();
    const myPlayer = gameState.players.find(p => p.id === playerId);
    const otherPlayers = gameState.players.filter(p => p.id !== playerId);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    const handlePot = (cardId: string) => {
        sendMessage({ type: 'POT_CARD', payload: { cardId } });
        showToast('Potting card...', 'info');
    };

    const handleDraw = () => {
        sendMessage({ type: 'DRAW_CARD' });
    };

    const handleFoul = () => {
        if (confirm('Are you sure you want to mark a foul? You will lose your license and draw a card.')) {
            sendMessage({ type: 'MARK_FOUL' });
            showToast('Foul marked! License lost.', 'error');
        }
    };

    const handleUpdateJoker = (type: 'direct' | 'all', delta: 1 | -1) => {
        sendMessage({ type: 'UPDATE_JOKER', payload: { type, delta } });
    };

    if (!myPlayer) return <div>Loading player...</div>;

    return (
        <div className="container" style={{ paddingBottom: '3rem' }}>
            {/* Top Bar */}
            <div className="glass-panel" style={{ padding: '0.8rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                    <div>Room: <strong>{gameState.roomId}</strong></div>
                    <div>Game: <strong>${gameState.config.gameAmount}</strong></div>
                    <div>Joker: <strong>${gameState.config.jokerAmount}</strong></div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setShowLeaderboard(true)}
                            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', padding: '4px 8px', borderRadius: '4px', color: 'white', fontSize: '0.75rem', fontWeight: 'bold' }}
                            title="Leaderboard"
                        >
                            🏆
                        </button>
                        <button
                            onClick={() => {
                                const msg = myPlayer.isCreator ? 'Exit & disband room?' : 'Leave the current game?';
                                if (confirm(msg)) {
                                    sendMessage({ type: 'EXIT_ROOM' });
                                }
                            }}
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid var(--danger)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                color: 'var(--danger)',
                                fontSize: '0.75rem',
                                fontWeight: 'bold'
                            }}
                            title={myPlayer.isCreator ? "Disband Room" : "Leave Room"}
                        >
                            🚪
                        </button>
                    </div>
                </div>

                <div style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>Turn Order Sequence</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        {gameState.players.map((p, i) => (
                            <React.Fragment key={p.id}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: p.id === playerId ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    border: p.id === playerId ? '1px solid var(--primary)' : '1px solid transparent'
                                }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>{i + 1}.</span>
                                    <span style={{ fontWeight: p.id === playerId ? 'bold' : 'normal', color: p.id === playerId ? 'white' : 'var(--text-main)' }}>{p.name} {p.id === playerId && '(You)'}</span>
                                </div>
                                {i < gameState.players.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>

            {/* Shared Table: Potted Cards */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center', minHeight: '120px' }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>POTTED CARDS</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                    {gameState.pottedCards.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No cards potted yet</span>
                    ) : (
                        gameState.pottedCards.map((rank, i) => (
                            <div key={i} style={{
                                width: '40px', height: '40px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 'bold', border: '1px solid var(--glass-border)'
                            }}>
                                {rank}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Shared Table: Deck & Info */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '60px', height: '90px',
                        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                        border: '2px solid var(--glass-border)',
                        borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 0.5rem auto'
                    }}>
                        <span style={{ fontSize: '1.5rem' }}>🂠</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{gameState.deckCount} cards left</div>
                </div>
            </div>

            {/* Other Players */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '1.5rem' }}>
                {otherPlayers.map(p => (
                    <div key={p.id} className="glass-panel" style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>

                        {/* Face-down cards representation */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflowX: 'auto', padding: '2px 0', marginBottom: '0.5rem' }}>
                            {Array.from({ length: p.cardCount }).map((_, i) => (
                                <div key={i} style={{
                                    width: '14px', height: '20px',
                                    background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                                    borderRadius: '2px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    flexShrink: 0,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                }} />
                            ))}
                            {p.cardCount === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Out of cards</span>}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                            {p.hasLicense ? (
                                <span style={{ color: 'var(--success)', fontSize: '0.7rem', fontWeight: 'bold' }}>✓ LIC</span>
                            ) : (
                                <span style={{ color: 'var(--danger)', fontSize: '0.7rem' }}>✗ NO LIC</span>
                            )}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                J: <span style={{ color: 'white', fontWeight: 'bold' }}>{p.jokerBalls.direct}</span> / <span style={{ color: 'white', fontWeight: 'bold' }}>{p.jokerBalls.all}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* My Area */}
            <div className="glass-panel" style={{ padding: '1rem', border: '1px solid var(--primary)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>You</span>
                        {myPlayer.hasLicense ? (
                            <span style={{ color: 'var(--success)', background: 'rgba(16, 185, 129, 0.2)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '900', border: '1px solid var(--success)' }}>✓ LICENSED</span>
                        ) : (
                            <span style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.2)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid transparent' }}>✗ NO LICENSE</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleDraw} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                            Draw
                        </button>
                        {myPlayer.hasLicense && (
                            <button onClick={handleFoul} style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '8px', padding: '8px 16px', fontSize: '0.9rem' }}>
                                Foul
                            </button>
                        )}
                    </div>
                </div>

                {/* My Hand */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    overflowX: 'auto',
                    paddingBottom: '25px',
                    paddingTop: '10px',
                    justifyContent: myPlayer.hand.length < 4 ? 'center' : 'flex-start',
                    WebkitOverflowScrolling: 'touch'
                }}>
                    {myPlayer.hand.map(card => (
                        <div key={card.id} style={{ margin: '0 4px' }}>
                            <Card card={card} onPot={handlePot} disabled={false} />
                        </div>
                    ))}
                </div>

                {/* Joker Controls */}
                <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', letterSpacing: '0.05em' }}>DIRECT</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                onClick={() => handleUpdateJoker('direct', -1)}
                                disabled={myPlayer.jokerBalls.direct <= 0}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}
                            >-</button>
                            <span style={{ fontWeight: '800', fontSize: '1.1rem', minWidth: '1.2rem', textAlign: 'center' }}>{myPlayer.jokerBalls.direct}</span>
                            <button
                                onClick={() => handleUpdateJoker('direct', 1)}
                                disabled={!myPlayer.hasLicense}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}
                            >+</button>
                        </div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', letterSpacing: '0.05em' }}>ALL</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                onClick={() => handleUpdateJoker('all', -1)}
                                disabled={myPlayer.jokerBalls.all <= 0}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}
                            >-</button>
                            <span style={{ fontWeight: '800', fontSize: '1.1rem', minWidth: '1.2rem', textAlign: 'center' }}>{myPlayer.jokerBalls.all}</span>
                            <button
                                onClick={() => handleUpdateJoker('all', 1)}
                                disabled={!myPlayer.hasLicense}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}
                            >+</button>
                        </div>
                    </div>
                </div>
            </div>

            {showLeaderboard && (
                <LeaderboardModal
                    history={gameState.history || []}
                    players={gameState.players}
                    onClose={() => setShowLeaderboard(false)}
                />
            )}
        </div>
    );
}
