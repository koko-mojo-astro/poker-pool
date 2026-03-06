---
name: ui-component-creation
description: How to add new screens, modals, or UI components consistent with the poker-pool design system and component patterns.
---

# UI Component Creation Skill

This skill covers creating new React components that match the poker-pool visual design system and architectural conventions.

## Component File Conventions

- One component per file in `src/components/`.
- Named exports only (no default exports from component files).
- File name matches the exported component name exactly (e.g., `MyModal.tsx` exports `MyModal`).
- Import types from `src/types.ts`, DB client from `src/lib/db.ts`.

## Standard Props Pattern for Screen Components

Every top-level screen component uses:
```tsx
interface MyScreenProps {
  gameState: GameState;
  playerId: string | null;
  sendMessage: (msg: ClientMessage) => void;
}

export function MyScreen({ gameState, playerId, sendMessage }: MyScreenProps) {
  // ...
}
```

Modal/overlay components use `onClose: () => void` instead.

## Design System Cheatsheet

### Layout wrapper (every screen)
```tsx
<div className="container">
  {/* content */}
</div>
```
Max-width 600px, centered, with mobile safe-area padding.

### Glass card / panel
```tsx
<div className="glass-panel">
  {/* content */}
</div>
```

### Primary button
```tsx
<button className="btn-primary" onClick={handleAction}>
  Action Label
</button>
```

### Danger/secondary button
```tsx
<button style={{
  background: 'transparent',
  border: '1px solid var(--danger)',
  color: 'var(--danger)',
  padding: '8px 16px',
  borderRadius: '8px',
  fontWeight: 'bold'
}}>
  Danger Action
</button>
```

### Gradient heading
```tsx
<h1 style={{
  background: 'linear-gradient(to right, #a78bfa, #f472b6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 900
}}>
  Title
</h1>
```

### Section label (uppercase metadata label)
```tsx
<div style={{
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: 'bold'
}}>
  LABEL
</div>
```

### Status badge — success
```tsx
<span style={{
  color: 'var(--success)',
  background: 'rgba(16, 185, 129, 0.2)',
  padding: '4px 10px',
  borderRadius: '6px',
  fontSize: '0.75rem',
  fontWeight: 900,
  border: '1px solid var(--success)'
}}>
  ✓ ACTIVE
</span>
```

### Status badge — danger
```tsx
<span style={{
  color: 'var(--danger)',
  background: 'rgba(239, 68, 68, 0.2)',
  padding: '4px 10px',
  borderRadius: '6px',
  fontSize: '0.75rem',
  border: '1px solid var(--danger)'
}}>
  ✗ INACTIVE
</span>
```

### Modal overlay
```tsx
export function MyModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', maxHeight: '85vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Modal Title</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        {/* Content */}
      </div>
    </div>
  );
}
```

### Grid of player cards
```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
  gap: '8px'
}}>
  {players.map(p => (
    <div key={p.id} className="glass-panel" style={{ padding: '0.6rem' }}>
      {/* player info */}
    </div>
  ))}
</div>
```

### Amount/net display — positive/negative
```tsx
<div style={{
  color: amount >= 0 ? 'var(--success)' : 'var(--danger)',
  fontWeight: 800,
  fontSize: '1.5rem'
}}>
  {amount >= 0 ? '+' : '-'} ${Math.abs(amount).toFixed(2)}
</div>
```

## Animations

Use the `.animate-fade-in` class for entrance animations:
```tsx
<div className="animate-fade-in glass-panel">
  {/* animated content */}
</div>
```

For staggered list items, add `animationDelay`:
```tsx
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-fade-in"
    style={{ animationDelay: `${i * 0.05}s` }}
  >
    {/* item */}
  </div>
))}
```

## Toast Notifications

For game action feedback, import and use `useToast`:
```tsx
import { useToast } from './Toast';

export function MyComponent() {
  const { showToast } = useToast();

  const handleAction = () => {
    sendMessage({ type: 'SOME_ACTION' });
    showToast('Action performed!', 'info');    // 'info' | 'success' | 'error'
  };
}
```

Do NOT use toast for errors surfaced from the database — use `alert()` for those (matches the existing `sendMessage` error handler).

## Mounting a New Screen

Add the new screen to `App.tsx`'s `MainApp` function by checking `gameState.status` or other state:

```tsx
if (gameState.status === 'MY_NEW_STATUS') {
  return <MyNewScreen gameState={gameState} playerId={playerId} sendMessage={sendMessage} />;
}
```

Import it at the top of `App.tsx`.

## Checklist for New Components

- [ ] Named export from `src/components/ComponentName.tsx`
- [ ] Uses CSS variables (not hardcoded colors)
- [ ] Uses `.glass-panel` for any card-like containers
- [ ] Uses `.container` as the page wrapper for screens
- [ ] Uses `.btn-primary` for primary actions
- [ ] Responsive: tested at 375px and 600px widths
- [ ] No hardcoded heights that would break on mobile
- [ ] Safe area insets respected via `.container` (already handled by the class)
- [ ] No scrollbars visible (handled globally)
- [ ] TypeScript: no `any` escapes beyond what's necessary for raw DB shapes
