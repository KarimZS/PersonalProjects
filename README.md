# Personal Projects

A collection of independent projects. Each one lives in its own folder, with its own dependencies, README and deploy config.

| Project | Description |
| --- | --- |
| [`dnd-mini-tracker`](dnd-mini-tracker/) | Mobile-friendly collection tracker for all D&D Icons of the Realms miniatures (Node, deployed on Railway) |

## Deploying on Railway

Each deployable project is its own Railway service pointing at this repo.
Set the service's **Root Directory** to the project folder, and its **Watch Paths** to `/<folder>/**`,
so that only changes to that project trigger a redeploy. Without a Root Directory, Railway builds the repo root,
which has no app, and the build fails.
