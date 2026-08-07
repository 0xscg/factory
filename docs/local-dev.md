# Local dev services

Postgres, Redis, and Gotenberg run via rootless **podman compose** (no Docker) from `compose.yaml` at the repo root.

## Prereqs

Start the podman Docker-API socket once per WSL session:

```sh
systemctl --user start podman.socket
```

(`DOCKER_HOST` is already exported to that socket — see global CLAUDE.md.)

## Commands

```sh
podman compose up -d    # start everything
podman compose down     # stop everything (named volumes persist)
```

## Services & ports

| Service   | Image                 | Host port | Notes                                                                            |
| --------- | --------------------- | --------- | -------------------------------------------------------------------------------- |
| postgres  | postgres:16           | **5433**  | 5432 inside the container; host 5432 is taken by WSL's system postgresql cluster |
| redis     | redis:7               | 6379      | appendonly persistence                                                           |
| gotenberg | gotenberg/gotenberg:8 | 3100      | container port 3000, remapped to avoid Next.js dev                               |

## Connection strings (local dev only)

- Postgres: `postgres://factory:factory@localhost:5433/factory`
- Redis: `redis://localhost:6379`
- Gotenberg: `http://localhost:3100` (health: `curl localhost:3100/health`)

Credentials are local-only dev values; real secrets live in the Coolify vault.

## Stripe (test mode)

Test keys live in the gitignored `.env` at the repo root (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`). The Stripe CLI is installed in `~/.local/bin` and works headlessly with `--api-key` — no `stripe login` needed.

Webhook feedback loop (three terminals, or background the first two):

```sh
set -a; . .env; set +a                       # load keys into the shell

# 1. forward Stripe test events to the local handler
stripe listen --api-key "$STRIPE_SECRET_KEY" --forward-to localhost:4242/webhooks/stripe
#    → prints the whsec_... signing secret; keep .env's STRIPE_WEBHOOK_SECRET in sync
#      (it is stable per CLI setup, not per run)

# 2. run the dev webhook server (verifies signatures, logs dispatch)
pnpm --filter @factory/core dev:webhooks

# 3. fire test events
stripe trigger invoice.payment_failed --api-key "$STRIPE_SECRET_KEY"
```

Unit tests (`pnpm test`) cover signature verify/tamper and duplicate-delivery idempotency without the network; `vitest` (watch mode) inside `packages/core` gives the fastest loop.
