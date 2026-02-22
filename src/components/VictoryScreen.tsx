import type { GameState, ClientMessage } from '../types';
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
    const settlements = gameState.settlements || [];

    if (!winner) return <div>Invalid Goal State</div>;

    const getPlayerName = (id: string) => {
        const p = gameState.players.find(pl => pl.id === id);
        return p ? p.name : id.slice(0, 8);
    };

    // My match settlements: where I pay or receive in THIS match
    const myPayments = settlements.filter(s => s.fromPlayerId === playerId);
    const myReceipts = settlements.filter(s => s.toPlayerId === playerId);
    const otherSettlements = settlements.filter(s => s.fromPlayerId !== playerId && s.toPlayerId !== playerId);

    const myTotalPay = myPayments.reduce((sum, s) => sum + s.amount, 0);
    const myTotalReceive = myReceipts.reduce((sum, s) => sum + s.amount, 0);
    const myNet = myTotalReceive - myTotalPay;

    // Total session net for me
    const myTotalSessionNet = (gameState.totalSettlements || {})[playerId || ''] || 0;

    const handleRestart = () => {
        sendMessage({ type: 'RESTART_GAME' });
    };

    return (
        <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '2rem', paddingBottom: '4rem' }}>
            <h1 className="animate-fade-in" style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(to right, #fbbf24, #d97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                GAME OVER
            </h1>

            <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', textAlign: 'center', border: isWinner ? '2px solid #fbbf24' : '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>WINNER</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '2rem' }}>
                    {winner.name} {isWinner && '(YOU!)'}
                </div>

                {/* All Players' Joker Stats */}
                <div style={{ marginBottom: '2rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginBottom: '0.75rem' }}>Player Stats</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '4px', fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', padding: '0 8px 6px', textTransform: 'uppercase' }}>
                        <div>Player</div>
                        <div style={{ textAlign: 'center' }}>Direct J</div>
                        <div style={{ textAlign: 'center' }}>All J</div>
                        <div style={{ textAlign: 'center' }}>Cards</div>
                    </div>
                    {gameState.players.map(p => (
                        <div key={p.id} style={{
                            display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '4px',
                            alignItems: 'center', padding: '8px',
                            background: p.id === gameState.winnerId ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.03)',
                            borderRadius: '8px', marginBottom: '4px',
                            border: p.id === gameState.winnerId ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid transparent'
                        }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                {p.name} {p.id === gameState.winnerId && '👑'}
                                {p.id === playerId && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}> (You)</span>}
                            </div>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', color: p.jokerBalls.direct > 0 ? '#fbbf24' : 'var(--text-muted)' }}>{p.jokerBalls.direct}</div>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', color: p.jokerBalls.all > 0 ? '#a78bfa' : 'var(--text-muted)' }}>{p.jokerBalls.all}</div>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', color: p.cardCount === 0 ? 'var(--success)' : 'var(--text-muted)' }}>{p.cardCount}</div>
                        </div>
                    ))}
                </div>

                {/* MY SETTLEMENT SECTION */}
                <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    {isWinner ? '💰 This Match Earnings' : '📋 This Match Settlement'}
                </h3>

                {isWinner ? (
                    // Winner view: show who pays you
                    <>
                        {myReceipts.map(s => (
                            <SettlementRow
                                key={s.fromPlayerId}
                                label={`From ${getPlayerName(s.fromPlayerId)}`}
                                amount={s.amount}
                                breakdown={s.breakdown}
                                isPositive={true}
                            />
                        ))}
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid var(--success)' }}>
                            <div style={{ color: 'var(--success)', fontSize: '0.9rem' }}>MATCH EARNINGS</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--success)' }}>+ ${myTotalReceive.toFixed(2)}</div>
                        </div>
                    </>
                ) : (
                    // Loser view: show who you pay and who pays you
                    <>
                        {myPayments.map(s => (
                            <SettlementRow
                                key={s.toPlayerId}
                                label={`You → ${getPlayerName(s.toPlayerId)}`}
                                amount={s.amount}
                                breakdown={s.breakdown}
                                isPositive={false}
                            />
                        ))}
                        {myReceipts.map(s => (
                            <SettlementRow
                                key={s.fromPlayerId}
                                label={`${getPlayerName(s.fromPlayerId)} → You`}
                                amount={s.amount}
                                breakdown={s.breakdown}
                                isPositive={true}
                            />
                        ))}
                        <div style={{
                            marginTop: '1rem', padding: '1rem', borderRadius: '12px',
                            background: myNet >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${myNet >= 0 ? 'var(--success)' : 'var(--danger)'}`
                        }}>
                            <div style={{ color: myNet >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '0.9rem' }}>MATCH NET</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: myNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {myNet >= 0 ? '+' : '-'} ${Math.abs(myNet).toFixed(2)}
                            </div>
                        </div>
                    </>
                )}

                {/* TOTAL SESSION NET */}
                <div style={{
                    marginTop: '2rem', padding: '1rem', borderRadius: '12px',
                    background: myTotalSessionNet >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `2px solid ${myTotalSessionNet >= 0 ? 'var(--success)' : 'var(--danger)'}`,
                    boxShadow: myTotalSessionNet >= 0 ? '0 0 15px rgba(16, 185, 129, 0.2)' : '0 0 15px rgba(239, 68, 68, 0.2)'
                }}>
                    <div style={{ color: myTotalSessionNet >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Total Session Balance
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: myTotalSessionNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {myTotalSessionNet >= 0 ? '+' : '-'} ${Math.abs(myTotalSessionNet).toFixed(2)}
                    </div>
                </div>

                {/* OTHER SETTLEMENTS */}
                {otherSettlements.length > 0 && (
                    <>
                        <h3 style={{ marginTop: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                            Other Settlements
                        </h3>
                        {otherSettlements.map(s => (
                            <div key={`${s.fromPlayerId}-${s.toPlayerId}`} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '0.4rem',
                                opacity: 0.7
                            }}>
                                <div style={{ fontSize: '0.85rem' }}>
                                    {getPlayerName(s.fromPlayerId)} → {getPlayerName(s.toPlayerId)}
                                </div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                                    ${s.amount.toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </>
                )}

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

function SettlementRow({ label, amount, breakdown, isPositive }: {
    label: string;
    amount: number;
    breakdown: string;
    isPositive: boolean;
}) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px',
            background: isPositive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            borderRadius: '8px', marginBottom: '0.5rem',
            border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
        }}>
            <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{breakdown}</div>
            </div>
            <div style={{
                fontSize: '1.2rem', fontWeight: 'bold',
                color: isPositive ? 'var(--success)' : '#ef4444'
            }}>
                {isPositive ? '+' : '-'} ${amount.toFixed(2)}
            </div>
        </div>
    );
}
