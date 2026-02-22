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
    const { data, isLoading } = db.useQuery(user ? { $users: { $: { where: { id: user.id } }, profile: {} } } : null);

    const profileData = data?.$users?.[0]?.profile as any;
    const existingProfile = Array.isArray(profileData) ? profileData[0] : profileData;
    const [displayName, setDisplayName] = useState('');

    useEffect(() => {
        if (existingProfile) {
            setDisplayName(existingProfile.displayName);
        } else if (user?.email && isInitialSetup) {
            setDisplayName(user.email.split('@')[0]);
        }
    }, [existingProfile, user, isInitialSetup]);

    const handleSave = async () => {
        if (!displayName.trim() || !user) return;

        try {
            if (existingProfile) {
                // Update
                await db.transact(tx.profiles[existingProfile.id].update({ displayName }));
            } else {
                // Create new
                const profileId = id();
                await db.transact([
                    tx.profiles[profileId].update({ displayName }),
                    tx.profiles[profileId].link({ user: user.id })
                ]);
            }
            if (onComplete) onComplete();
        } catch (e: any) {
            alert('Error saving profile: ' + e.message);
        }
    };

    if (isLoading) return <div className="container" style={{ justifyContent: 'center', alignItems: 'center' }}>Loading...</div>;

    return (
        <div className="container" style={{ justifyContent: 'center' }}>
            <div className="glass-panel animate-fade-in" style={{ textAlign: 'center' }}>
                <h1 style={{
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    marginBottom: 'var(--gap-sm)',
                    color: 'var(--text-main)',
                }}>
                    {isInitialSetup ? 'Welcome!' : 'Profile Settings'}
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--gap-xl)' }}>
                    {isInitialSetup ? "Please choose a game name before you start playing." : "Update your game name."}
                </p>

                <div style={{ textAlign: 'left', marginBottom: 'var(--gap-xl)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--gap-xs)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Display Name</label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="e.g. TMKK"
                    />
                </div>

                <div style={{ display: 'flex', gap: 'var(--gap-md)' }}>
                    <button className="btn-primary" onClick={handleSave} disabled={!displayName.trim()} style={{ flex: 1, height: '48px' }}>
                        Save Name
                    </button>
                    {!isInitialSetup && onComplete && (
                        <button onClick={onComplete} style={{ flex: 1, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--glass-border)', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
