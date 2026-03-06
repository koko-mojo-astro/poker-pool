# Poker Pool — Project Rules

You are a world-class senior frontend engineer building and maintaining **Poker Pool**, a real-time multiplayer card game tracker. This document is the definitive source of truth for all development on this codebase.

---

## 🧠 Project Overview

**Poker Pool** is a real-time, multi-player card game tracker built on:
- **React 19** (Vite, TypeScript)
- **InstantDB (`@instantdb/react`)** — the only backend; no custom server
- **Vanilla CSS** — with a dark glassmorphism design system
- **No routing library** — screen state is driven purely by `gameState.status` from InstantDB

The game supports multiple players in a shared room. The `GameEngine` class handles all game logic client-side; InstantDB handles persistence, real-time sync, and auth.

---

## 📐 Architecture

### Screens (driven by `gameState.status`)
| State | Component |
|---|---|
| Not logged in | `LoginScreen` |
| Logged in, no profile | `ProfileSettings` (initial setup) |
| No active room | `Home` |
| `WAITING` | `WaitingRoom` |
| `PLAYING` | `GameScreen` |
| `FINISHED` | `VictoryScreen` |

**Never add a routing library.** Screen transitions happen automatically because `useGameState` reactively derives screen state from InstantDB queries.

### Key Files
| File | Purpose |
|---|---|
| `src/lib/db.ts` | InstantDB client singleton (import `db` from here) |
| `src/instant.schema.ts` | InstantDB schema — single source of truth for data shape |
| `src/types.ts` | TypeScript types for game domain (Card, Player, GameState, etc.) |
| `src/hooks/useGameState.ts` | **The central hook** — auth, data queries, and `sendMessage` dispatcher |
| `src/lib/GameEngine.ts` | Game logic (startGame, potCard, drawCard, etc.) — all static methods using `db.transact` |
| `src/lib/Deck.ts` | Card deck with shuffle logic |
| `src/components/` | One file per screen/component |

---

## 🗄️ InstantDB Rules (CRITICAL)

### Schema
- **Always edit `instant.schema.ts`** and push with `npx instant-cli push schema --yes` before writing any query that uses a new field.
- **Index every field** you intend to filter or order by using `.indexed()` in the schema.
- **Typed fields** are required for `$gt`, `$lt`, `$gte`, `$lte` comparisons.
- For JSON blobs (hands, configs, settlements), use `i.json()`.
- Cascade deletes (`onDelete: "cascade"`) can only be used on `has-one` forward links.

### Querying
- Always use `db.useQuery()` for reactive data; never store DB data in `localStorage` or component state.
- Pagination (`limit`, `offset`, `first`, `after`, `last`, `before`) only works on **top-level namespaces**. Never paginate nested relations.
- Use `db.queryOnce()` for one-shot lookups (e.g., resolving a room by roomCode on join).
- Available `where` operators: `$ne`, `$isNull`, `$gt`, `$lt`, `$gte`, `$lte`, `$in`, `$like`, `$ilike`, `and`, `or`. **There is no `$exists`, `$nin`, or `$regex`.**
- Nested filtering syntax: `'relation.field': value`.

### Transactions
- Use `tx.<entity>[id].update({...})`, `.link({...})`, `.delete()`, and `.create({...})`.
- Always batch related writes into a single `db.transact([...txs])` call.
- Use `id()` from `@instantdb/react` to generate new entity IDs.
- **Never call `db.transact` inside `useEffect`** without a guard — it will re-run on every render.

### Auth
- Use `db.useAuth()` to access `{ user, isLoading, error }`.
- Use `db.SignedIn` / `db.SignedOut` wrapper components in the app root.
- Profiles are linked 1:1 to `$users` via the `profilesUser` link.
- After login, always check for a profile before allowing room operations (enforced by `ProfileGuard`).

### Permissions
- Use `data.ref('relation.field')` in CEL permission expressions — it always returns a list.
- `auth.id in data.ref('owner.id')` is correct. `auth.id == data.ref('owner.id')` is **wrong**.
- `$users` default: `view` is `auth.id == data.id`; `create` and `delete` are always false.

---

## 🃏 Game Engine Rules

The `GameEngine` class in `src/lib/GameEngine.ts` is the canonical home for all game logic:

- All methods are `static async` and accept `(db, roomData, playerId, ...)`.
- `roomData` is always the raw InstantDB shape from `useGameState` (with nested `players` array).
- **Win conditions**: a player's hand reaches 0 cards after potting. The pot operation also filters all players' hands by rank.
- **License**: required to pot a card and claim Joker Balls. Fouls revoke the license.
- **Joker Balls**: two types — `direct` (pays the player above you in turn order) and `all` (winner collects from all).
- Settlement math uses pairwise netting — `computeSettlements` is `private static` in `GameEngine`.

### Room Lifecycle
1. Creator creates room → `rooms` + `roomPlayers` record created, linked.
2. Guests join → new `roomPlayers` record linked to `rooms` and `profiles`.
3. Creator starts game → `GameEngine.startGame` shuffles players, distributes 7 cards each.
4. Game ends → `GameEngine.potCard` detects win, writes `matches` record, updates `totalSettlements`.
5. Creator restarts → `GameEngine.restartGame` resets room to `WAITING`, clears hands/jokers.
6. Creator exits → room is deleted (cascade cleans up `roomPlayers`). Guest exits → only their `roomPlayers` record deleted. **Matches are preserved.**

---

## 🎨 Design System Rules

### CSS Variables (defined in `index.css`)
```css
--bg-dark: #0f172a          /* Page background */
--bg-panel: rgba(30,41,59,0.7) /* Glass card bg */
--primary: #8b5cf6          /* Purple — primary actions */
--accent: #ec4899           /* Pink — gradient partner */
--text-main: #f8fafc
--text-muted: #94a3b8
--success: #10b981
--danger: #ef4444
--glass-border: rgba(255,255,255,0.15)
```

### Utility Classes
| Class | Use |
|---|---|
| `.glass-panel` | Cards, panels — backdrop blur, border, shadow |
| `.btn-primary` | CTA buttons — purple→pink gradient |
| `.container` | Page wrapper — max-width 600px, centered, safe-area padding |
| `.animate-fade-in` | Entry animation — `fadeIn` keyframe |

### Design Principles
- **Dark mode only.** All backgrounds use `--bg-dark` or `--bg-panel`.
- **Glassmorphism**: `backdrop-filter: blur(16px)` with `--glass-border` border.
- **Gradients**: titles use `background: linear-gradient(to right, #a78bfa, #f472b6)` with `WebkitBackgroundClip: text`.
- **Typography**: `Inter` from system or Google Fonts. Body: `var(--text-main)`. Secondary: `var(--text-muted)`.
- **Mobile-first**: `max-width: 600px`, use `clamp()` for font sizes, `env(safe-area-inset-*)` for padding.
- **No scrollbars**: scrollbars are hidden globally (`scrollbar-width: none`).
- **Inline styles**: Component-level layout uses inline styles. Global utilities use class names defined in `index.css`.
- Do NOT introduce Tailwind, CSS Modules, or styled-components.

---

## ⚛️ React / TypeScript Rules

### Hooks
- **Follow Rules of Hooks strictly**: no conditional hook calls. `db.useQuery()` must always be called; pass `null` when the query should be skipped.
- All queries in `useGameState` cascade from the user's auth → profile → roomPlayers → room.
- To derive the active room, check `roomPlayers` for ones with `room.status` in `['WAITING', 'PLAYING', 'FINISHED']`.

### Data Normalization
- InstantDB linked fields may return an object or an array. Always normalize: `const x = Array.isArray(raw) ? raw[0] : raw`.
- `profile` on `roomPlayers` is often a nested array — use `p.profile?.[0]?.displayName || p.profile?.displayName`.
- `turnOrder` stored as JSON in the room — always check `Array.isArray` before using; use `Object.values()` as fallback.

### Types
- Use `InstaQLEntity<AppSchema, 'entityName'>` for typing query results.
- Game domain types live in `src/types.ts` (Card, Player, GameState, PairwiseSettlement, etc.).
- Avoid `any` — the `GameEngine` uses `any` for raw InstantDB data shapes; do not propagate this to UI components.

### Component Props Pattern
Every screen component receives:
```ts
{
  gameState: GameState;
  playerId: string | null;
  sendMessage: (msg: ClientMessage) => void;
}
```

### Error Handling
- Wrap `sendMessage` async calls in `try/catch`; show errors via `alert()` (simple, mobile-friendly).
- Show toast notifications for game actions using the `useToast()` hook from `Toast.tsx`.

---

## 🗂️ Data Model Reference

### Entities
| Entity | Key Fields |
|---|---|
| `$users` | `email`, `imageURL` |
| `profiles` | `displayName`, `profilePicUrl` |
| `rooms` | `roomCode` (unique), `status`, `config`, `deck`, `pottedCards`, `turnOrder`, `winnerId`, `totalSettlements` |
| `roomPlayers` | `hand` (JSON), `cardCount`, `hasLicense`, `isCreator`, `jokerBalls` (JSON) |
| `matches` | `winnerId`, `winnerName`, `timestamp`, `netChanges`, `playerSnapshots`, `settlements` |

### Links
| Link | Description |
|---|---|
| `profilesUser` | `profiles` → `$users` (1:1, cascade) |
| `roomPlayersRoom` | `roomPlayers` → `rooms` (many:1, cascade) |
| `roomPlayersProfile` | `roomPlayers` → `profiles` (many:1) |
| `matchesRoom` | `matches` → `rooms` (many:1, **no cascade** — matches survive room deletion) |
| `matchesPlayers` | `matches` → `profiles` (many:many) |

### Room Code
- 8-character alphanumeric string (excludes `0`, `O`, `1`, `I` to avoid confusion).
- Stored in `rooms.roomCode` (indexed for fast lookup).
- Players join by providing this code; resolved via `db.queryOnce`.

---

## 🛠️ Development Workflow

```bash
# Start dev server
npm run dev

# Typecheck
npx tsc --noEmit

# Lint
npm run lint

# Push schema changes
npx instant-cli push schema --yes

# Push permission changes
npx instant-cli push perms --yes

# Build for production
npm run build

# Serve production build
npm start
```

Always run `npx tsc --noEmit` before committing to catch type errors early.

---

## ❌ Anti-Patterns to Avoid

| Anti-Pattern | Correct Approach |
|---|---|
| `localStorage` for auth/room state | Use `db.useAuth()` + `db.useQuery()` |
| Conditional hook calls | Always call hooks; pass `null` to useQuery to skip |
| Multiple `db.transact` calls for related mutations | Batch everything into one `transact([...txs])` |
| `onDelete: "cascade"` on `has-many` links | Cascade only works on `has-one` forward links |
| Filtering/ordering non-indexed fields | Add `.indexed()` + `.typed()` in schema first |
| Mutating game state in `useEffect` | Put logic in `sendMessage` → `GameEngine` methods |
| Adding routing libraries | Screen routing via `gameState.status` is intentional |
| Installing Tailwind | Use Vanilla CSS with the existing class utilities |
| `data.ref()` comparison without `in` operator | `auth.id in data.ref('owner.id')` is the correct form |

---

## 📦 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@instantdb/react` | ^0.22 | Database, auth, real-time |
| `react` | ^19 | UI framework |
| `react-dom` | ^19 | DOM renderer |
| `@react-oauth/google` | ^0.13 | Google OAuth |
| `vite` | ^7 | Build tool |
| `typescript` | ~5.9 | Type safety |

No CSS framework, no state management library, no routing library.
