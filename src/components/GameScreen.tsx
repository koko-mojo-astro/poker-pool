import React from 'react';
import type { GameState, ClientMessage, Rank } from '../types';
import { Card } from './Card';
import { useToast } from './Toast';
import { useState } from 'react';
import { LeaderboardModal } from './LeaderboardModal';
import { WrongBallPotModal } from './WrongBallPotModal';

interface GameScreenProps {
    gameState: GameState;
    playerId: string | null;
    sendMessage: (msg: ClientMessage) => void | Promise<void>;
}

export function GameScreen({ gameState, playerId, sendMessage }: GameScreenProps) {
    const { showToast } = useToast();
    const myPlayer = gameState.players.find(p => p.id === playerId);
    const otherPlayers = gameState.players.filter(p => p.id !== playerId);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showWrongBallModal, setShowWrongBallModal] = useState(false);
    const [wrongPotRank, setWrongPotRank] = useState<Rank>('A');
    const [isCommittingDraft, setIsCommittingDraft] = useState(false);
    const rankOrder: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const stagedCount = gameState.stagedVisitActions.length;
    const latestDraftAction = stagedCount > 0 ? gameState.stagedVisitActions[stagedCount - 1] : null;

    const commitDraft = async () => {
        if (isCommittingDraft || gameState.stagedVisitActions.length === 0) return;
        setIsCommittingDraft(true);
        try {
            await Promise.resolve(sendMessage({ type: 'COMMIT_VISIT' }));
            showToast('Visit committed.', 'success');
        } finally {
            setIsCommittingDraft(false);
        }
    };

    const handlePot = (cardId: string) => {
        if (isCommittingDraft) return;
        void Promise.resolve(sendMessage({ type: 'POT_CARD', payload: { cardId } }));
        showToast('Added pot to draft.', 'info');
    };

    const ownedRanks = new Set((myPlayer?.hand || []).map(card => card.rank));
    const pottedRanks = new Set(gameState.pottedCards);
    const wrongPotOptions = rankOrder.filter(rank => !ownedRanks.has(rank) && !pottedRanks.has(rank));
    const selectedWrongPotRank = wrongPotOptions.includes(wrongPotRank)
        ? wrongPotRank
        : (wrongPotOptions[0] || 'A');

    const handleWrongBallPot = () => {
        if (isCommittingDraft) return;
        if (!wrongPotOptions.includes(selectedWrongPotRank)) return;
        void Promise.resolve(sendMessage({ type: 'POT_CARD', payload: { rank: selectedWrongPotRank } }));
        const followup = myPlayer?.hasLicense
            ? `Wrong ball ${selectedWrongPotRank} added to draft: foul and penalty will apply on commit.`
            : `Wrong ball ${selectedWrongPotRank} added to draft.`;
        showToast(followup, 'error');
        setShowWrongBallModal(false);
    };

    const handleDraw = () => {
        if (isCommittingDraft) return;
        void Promise.resolve(sendMessage({ type: 'DRAW_CARD' }));
        showToast('Draw added to draft.', 'info');
    };

    const handleFoul = () => {
        if (confirm('Are you sure you want to mark a foul? You will lose your license and draw a card.')) {
            void Promise.resolve(sendMessage({ type: 'MARK_FOUL' }));
            showToast('Foul added to draft.', 'error');
        }
    };

    const handleUpdateJoker = (type: 'direct' | 'all', delta: 1 | -1) => {
        if (isCommittingDraft) return;

        if (delta === -1) {
            const msg = myPlayer.hasLicense
                ? `Decrementing this joker will remove your license and you will draw a penalty card. Continue?`
                : `Decrement ${type.toUpperCase()} joker ball? Continue?`;
            if (!confirm(msg)) return;
        }

        void Promise.resolve(sendMessage({ type: 'UPDATE_JOKER', payload: { type, delta } }));
    };

    const handleUndoLast = () => {
        if (stagedCount === 0 || isCommittingDraft) return;
        void Promise.resolve(sendMessage({ type: 'UNDO_VISIT_ACTION' }));
        showToast('Removed the latest staged action.', 'info');
    };

    const handleClearDraft = () => {
        if (stagedCount === 0 || isCommittingDraft) return;
        void Promise.resolve(sendMessage({ type: 'CLEAR_VISIT_DRAFT' }));
        showToast('Cleared the visit preview.', 'info');
    };

    const formatDraftAction = (action: ClientMessage | { type: string; payload?: unknown }) => {
        switch (action.type) {
            case 'POT_CARD': {
                const payload = action.payload as { cardId?: string; rank?: string } | undefined;
                return payload?.rank ? `Wrong-ball pot ${payload.rank}` : 'Pot card';
            }
            case 'DRAW_CARD':
                return 'Draw card';
            case 'MARK_FOUL':
                return 'Mark foul';
            case 'UPDATE_JOKER': {
                const payload = action.payload as { type: 'direct' | 'all'; delta: 1 | -1 } | undefined;
                const direction = payload?.delta === 1 ? '+1' : '-1';
                return `${payload?.type?.toUpperCase() || 'JOKER'} ${direction}`;
            }
            default:
                return action.type;
        }
    };

    const getSignedJokerColor = (value: number, positiveColor: string) => {
        if (value > 0) return positiveColor;
        if (value < 0) return 'var(--danger)';
        return 'var(--text-muted)';
    };

    if (!myPlayer) return <div>Loading player...</div>;

    return (
        <div className="container">
            {/* Top Bar */}
            <div className="glass-panel" style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem', marginTop: '3.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Live Match</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Room {gameState.roomId}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                            onClick={() => setShowLeaderboard(true)}
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', padding: '8px 10px', borderRadius: '10px', color: 'white', fontSize: '0.85rem', fontWeight: 'bold' }}
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
                                padding: '8px 10px',
                                borderRadius: '10px',
                                color: 'var(--danger)',
                                fontSize: '0.85rem',
                                fontWeight: 'bold'
                            }}
                            title={myPlayer.isCreator ? "Disband Room" : "Leave Room"}
                        >
                            🚪
                        </button>
                    </div>
                </div>

                <div style={{ padding: '10px', background: 'rgba(0,0,0,0.18)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Settlement Order</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {gameState.players.map((p, i) => (
                            <React.Fragment key={p.id}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: p.id === playerId ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255,255,255,0.04)',
                                    padding: '5px 9px',
                                    borderRadius: '999px',
                                    border: p.id === playerId ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid transparent',
                                    fontSize: '0.8rem'
                                }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</span>
                                    <span style={{ fontWeight: 700 }}>{p.id === playerId ? 'You' : p.name}</span>
                                </div>
                                {i < gameState.players.length - 1 && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>→</span>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>

            {/* Shared Table: Potted Cards */}
            <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem', textAlign: 'center', minHeight: '110px' }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '0.9rem', letterSpacing: '0.06em' }}>POTTED CARDS</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                    {gameState.pottedCards.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No cards potted yet</span>
                    ) : (
                        gameState.pottedCards.map((rank, i) => (
                            <div key={i} style={{
                                width: '38px', height: '38px',
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '56px', height: '84px',
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '8px', marginBottom: '1rem' }}>
                {otherPlayers.map(p => (
                    <div key={p.id} className="glass-panel" style={{ padding: '0.7rem', display: 'flex', flexDirection: 'column', minHeight: '118px' }}>
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
                                J: <span style={{ color: getSignedJokerColor(p.jokerBalls.direct, '#fbbf24'), fontWeight: 'bold' }}>{p.jokerBalls.direct}</span> / <span style={{ color: getSignedJokerColor(p.jokerBalls.all, '#a78bfa'), fontWeight: 'bold' }}>{p.jokerBalls.all}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* My Area */}
            <div className="glass-panel" style={{ padding: '0.95rem', border: '1px solid rgba(139, 92, 246, 0.4)', position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', marginBottom: '0.9rem', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>You</span>
                        {myPlayer.hasLicense ? (
                            <span style={{ color: 'var(--success)', background: 'rgba(16, 185, 129, 0.2)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '900', border: '1px solid var(--success)' }}>✓ LICENSED</span>
                        ) : (
                            <span style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.2)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid transparent' }}>✗ NO LICENSE</span>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                        {!myPlayer.hasLicense && (
                            <button onClick={handleDraw} disabled={isCommittingDraft} className="btn-primary" style={{ minHeight: '42px', padding: '10px 12px', fontSize: '0.9rem', opacity: isCommittingDraft ? 0.6 : 1, cursor: isCommittingDraft ? 'not-allowed' : 'pointer' }}>
                                Draw
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (isCommittingDraft) return;
                                setShowWrongBallModal(true);
                            }}
                            disabled={isCommittingDraft}
                            style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.7)',
                                color: 'var(--danger)',
                                borderRadius: '8px',
                                minHeight: '42px',
                                padding: '10px 12px',
                                fontSize: '0.85rem',
                                fontWeight: 800,
                                opacity: isCommittingDraft ? 0.6 : 1,
                                cursor: isCommittingDraft ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Wrong Ball
                        </button>
                        {myPlayer.hasLicense && (
                            <button onClick={handleFoul} disabled={isCommittingDraft} style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '8px', minHeight: '42px', padding: '10px 12px', fontSize: '0.9rem', opacity: isCommittingDraft ? 0.6 : 1, cursor: isCommittingDraft ? 'not-allowed' : 'pointer' }}>
                                Foul
                            </button>
                        )}
                    </div>
                </div>

                {stagedCount > 0 && (
                    <div style={{
                        background: 'rgba(139, 92, 246, 0.15)',
                        border: '1px solid rgba(139, 92, 246, 0.4)',
                        borderRadius: '12px',
                        padding: '10px',
                        marginBottom: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.05em' }}>
                                {stagedCount} ACTION{stagedCount !== 1 ? 'S' : ''} STAGED
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {latestDraftAction ? formatDraftAction(latestDraftAction) : ''}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '8px' }}>
                            <button
                                onClick={handleUndoLast}
                                disabled={isCommittingDraft}
                                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', padding: '8px 4px', fontSize: '0.8rem', fontWeight: 700 }}
                            >
                                Undo
                            </button>
                            <button
                                onClick={handleClearDraft}
                                disabled={isCommittingDraft}
                                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.4)', color: 'var(--danger)', borderRadius: '8px', padding: '8px 4px', fontSize: '0.8rem', fontWeight: 700 }}
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => void commitDraft()}
                                disabled={isCommittingDraft}
                                className="btn-primary"
                                style={{ padding: '8px 4px', fontSize: '0.85rem', fontWeight: 800, opacity: isCommittingDraft ? 0.6 : 1, borderRadius: '8px' }}
                            >
                                Commit
                            </button>
                        </div>
                    </div>
                )}

                {/* My Hand */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    columnGap: '10px',
                    rowGap: '36px',
                    paddingBottom: '45px',
                    paddingTop: '6px',
                    justifyContent: 'center'
                }}>
                    {[...myPlayer.hand].sort((a, b) => {
                        const ranks: Record<string, number> = {
                            'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
                        };
                        return ranks[a.rank] - ranks[b.rank];
                    }).map(card => (
                        <div key={card.id} style={{ margin: '0 4px' }}>
                            <Card card={card} onPot={handlePot} disabled={isCommittingDraft} />
                        </div>
                    ))}
                </div>

                {/* Joker Controls */}
                <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', letterSpacing: '0.05em' }}>DIRECT</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                onClick={() => handleUpdateJoker('direct', -1)}
                                disabled={isCommittingDraft}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', opacity: isCommittingDraft ? 0.6 : 1, cursor: isCommittingDraft ? 'not-allowed' : 'pointer' }}
                            >-</button>
                            <span style={{ fontWeight: '800', fontSize: '1.1rem', minWidth: '2.5rem', textAlign: 'center', color: getSignedJokerColor(myPlayer.jokerBalls.direct, '#fbbf24') }}>{myPlayer.jokerBalls.direct}</span>
                            <button
                                onClick={() => handleUpdateJoker('direct', 1)}
                                disabled={!myPlayer.hasLicense || isCommittingDraft}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)', opacity: (!myPlayer.hasLicense || isCommittingDraft) ? 0.6 : 1, cursor: (!myPlayer.hasLicense || isCommittingDraft) ? 'not-allowed' : 'pointer' }}
                            >+</button>
                        </div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', letterSpacing: '0.05em' }}>ALL</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                onClick={() => handleUpdateJoker('all', -1)}
                                disabled={isCommittingDraft}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', opacity: isCommittingDraft ? 0.6 : 1, cursor: isCommittingDraft ? 'not-allowed' : 'pointer' }}
                            >-</button>
                            <span style={{ fontWeight: '800', fontSize: '1.1rem', minWidth: '2.5rem', textAlign: 'center', color: getSignedJokerColor(myPlayer.jokerBalls.all, '#a78bfa') }}>{myPlayer.jokerBalls.all}</span>
                            <button
                                onClick={() => handleUpdateJoker('all', 1)}
                                disabled={!myPlayer.hasLicense || isCommittingDraft}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)', opacity: (!myPlayer.hasLicense || isCommittingDraft) ? 0.6 : 1, cursor: (!myPlayer.hasLicense || isCommittingDraft) ? 'not-allowed' : 'pointer' }}
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
            {showWrongBallModal && (
                <WrongBallPotModal
                    isLicensed={myPlayer.hasLicense}
                    options={wrongPotOptions}
                    selectedRank={selectedWrongPotRank}
                    onSelect={setWrongPotRank}
                    onClose={() => setShowWrongBallModal(false)}
                    onConfirm={handleWrongBallPot}
                />
            )}
        </div>
    );
}
