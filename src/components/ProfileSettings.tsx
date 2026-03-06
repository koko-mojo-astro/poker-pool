/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { db } from '../lib/db';
import { id, tx } from '@instantdb/react';

interface Props {
    isInitialSetup?: boolean;
    onComplete?: () => void;
}

export const ProfileSettings: React.FC<Props> = ({ isInitialSetup, onComplete }) => {
    const { user } = db.useAuth();

    // We need the profile, and we also need matches where this profile is a player.
    const { data, isLoading } = db.useQuery(user ? {
        $users: {
            $: { where: { id: user.id } },
            profile: {
                matches: {
                    players: {} // Fetch all players (profiles) in the match to get their current names
                }
            }
        }
    } : null);

    const profileData = data?.$users?.[0]?.profile as any;
    const existingProfile = Array.isArray(profileData) ? profileData[0] : profileData;
    const [displayName, setDisplayName] = useState('');
    const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        if (existingProfile) {
            setDisplayName(existingProfile.displayName);
        } else if (user?.email && isInitialSetup) {
            setDisplayName(user.email.split('@')[0]);
        }
    }, [existingProfile, user, isInitialSetup]);

    const handleSave = async () => {
        if (!displayName.trim() || !user) return;

        setIsSaving(true);
        setShowSuccess(false);

        try {
            if (existingProfile) {
                await db.transact(tx.profiles[existingProfile.id].update({ displayName }));
            } else {
                const profileId = id();
                await db.transact([
                    tx.profiles[profileId].update({ displayName }),
                    tx.profiles[profileId].link({ user: user.id })
                ]);
            }

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);

            if (onComplete && isInitialSetup) onComplete();
        } catch (e: any) {
            alert('Error saving profile: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return (
        <div style={{ padding: 'var(--gap-xl)', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
            <div className="animate-fade-in" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        </div>
    );

    const matches = existingProfile?.matches || [];

    // Group matches by roomCode
    const groupedMatches = matches.reduce((acc: any, match: any) => {
        const code = match.roomCode || 'unknown';
        if (!acc[code]) acc[code] = [];
        acc[code].push(match);
        return acc;
    }, {} as Record<string, any[]>);

    // Sort sessions by newest match first
    const sortedSessionCodes = Object.keys(groupedMatches).sort((a, b) => {
        const newestA = Math.max(...groupedMatches[a].map((m: any) => m.timestamp));
        const newestB = Math.max(...groupedMatches[b].map((m: any) => m.timestamp));
        return newestB - newestA;
    });

    return (
        <div style={{ padding: '0 0 var(--gap-xl) 0' }}>
            <div className="glass-panel animate-fade-in" style={{ marginBottom: 'var(--gap-xl)' }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    marginBottom: 'var(--gap-sm)',
                    color: 'var(--text-main)',
                    textAlign: 'center'
                }}>
                    {isInitialSetup ? 'Welcome!' : 'Profile Details'}
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--gap-xl)', textAlign: 'center' }}>
                    {isInitialSetup ? "Please choose a game name before you start playing." : "Update your game name and review past matches."}
                </p>

                <div style={{ textAlign: 'left', marginBottom: 'var(--gap-lg)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--gap-xs)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Display Name</label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="e.g. TMKK"
                    />
                </div>

                <div style={{ display: 'flex', gap: 'var(--gap-md)' }}>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={isSaving || !displayName.trim() || displayName === existingProfile?.displayName}
                        style={{ flex: 1, height: '48px', position: 'relative' }}
                    >
                        {isSaving ? 'Saving...' : 'Save Name'}
                    </button>
                    {!isInitialSetup && onComplete && (
                        <button onClick={onComplete} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--glass-border)', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            Close
                        </button>
                    )}
                </div>

                {showSuccess && (
                    <div className="animate-fade-in" style={{
                        marginTop: 'var(--gap-md)',
                        color: 'var(--success)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                    }}>
                        <span>✓</span> Profile updated successfully!
                    </div>
                )}
            </div>

            {!isInitialSetup && (
                <div className="glass-panel animate-fade-in">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--gap-lg)', color: 'var(--text-main)', borderBottom: '1px solid var(--glass-border)', paddingBottom: 'var(--gap-sm)' }}>
                        Match History
                    </h2>

                    {matches.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--gap-xl) 0' }}>
                            No matches found. Play some games!
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
                            {sortedSessionCodes.map((code) => {
                                const sessionMatches = [...groupedMatches[code]].sort((a, b) => b.timestamp - a.timestamp);
                                const firstMatchDate = new Date(sessionMatches[sessionMatches.length - 1].timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

                                return (
                                    <div key={code} style={{ marginBottom: 'var(--gap-sm)' }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: 'var(--gap-sm)',
                                            padding: '0 var(--gap-xs)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '1.1rem' }}>📅</span>
                                                <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                                    Session: <span style={{ fontFamily: 'monospace', color: 'var(--primary)', letterSpacing: '1px' }}>{code.toUpperCase()}</span>
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{firstMatchDate}</span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {sessionMatches.map((match: any) => {
                                                const isExpanded = expandedMatch === match.id;
                                                const timeStr = new Date(match.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                                return (
                                                    <div key={match.id} style={{
                                                        borderRadius: '8px',
                                                        overflow: 'hidden',
                                                        border: '1px solid var(--glass-border)'
                                                    }}>
                                                        <div
                                                            onClick={() => setExpandedMatch(isExpanded ? null : match.id)}
                                                            style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                padding: '12px 14px',
                                                                background: isExpanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                                                                cursor: 'pointer',
                                                                transition: 'background 0.2s'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <span style={{ fontSize: '0.9rem' }}>👑</span>
                                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>{match.winnerName}</span>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{timeStr}</span>
                                                            </div>
                                                            <span style={{
                                                                color: 'var(--text-muted)',
                                                                fontSize: '0.8rem',
                                                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                                                transition: 'transform 0.2s'
                                                            }}>▼</span>
                                                        </div>

                                                        {isExpanded && (
                                                            <div style={{
                                                                background: 'rgba(0,0,0,0.2)',
                                                                padding: '12px',
                                                                borderTop: '1px solid var(--glass-border)'
                                                            }}>
                                                                {/* Stats Table */}
                                                                <div style={{ marginBottom: '12px' }}>
                                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px', letterSpacing: '0.05em' }}>Player Stats</div>
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '4px', fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', padding: '0 6px 4px', textTransform: 'uppercase' }}>
                                                                        <div>Player</div>
                                                                        <div style={{ textAlign: 'center' }}>Direct J</div>
                                                                        <div style={{ textAlign: 'center' }}>All J</div>
                                                                        <div style={{ textAlign: 'center' }}>Cards</div>
                                                                    </div>
                                                                    {match.playerSnapshots?.map((snap: any) => (
                                                                        <div key={snap.id} style={{
                                                                            display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '4px',
                                                                            alignItems: 'center', padding: '6px',
                                                                            background: snap.id === match.winnerId ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                                                            borderRadius: '6px', marginBottom: '2px', fontSize: '0.8rem'
                                                                        }}>
                                                                            <div style={{ fontWeight: 600 }}>
                                                                                {snap.name} {snap.id === match.winnerId && '👑'}
                                                                            </div>
                                                                            <div style={{ textAlign: 'center', fontWeight: 800, color: snap.directJ > 0 ? '#fbbf24' : 'var(--text-muted)' }}>{snap.directJ}</div>
                                                                            <div style={{ textAlign: 'center', fontWeight: 800, color: snap.allJ > 0 ? '#a78bfa' : 'var(--text-muted)' }}>{snap.allJ}</div>
                                                                            <div style={{ textAlign: 'center', fontWeight: 800, color: snap.cardCount === 0 ? 'var(--success)' : 'var(--text-muted)' }}>{snap.cardCount}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Settlements */}
                                                                {match.settlements?.length > 0 && (
                                                                    <div style={{ marginBottom: '12px' }}>
                                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.05em' }}>Settlements</div>
                                                                        {match.settlements.map((s: any, idx: number) => (
                                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', fontSize: '0.8rem' }}>
                                                                                <span style={{ color: 'var(--text-main)' }}>
                                                                                    {match.playerSnapshots?.find((p: any) => p.id === s.fromPlayerId)?.name || 'Unknown'} → {match.playerSnapshots?.find((p: any) => p.id === s.toPlayerId)?.name || 'Unknown'}
                                                                                </span>
                                                                                <span style={{ fontWeight: 800, color: 'var(--danger)' }}>${s.amount.toFixed(2)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Net Changes */}
                                                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.05em' }}>Net Profit/Loss</div>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                        {Object.entries(match.netChanges || {}).sort((a: any, b: any) => b[1] - a[1]).map(([pid, amount]: [string, any]) => (
                                                                            <span key={pid} style={{
                                                                                fontSize: '0.7rem', padding: '3px 8px', borderRadius: '6px',
                                                                                background: amount > 0 ? 'rgba(16, 185, 129, 0.1)' : (amount < 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)'),
                                                                                color: amount > 0 ? 'var(--success)' : (amount < 0 ? 'var(--danger)' : 'var(--text-muted)'),
                                                                                fontWeight: 800
                                                                            }}>
                                                                                {match.playerSnapshots?.find((p: any) => p.id === pid)?.name || 'Unknown'}: {amount > 0 ? '+' : ''}${amount.toFixed(2)}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
