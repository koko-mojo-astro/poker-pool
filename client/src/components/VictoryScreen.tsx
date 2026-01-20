import type { GameState, ClientMessage } from '@shared/types';
import { useState } from 'react';
import { LeaderboardModal } from './LeaderboardModal';

interface VictoryScreenProps {
    gameState: GameState;
    playerId: string | null;
    sendMessage: (msg: ClientMessage) => void;
}

export function VictoryScreen({ gameState, playerId, sendMessage }: VictoryScreenProps) {
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const winner = gameState.players.find(p => p.id === gameState.winnerId);
    const isWinner = playerId === gameState.winnerId;

    if (!winner) return <div>Invalid Goal State</div>;

    const totalJoker = winner.jokerBalls.direct + winner.jokerBalls.all;
    const totalWinnings = (gameState.payouts?.reduce((acc, curr) => acc + curr.amountToPay, 0) || 0).toFixed(2);

    const handleRestart = () => {
        sendMessage({ type: 'RESTART_GAME' });
    };

    return (
        <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '2rem' }}>
            <h1 className="animate-fade-in" style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(to right, #fbbf24, #d97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                GAME OVER
            </h1>

            <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', textAlign: 'center', border: isWinner ? '2px solid #fbbf24' : '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>WINNER</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '2rem' }}>
                    {winner.name} {isWinner && '(YOU!)'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px' }}>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Direct Joker</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{winner.jokerBalls.direct}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>ALL Joker</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{winner.jokerBalls.all}</div>
                    </div>
                    <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total Joker Multiplier</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>x {totalJoker}</div>
                    </div>
                </div>

                <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Payouts</h3>
                {gameState.payouts?.map(payout => {
                    const player = gameState.players.find(p => p.id === payout.playerId);
                    return (
                        <div key={payout.playerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 'bold' }}>{player?.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Calc: {payout.calculation}</div>
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444' }}>
                                - ${payout.amountToPay.toFixed(2)}
                            </div>
                        </div>
                    );
                })}

                <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid var(--success)' }}>
                    <div style={{ color: 'var(--success)', fontSize: '0.9rem' }}>TOTAL WINNINGS</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--success)' }}>+ ${totalWinnings}</div>
                </div>

                <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={handleRestart} className="btn-primary" style={{ flex: 1 }}>Play Again</button>
                    <button onClick={() => setShowLeaderboard(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', padding: '12px 24px', borderRadius: '12px', color: 'white', fontWeight: 'bold' }}>
                        🏆 Leaderboard
                    </button>
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
