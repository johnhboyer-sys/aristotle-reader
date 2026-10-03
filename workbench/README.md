# Moved: the Translation Workbench is now Moerbeke

The workbench (this folder) and its design notes (`workbench-design/`) moved
to their own repository on 2026-10-03, with their history:
[johnhboyer-sys/moerbeke](https://github.com/johnhboyer-sys/moerbeke)
(private until the first release). Local checkout: `~/Developer/moerbeke`.
`workbench/` is the root there, `workbench-design/` is `docs/design/`.

Its corpus scripts still read this repo's build output (`build/dist`,
`build/export`, `manifests/`, `sources/`); nothing here reads it.
