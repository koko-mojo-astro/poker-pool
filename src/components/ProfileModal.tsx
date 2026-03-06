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
                background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(6px)',
                zIndex: 200,
                overflowY: 'auto',
            }}
        >
            {/* Close button — fixed to viewport top-right */}
            <button
                onClick={onClose}
                title="Close Profile"
                style={{
                    position: 'fixed',
                    top: 'var(--gap-lg)',
                    right: 'var(--gap-lg)',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                    fontSize: '1.5rem',
                    zIndex: 201,
                }}
            >
                ×
            </button>

            {/* ProfileSettings renders itself as a full container page */}
            <ProfileSettings onComplete={onClose} />
        </div>
    );
}
