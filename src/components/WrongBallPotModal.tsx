import type { Rank } from '../types';

interface WrongBallPotModalProps {
    isLicensed: boolean;
    options: Rank[];
    selectedRank: Rank;
    onSelect: (rank: Rank) => void;
    onClose: () => void;
    onConfirm: () => void;
}

export function WrongBallPotModal({
    isLicensed,
    options,
    selectedRank,
    onSelect,
    onClose,
    onConfirm
}: WrongBallPotModalProps) {
    const rankOrder: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const selectableRanks = rankOrder.filter((rank) => options.includes(rank));

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'var(--bg-dark)',
            backgroundImage: 'radial-gradient(at 0% 0%, rgba(239, 68, 68, 0.12) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.1) 0px, transparent 50%)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }} onClick={onClose}>
            <div className="glass-panel" style={{
                width: '100%',
                maxWidth: '500px',
                position: 'relative',
                maxHeight: '90vh',
                overflowY: 'auto'
            }} onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '1.5rem',
                    cursor: 'pointer'
                }} aria-label="Close wrong ball modal">&times;</button>

                <h2 style={{
                    marginTop: 0,
                    marginBottom: '0.7rem',
                    textAlign: 'center',
                    color: 'var(--danger)',
                    fontSize: '1.2rem',
                    fontWeight: 800
                }}>
                    WRONG-BALL POT
                </h2>
                <p style={{
                    marginTop: 0,
                    marginBottom: '1.2rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    fontSize: '0.85rem'
                }}>
                    {isLicensed
                        ? 'This is treated as a foul: your license will be revoked and you will draw one penalty card.'
                        : 'This will not grant license and will draw one penalty card.'}
                </p>

                {selectableRanks.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        padding: '1rem',
                        border: '1px dashed var(--glass-border)',
                        borderRadius: '10px'
                    }}>
                        No eligible wrong-ball ranks left.
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                        gap: '8px',
                        marginBottom: '1.2rem'
                    }}>
                        {selectableRanks.map((rank) => {
                            const active = rank === selectedRank;
                            return (
                                <button
                                    key={rank}
                                    onClick={() => onSelect(rank)}
                                    style={{
                                        borderRadius: '10px',
                                        border: active ? '1px solid var(--danger)' : '1px solid var(--glass-border)',
                                        background: active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                                        color: 'var(--text-main)',
                                        fontWeight: 800,
                                        fontSize: '0.9rem',
                                        padding: '10px 0',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {rank}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-main)',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            fontWeight: 700
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={selectableRanks.length === 0}
                        style={{
                            flex: 1,
                            background: 'var(--danger)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            fontWeight: 800,
                            opacity: selectableRanks.length === 0 ? 0.5 : 1,
                            cursor: selectableRanks.length === 0 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Pot Wrong Ball
                    </button>
                </div>
            </div>
        </div>
    );
}
