# Cloud Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist the complete renovation project in Cloudflare D1 and synchronize it safely across one administrator's devices.

**Architecture:** D1 stores a single versioned JSON snapshot with optimistic revision checks. The browser remains an immediate offline cache and pushes debounced updates through authenticated Worker endpoints.

**Tech Stack:** Next.js 15, React 19, Cloudflare Worker, Cloudflare D1, TypeScript

---

### Task 1: D1 Infrastructure

**Files:**
- Create: `migrations/0001_project_snapshots.sql`
- Modify: `wrangler.jsonc`

1. Create the `zhuji-renovation-data` D1 database.
2. Add the `RENOVATION_DB` binding.
3. Create a migration for the singleton project snapshot and revision.
4. Apply the migration to production.

### Task 2: Authenticated Data API

**Files:**
- Modify: `worker/index.ts`

1. Add `GET /api/data` for the current snapshot.
2. Add same-origin `PUT /api/data` with payload and schema validation.
3. Insert the first snapshot when revision is zero.
4. Update by expected revision and return `409` with the current cloud document on conflict.
5. Keep all API responses private and uncached.

### Task 3: Browser Sync Client

**Files:**
- Create: `src/lib/cloud-sync.ts`
- Modify: `src/components/renovation-app.tsx`
- Modify: `src/components/views/export-view.tsx`
- Modify: `src/app/globals.css`

1. Define typed load/save responses and sync status.
2. On hydration, migrate local data if D1 is empty; otherwise load cloud data.
3. Save locally immediately and push changes after a debounce.
4. Display syncing, cloud-synced, offline, and conflict states.
5. Provide explicit conflict actions for cloud copy or current-device overwrite.
6. Update backup text to reflect local cache plus cloud storage.

### Task 4: Production Rollout

**Files:**
- Modify: `wrangler.jsonc` with the created database ID.

1. Confirm Cloudflare authentication.
2. Build the updated static frontend for deployment.
3. Deploy Worker and assets.
4. Confirm the production data endpoint, first migration, edit synchronization, and authenticated reload.

No Git commit steps are included because this directory is not a Git repository.
