# Reviewed tournament boundary

B042 implements a gated initial format: registration-order balanced seeding, complete fields of 2/4/8/16/32 permanent active accounts, heads-up Classic single-hand elimination, a fresh hand on equal final stacks, and a nontransferable prestige title for the champion. These are proposed launch-format choices requiring product review, not activation defaults. No purchased power, entry fee, real-world prize, paid chip grant or new poker scoring is introduced. Each hand uses the independently reviewed B022 earned-chip admission and escrow policy; players see that hand stake separately from free tournament entry. Weekly/monthly events can be scheduled individually by UTC timestamp. Automatic recurring scheduling, Spades and multi-hand elimination are not implemented.

`createApp` accepts explicit `features.tournamentPolicy` only with identity and a Classic admission policy. Main supplies neither. Publish only after format, eligibility, prize, abuse and dispute handling are reviewed. Policy/admission snapshots are frozen; changed configuration pauses new registration/admission/start. Existing bound result processing remains recoverable so accepted hands settle safely.

## Server protocol

Authenticated `GET /v1/tournaments` provides bounded cursor pagination for schedules and archives; `GET /:id` shows bracket seeds, win counts, eligibility, hand stake, title and next action. Public views use event-local seeds, never account IDs, private room snapshots, shuffle material or opponents' hidden cards. Room IDs are returned only to their participants, and existing room authorization remains mandatory.

`POST /:id/register` requires permanent identity and an open server-time registration window. A single immutable entry per user/event makes retries harmless. The worker starts only a full eligible field at the scheduled server time; underfilled events cancel without a fee. No implicit byes or reentries are improvised.

`POST /matches/:id/ready` includes the expected attempt number, rejecting a delayed command from an older rematch, and requires each assigned participant's explicit consent. Both users must leave any existing lobby themselves. A server-created private lobby is bound to the bracket before dealing; B022 admission binds its room in the same transaction as the shuffle, inventory locks and earned-chip reservation. There is no client room-attachment or winner endpoint. Failed funding/loadout checks preserve the lobby for the designated host to retry. Equal-stack results require fresh consent and a new attempt; completed hand escrow/card locks are settled by B022 before advancement.

The recovery worker replays only immutable settled, pre-bound Classic rooms and verifies allocation hashes/participants. Source uniqueness, tournament locks and immutable result rows make replay, concurrent workers and restarts converge on one advancement and one title award. The title is a distinct tournament prestige record, not an inventory card or currency grant.

MFA-backed local ADMIN may schedule via `POST /v1/tournaments` and audit via `POST /:id/replay`. Each request requires a reason and idempotency UUID; role/session are rechecked under lock. Replay recomputes private server state but returns only consistency/counts. No result override or arbitrary prize grant is exposed. Broader operational roles belong to B044/B045.

Participants may submit `POST /:id/reports` with their match and a closed reason code during the explicitly configured dispute window after completion. Reports are private, immutable and source-idempotent; audited admin replay includes up to 100 report references/codes. A receipt records a case for review and does not promise an automatic reversal. Full moderation workflow/triage remains B045.

## Operations and release limits

Monitor fixed `tournament.ingest` and `tournament.recovery` statuses, oldest unprocessed bound GameResult, stale RUNNING matches, entry/start mismatches, duplicate-source rejects and award/bracket reconciliation. Do not log participant identifiers, cards or raw evidence. A damaged source or failed award transaction must retry rather than guess a winner. Existing poker timeout recovery handles hand turns; there is no invented between-round forfeit or abandoned-host policy. A host who disconnects before admission must return and retry. Operator incident/abandonment policy, collusion resistance, expanded formats and real multi-device/screen-reader acceptance remain release gates.

Migration `202610300015_tournaments` adds entry/result/audit history, constraints and deferred participant/advancement/award reconciliation. Its reverse script is for an owned disposable database only. Deployed repair must preserve competition and earned-chip history; no rollback erases a settled prize or rewrites a winner. Use audited forward repair after investigation.
