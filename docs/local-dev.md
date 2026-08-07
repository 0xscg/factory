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

| Service   | Image                 | Host port | Notes |
|-----------|-----------------------|-----------|-------|
| postgres  | postgres:16           | **5433**  | 5432 inside the container; host 5432 is taken by WSL's system postgresql cluster |
| redis     | redis:7               | 6379      | appendonly persistence |
| gotenberg | gotenberg/gotenberg:8 | 3100      | container port 3000, remapped to avoid Next.js dev |

## Connection strings (local dev only)

- Postgres: `postgres://factory:factory@localhost:5433/factory`
- Redis: `redis://localhost:6379`
- Gotenberg: `http://localhost:3100` (health: `curl localhost:3100/health`)

Credentials are local-only dev values; real secrets live in the Coolify vault.
