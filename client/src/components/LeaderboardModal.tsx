import type { GameResult, Player } from '@shared/types';

interface LeaderboardModalProps {
    history: GameResult[];
    players: Player[];
    onClose: () => void;
}

export function LeaderboardModal({ history, players, onClose }: LeaderboardModalProps) {
    // Sort logic handled by server or client
    // Let's count wins per player
    const stats = history.reduce((acc, result) => {
        acc[result.winnerName] = (acc[result.winnerName] || 0) + 1;
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
        const name = player ? player.name : id.slice(0, 8); // Fallback to ID
        return { id, name, amount };
    }).sort((a, b) => b.amount - a.amount);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }} onClick={onClose}>
            <div className="glass-panel" style={{
                width: '100%',
                maxWidth: '400px',
                position: 'relative',
                maxHeight: '80vh',
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

                <h2 style={{ marginTop: 0, marginBottom: '1.5rem', textAlign: 'center', background: 'linear-gradient(to right, #a78bfa, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Session Ledger</h2>

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
                                background: row.amount > 0 ? 'rgba(16, 185, 129, 0.1)' : (row.amount < 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)'),
                                padding: '12px 16px',
                                borderRadius: '12px',
                                border: row.amount > 0 ? '1px solid var(--success)' : (row.amount < 0 ? '1px solid var(--danger)' : '1px solid var(--glass-border)')
                            }}>
                                <div style={{ fontWeight: 700 }}>{row.name}</div>
                                <div style={{
                                    textAlign: 'right',
                                    fontWeight: 900,
                                    fontSize: '1.1rem',
                                    color: row.amount > 0 ? 'var(--success)' : (row.amount < 0 ? 'var(--danger)' : 'var(--text-muted)')
                                }}>
                                    {row.amount > 0 ? '+' : ''}${row.amount.toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <h2 style={{ marginBottom: '1.5rem', textAlign: 'center', color: 'white', fontSize: '1.2rem', marginTop: '2rem' }}>Win History</h2>

                {sortedStats.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        No games played yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {sortedStats.map(([name, wins], i) => (
                            <div key={name} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: i === 0 ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: i === 0 ? '1px solid var(--primary)' : '1px solid var(--glass-border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        background: i === 0 ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.8rem',
                                        fontWeight: 'bold'
                                    }}>{i + 1}</span>
                                    <span style={{ fontWeight: i === 0 ? 'bold' : 'normal' }}>{name}</span>
                                </div>
                                <div style={{ fontWeight: 'bold', color: i === 0 ? 'var(--accent)' : 'var(--text-main)' }}>
                                    {wins} {wins === 1 ? 'Win' : 'Wins'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '2rem', marginBottom: '1rem' }}>Recent Games</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {history.slice(-5).reverse().map((res, idx) => (
                        <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {res.winnerName} won at {new Date(res.timestamp).toLocaleTimeString()}
                        </div>
                    ))}
                </div>

                <button onClick={onClose} className="btn-primary" style={{ width: '100%', marginTop: '2rem' }}>Close</button>
            </div>
        </div>
    );
}
