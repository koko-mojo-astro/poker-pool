import { ProfileSettings } from './ProfileSettings';

interface ProfileModalProps {
    onClose: () => void;
}

export function ProfileModal({ onClose }: ProfileModalProps) {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'var(--bg-dark)',
                zIndex: 200,
                overflowY: 'auto',
            }}
        >
            <div className="container" style={{ position: 'relative', paddingTop: 'var(--gap-xl)' }}>
                {/* Close button — positioned relative to container */}
                <button
                    onClick={onClose}
                    title="Close Profile"
                    style={{
                        position: 'absolute',
                        top: 'var(--gap-md)',
                        right: 'var(--gap-md)',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '50%',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'var(--text-main)',
                        fontSize: '1.2rem',
                        zIndex: 201,
                        backdropFilter: 'blur(4px)'
                    }}
                >
                    ×
                </button>

                <ProfileSettings onComplete={onClose} />
            </div>
        </div>
    );
}
