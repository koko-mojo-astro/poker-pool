import React, { createContext, useCallback, useContext, useState } from 'react';

type AlertVariant = 'info' | 'error';
type AlertType = 'alert' | 'confirm';

interface AlertState {
    type: AlertType;
    message: string;
    variant: AlertVariant;
    resolve?: (value: boolean) => void;
}

interface AlertContextType {
    showAlert: (message: string, variant?: AlertVariant) => void;
    showConfirm: (message: string) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AlertState | null>(null);

    const showAlert = useCallback((message: string, variant: AlertVariant = 'info') => {
        setState({ type: 'alert', message, variant });
    }, []);

    const showConfirm = useCallback((message: string): Promise<boolean> => {
        return new Promise((resolve) => {
            setState({
                type: 'confirm',
                message,
                variant: 'info',
                resolve,
            });
        });
    }, []);

    const close = useCallback(() => {
        setState((prev) => {
            if (prev?.resolve) prev.resolve(false);
            return null;
        });
    }, []);

    const handleConfirm = useCallback((value: boolean) => {
        setState((prev) => {
            if (prev?.resolve) prev.resolve(value);
            return null;
        });
    }, []);

    return (
        <AlertContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {state && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'var(--bg-dark)',
                        backgroundImage: 'radial-gradient(at 0% 0%, rgba(139, 92, 246, 0.12) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(236, 72, 153, 0.08) 0px, transparent 50%)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '20px',
                    }}
                    onClick={state.type === 'alert' ? close : undefined}
                >
                    <div
                        className="glass-panel"
                        style={{
                            width: '100%',
                            maxWidth: '400px',
                            position: 'relative',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p
                            style={{
                                margin: 0,
                                color: 'var(--text-main)',
                                fontSize: '1rem',
                                lineHeight: 1.5,
                                paddingRight: '2rem',
                            }}
                        >
                            {state.message}
                        </p>
                        <div
                            style={{
                                display: 'flex',
                                gap: 'var(--gap-sm)',
                                justifyContent: 'flex-end',
                                marginTop: 'var(--gap-lg)',
                            }}
                        >
                            {state.type === 'confirm' && (
                                <button
                                    type="button"
                                    onClick={() => handleConfirm(false)}
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid var(--glass-border)',
                                        color: 'var(--text-main)',
                                        padding: '10px 20px',
                                        borderRadius: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => (state.type === 'alert' ? close() : handleConfirm(true))}
                                className="btn-primary"
                                style={{
                                    ...(state.variant === 'error' && state.type === 'alert'
                                        ? {
                                            background: 'var(--danger)',
                                            border: 'none',
                                        }
                                        : {}),
                                }}
                            >
                                {state.type === 'alert' ? 'OK' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AlertContext.Provider>
    );
}

// Hook must be colocated with provider for context access; fast-refresh rule relaxed here.
// eslint-disable-next-line react-refresh/only-export-components
export function useAlert(): AlertContextType {
    const context = useContext(AlertContext);
    if (!context) throw new Error('useAlert must be used within AlertProvider');
    return context;
}
