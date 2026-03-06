---
name: instantdb-schema-management
description: How to safely add, modify, or remove entities/links in the InstantDB schema for the poker-pool project, and push those changes to production.
---

# InstantDB Schema Management Skill

This skill covers the full workflow for modifying the poker-pool InstantDB schema (`src/instant.schema.ts`) and keeping the live database in sync.

## Prerequisites

Ensure `VITE_INSTANT_APP_ID` and `INSTANT_ADMIN_TOKEN` are set in `.env.local`. If missing, pull them from the InstantDB dashboard or ask the user.

## Step-by-Step Workflow

### 1. Understand the current schema

Read `src/instant.schema.ts` before making changes. The schema has two sections:
- **`entities`**: the database tables and their typed fields
- **`links`**: relationships between entities (forward + reverse)

### 2. Edit `instant.schema.ts`

Follow these rules exactly:

#### Adding a new field
```ts
myEntity: i.entity({
  // existing fields...
  newField: i.string(),              // basic field
  newIndexed: i.string().indexed(),  // REQUIRED if you will filter/order by it
  newOptional: i.string().optional(), // optional field (can be null/missing)
  newJson: i.json(),                 // for arrays or nested objects
})
```

#### Adding a new entity
```ts
entities: {
  myNewEntity: i.entity({
    name: i.string().indexed(),
    createdAt: i.number().indexed(),
  }),
  // ... other entities
}
```

#### Adding a new link
```ts
links: {
  myEntityProfile: {        // name: <forward_entity><linked_entity>
    forward: {
      on: 'myNewEntity',   // entity that holds the foreign key
      has: 'one',          // 'one' | 'many'
      label: 'profile',    // navigation label on myNewEntity
      onDelete: 'cascade', // ONLY valid for has-one forward links
    },
    reverse: {
      on: 'profiles',
      has: 'many',
      label: 'myNewEntities', // navigation label on profiles
    },
  },
}
```

> ⚠️ `onDelete: 'cascade'` can only be set on `forward` links where `has: 'one'`. 
> Setting it on `has: 'many'` or `reverse` links will error.

#### Renaming a field (do NOT just change the name)
```bash
npx instant-cli push schema --rename 'entity.oldName:entity.newName' --yes
```

### 3. Push schema to the server

```bash
npx instant-cli push schema --yes
```

This is **non-destructive for additions**. Removing a field from the schema will delete that field's data.

### 4. Update `src/types.ts` if needed

If you added a new entity that maps to a TypeScript type used in the UI, add or update the interface in `src/types.ts`.

### 5. Update queries in `useGameState.ts`

If new related data needs to be fetched, expand the `db.useQuery` call in `src/hooks/useGameState.ts`. The query already traverses:
```
$users → profile → roomPlayers → room → players → profile
                                      → matches
```
Add additional nesting as needed.

### 6. Typecheck

```bash
npx tsc --noEmit
```

Fix any type errors before testing.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Filtering by non-indexed field | Add `.indexed()` in schema and re-push |
| Ordering by non-typed field | Add type (`.string()`, `.number()`) + `.indexed()` |
| Using `onDelete: cascade` on `has-many` | Move cascade to the forward `has-one` link |
| Missing field in schema but using it in query | Add the field to the schema first |
| Using `$exists` or `$regex` in where clause | Use `$isNull`, `$like`, or `$ilike` instead |

## Permissions

Edit `instant.perms.ts` (create if missing: `npx instant-cli pull --yes`), then push:
```bash
npx instant-cli push perms --yes
```

Permission CEL examples for this project:
```cel
// Room creator can update room
auth.id in data.ref('players.profile.user.id') && data.ref('isCreator') == [true]

// Profile owner can update their profile
auth.id in data.ref('user.id')

// Anyone can view matches
true
```

Always end `data.ref()` with an attribute (e.g., `.id`, `.displayName`). It always returns a **list**.
