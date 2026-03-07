---
name: poker-pool-project-guide
description: Guides work in the Poker Pool codebase using the real project architecture, business flow, game logic, InstantDB patterns, and UI conventions. Use when building features, fixing bugs, reviewing changes, or explaining behavior in this repository.
---

# Poker Pool Project Guide

Use this skill when working anywhere in this repository.

## Quick Start

1. Anchor every change to the current architecture:
   - `src/hooks/useGameState.ts` orchestrates auth, data loading, and the `sendMessage` action layer.
   - `src/lib/GameEngine.ts` is the canonical home for game-state mutations and settlement logic.
   - `src/instant.schema.ts` is the schema source of truth.
   - `src/components/` contains screen and modal UI.
2. Keep the product model in mind:
   - This app is a real-time poker pool tracker, not a full betting engine.
   - Live room state is in `rooms` and `roomPlayers`.
   - Immutable history is stored in `matches`.
3. Before larger changes, read [project-overview.md](project-overview.md).

## Project Rules

- Do not add a router, custom backend, localStorage-based room state, or an extra state-management library unless explicitly requested.
- Keep business logic in `useGameState` and `GameEngine`, not scattered across components.
- Preserve the status-driven screen flow: signed out -> profile setup -> `Home` -> `WaitingRoom` -> `GameScreen` -> `VictoryScreen`.
- Use InstantDB reactively: `db.useAuth()`, `db.useQuery()`, `db.queryOnce()`, `tx`, `id()`, and batched `db.transact([...txs])`.
- Normalize linked InstantDB data because relations may arrive as either arrays or objects.
- Preserve the existing UI language: dark glassmorphism, CSS variables and utility classes from `src/index.css`, and inline styles for component-local layout.

## Business Logic Checklist

- Room creation creates both a `rooms` record and a linked `roomPlayers` record for the creator.
- Joining a room resolves `roomCode` through `db.queryOnce()` and creates a linked `roomPlayers` record for the joining profile.
- `matches` must remain as the historical ledger for completed games.
- `rooms.totalSettlements` is the cumulative session balance and should not be overwritten with per-match-only data.
- Creator exit disbands the room; guest exit only removes that guest's `roomPlayers` record.

## Game Logic Checklist

- `startGame()` only runs for the creator while the room is in `WAITING` and has at least two players.
- `pottedCards` stores ranks only.
- Potting a rank removes every card of that rank from every player's hand.
- A successful first pot grants a license.
- Fouls revoke the license and try to draw a penalty card that is not already potted.
- Positive joker increments require a license; joker counts can never go below zero.
- Direct joker payouts depend on `turnOrder`; "above" means the previous player in the ordered array.
- Settlement netting belongs in `GameEngine.computeSettlements()`.

## Implementation Patterns

### Adding or changing a game action

1. Update the `ClientMessage` union in `src/types.ts` if a new action is needed.
2. Add or modify the `GameEngine` method first.
3. Wire the action through `sendMessage` in `src/hooks/useGameState.ts`.
4. Update the relevant screen component to call `sendMessage`.
5. Verify the resulting InstantDB shape still matches `src/instant.schema.ts`.

### Changing the data model

1. Edit `src/instant.schema.ts`.
2. Add indexes for any new field that will be filtered or ordered.
3. Update query code only after the schema supports the access pattern.
4. Keep JSON fields for flexible blobs such as hands, configs, settlements, and turn order.

### Reviewing or debugging

1. Start at `useGameState` to understand what UI state is derived.
2. Inspect `GameEngine` for rule enforcement and transaction boundaries.
3. Confirm the schema matches the queried fields and linked relations.
4. Check whether a bug is caused by array/object relation shape differences.

## Validation

- Run `npx tsc --noEmit` after substantive edits.
- Run `npm run lint` after substantive edits.
- For gameplay changes, verify create/join/start/play/finish/restart/exit flows still behave correctly across multiple clients.

## Additional Resource

- [project-overview.md](project-overview.md): architecture, business domain, game rules, file map, and known repo quirks.
