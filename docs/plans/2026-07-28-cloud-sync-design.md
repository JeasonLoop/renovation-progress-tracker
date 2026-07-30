# Cloud Sync Design

## Decision

Use Cloudflare D1 as the authoritative store for one authenticated renovation project. Store the complete versioned `RenovationData` document in one row with an integer revision. Keep `localStorage` as an offline cache and first-migration source. Keep image binaries in the existing private KV namespace.

## Alternatives

- Cloudflare KV snapshot: simpler, but eventual consistency and weak compare-and-set semantics make multi-device conflict handling unreliable.
- Fully normalized D1 tables: useful for multi-user reporting and partial updates, but adds migration and query complexity that the current single-admin product does not need.

## Data Flow

1. After authentication, the client loads local data and requests `GET /api/data`.
2. If D1 is empty, the client uploads the existing local document with revision `0`.
3. If D1 has data, it becomes the active document and local cache.
4. Edits save locally immediately and are pushed after a short debounce with the last known revision.
5. D1 updates only when the supplied revision matches. A mismatch returns `409` with the current cloud snapshot.
6. The UI never silently overwrites a conflict. It lets the admin use the cloud copy or overwrite it with the current device copy.

## Security And Failure Modes

- All data endpoints require the existing signed admin session.
- Writes require an exact same-origin `Origin` header and JSON content type.
- The Worker validates document structure, schema version, updated timestamp, and a sub-1 MB request size.
- Prepared D1 statements prevent SQL injection.
- Network failures keep the local copy and show an offline state; later edits retry synchronization.
- D1 revision checks prevent silent last-write-wins data loss.

## ADR

Status: Accepted on 2026-07-28.

Consequences: the product gains durable cross-device state with minimal model churn. Whole-document writes are acceptable for the current small single-project dataset. If multi-user collaboration is added later, high-contention collections can be normalized behind the same API.
