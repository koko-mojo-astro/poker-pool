import type { GameResult, Player } from '../types';
import { useState } from 'react';

interface LeaderboardModalProps {
    history: GameResult[];
    players: Player[];
    onClose: () => void;
}

export function LeaderboardModal({ history, players, onClose }: LeaderboardModalProps) {
    const [expandedGame, setExpandedGame] = useState<number | null>(null);

    const getPlayerName = (id: string) => {
        if (!id) return 'Unknown';
        const p = players.find(pl => pl.id === id);
        return p ? p.name : id.slice(0, 8);
    };

    // Count wins per player
    const stats = history.reduce((acc, result) => {
        const pName = getPlayerName(result.winnerId);
        acc[pName] = (acc[pName] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);

    // Calculate Net Settlement from History
    const netBalances: Record<string, number> = {};
    history.forEach(game => {
        if (game.netChanges) {
            Object.entries(game.netChanges).forEach(([playerId, amount]) => {
                netBalances[playerId] = (netBalances[playerId] || 0) + amount;
            });
        }
    });

    // Create a list of players for settlement
    const settlementRows = Object.entries(netBalances).map(([id, amount]) => {
        const player = players.find(p => p.id === id);
        const name = player ? player.name : id.slice(0, 8);
        return { id, name, amount };
    }).sort((a, b) => b.amount - a.amount);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'var(--bg-dark)',
            backgroundImage: `radial-gradient(at 0% 0%, rgba(139, 92, 246, 0.1) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(236, 72, 153, 0.1) 0px, transparent 50%)`,
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }} onClick={onClose}>
            <div className="glass-panel" style={{
                width: '100%',
                maxWidth: '600px',
                position: 'relative',
                maxHeight: '90vh',
                overflowY: 'auto'
            }} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '1.5rem',
                    cursor: 'pointer'
                }}>&times;</button>

                <h2 style={{ marginTop: 0, marginBottom: '1.5rem', textAlign: 'center', background: 'linear-gradient(to right, #fbbf24, #ff9900)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.8rem', fontWeight: 800 }}>Session Ledger</h2>

                {/* Net Balances */}
                {settlementRows.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', border: '1px dashed var(--glass-border)', borderRadius: '12px', marginBottom: '2rem' }}>
                        No financial data yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', padding: '0 10px', textTransform: 'uppercase' }}>
                            <div>Player</div>
                            <div style={{ textAlign: 'right' }}>Net Balance</div>
                        </div>
                        {settlementRows.map((row) => (
                            <div key={row.id} style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px',
                                alignItems: 'center',
                                background: row.amount > 0 ? 'rgba(16, 185, 129, 0.08)' : (row.amount < 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.03)'),
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: row.amount > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : (row.amount < 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--glass-border)')
                            }}>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{row.name}</div>
                                <div style={{
                                    textAlign: 'right',
                                    fontWeight: 900,
                                    fontSize: '1.1rem',
                                    color: row.amount > 0 ? 'var(--success)' : (row.amount < 0 ? 'var(--danger)' : 'var(--text-muted)')
                                }}>
                                    {row.amount > 0 ? '+' : (row.amount < 0 ? '-' : '')}${Math.abs(row.amount).toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Win History */}
                <h2 style={{ marginBottom: '1.5rem', textAlign: 'center', color: 'var(--text-main)', fontSize: '1.2rem', marginTop: '2rem', fontWeight: 700 }}>Win History</h2>

                {sortedStats.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        No games played yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {sortedStats.map(([name, wins], i) => (
                            <div key={name} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: i === 0 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.03)',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: i === 0 ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid transparent'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        background: i === 0 ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                                        color: i === 0 ? '#000' : 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.8rem',
                                        fontWeight: 'bold'
                                    }}>{i + 1}</span>
                                    <span style={{ fontWeight: i === 0 ? 'bold' : 'normal', fontSize: '0.95rem' }}>{name}</span>
                                </div>
                                <div style={{ fontWeight: 'bold', color: i === 0 ? '#fbbf24' : 'var(--text-main)' }}>
                                    {wins} {wins === 1 ? 'Win' : 'Wins'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Game Detail History */}
                <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '2rem', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>Game Details</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {history.slice().reverse().map((res, idx) => {
                        const originalIdx = history.length - 1 - idx;
                        const isExpanded = expandedGame === originalIdx;

                        return (
                            <div key={idx}>
                                <div
                                    onClick={() => setExpandedGame(isExpanded ? null : originalIdx)}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        fontSize: '0.85rem', color: 'var(--text-main)',
                                        padding: '12px 16px',
                                        background: isExpanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                                        borderRadius: isExpanded ? '8px 8px 0 0' : '8px',
                                        border: '1px solid var(--glass-border)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>👑</span>
                                        <span style={{ fontWeight: 'bold' }}>{getPlayerName(res.winnerId)}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                            {new Date(res.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
                                </div>

                                {isExpanded && (
                                    <GameDetailPanel
                                        result={res}
                                        getPlayerName={getPlayerName}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                <button onClick={onClose} className="btn-primary" style={{ width: '100%', marginTop: '2rem' }}>Close</button>
            </div>
        </div>
    );
}

function GameDetailPanel({ result, getPlayerName }: {
    result: GameResult;
    getPlayerName: (id: string) => string;
}) {
    const snapshots = result.playerSnapshots || [];
    const settlements = result.settlements || [];

    return (
        <div style={{
            background: 'rgba(0,0,0,0.3)', padding: '12px',
            borderRadius: '0 0 10px 10px',
            border: '1px solid var(--glass-border)',
            borderTop: 'none'
        }}>
            {/* Player Stats Table */}
            {snapshots.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '6px', letterSpacing: '0.05em' }}>Player Stats</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '2px', fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', padding: '0 6px 4px', textTransform: 'uppercase' }}>
                        <div>Player</div>
                        <div style={{ textAlign: 'center' }}>Direct J</div>
                        <div style={{ textAlign: 'center' }}>All J</div>
                        <div style={{ textAlign: 'center' }}>Cards</div>
                    </div>
                    {snapshots.map(snap => (
                        <div key={snap.id} style={{
                            display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '2px',
                            alignItems: 'center', padding: '5px 6px',
                            background: snap.id === result.winnerId ? 'rgba(251, 191, 36, 0.08)' : 'transparent',
                            borderRadius: '4px', marginBottom: '2px',
                            fontSize: '0.8rem'
                        }}>
                            <div style={{ fontWeight: 600 }}>
                                {(() => {
                                    const currentName = getPlayerName(snap.id);
                                    // If player is in room and has a valid name, use it.
                                    if (currentName !== snap.id.slice(0, 8) && currentName !== 'Unknown' && currentName !== 'Player') {
                                        return currentName;
                                    }
                                    // Fallback to snapshot name if valid
                                    if (snap.name && snap.name !== 'Player' && snap.name !== 'Unknown') {
                                        return snap.name;
                                    }
                                    // Absolute fallback
                                    return currentName;
                                })()} {snap.id === result.winnerId && '👑'}
                            </div>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', color: snap.directJ > 0 ? '#fbbf24' : 'var(--text-muted)' }}>{snap.directJ}</div>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', color: snap.allJ > 0 ? '#a78bfa' : 'var(--text-muted)' }}>{snap.allJ}</div>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', color: snap.cardCount === 0 ? 'var(--success)' : 'var(--text-muted)' }}>{snap.cardCount}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Settlements */}
            {settlements.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '6px', letterSpacing: '0.05em' }}>Settlements</div>
                    {settlements.map((s, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '4px 6px', fontSize: '0.8rem', marginBottom: '2px'
                        }}>
                            <div style={{ color: 'var(--text-main)' }}>
                                {getPlayerName(s.fromPlayerId)} → {getPlayerName(s.toPlayerId)}
                            </div>
                            <div style={{ fontWeight: 'bold', color: '#ef4444' }}>
                                ${s.amount.toFixed(2)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Net Changes */}
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px', letterSpacing: '0.05em' }}>Net Result</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.entries(result.netChanges || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([id, amount]) => (
                            <span key={id} style={{
                                fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px',
                                background: amount > 0 ? 'rgba(16, 185, 129, 0.15)' : (amount < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)'),
                                color: amount > 0 ? 'var(--success)' : (amount < 0 ? 'var(--danger)' : 'var(--text-muted)'),
                                fontWeight: 'bold'
                            }}>
                                {getPlayerName(id)}: {amount > 0 ? '+' : ''}${amount.toFixed(2)}
                            </span>
                        ))}
                </div>
            </div>
        </div>
    );
}
