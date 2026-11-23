# Contributing

Thanks for helping out. This repo is a browser client for Diablo II: Lord of Destruction 1.13c, with quality-of-life mods on top. The base client comes from [troytt/diablo2-web](https://github.com/troytt/diablo2-web) and is merged in regularly.

## Before you start

- You need your own copy of the game. Game files (MPQs) are never committed or shared here.
- For anything bigger than a small fix, open an issue first so we can agree on the approach.

## Making a change

1. Fork the repo and create a branch from `main`.
2. `npm ci`, then `npm run dev` to run the client.
3. Put new behaviour in its own files (see `plugins/` and [MODS.md](../MODS.md)) and keep edits to upstream files to small hooks, so upstream merges stay clean.
4. Run `npm run typecheck` and `npm run test:mods` before you push.
5. Open a pull request against `main`. Leave the description empty and a summary is written for you.

## Style

- No code comments; say it in names and small functions instead.
- Keep it concise and match the surrounding code.
- Commit messages are one short line.

## Reporting bugs and ideas

Use the [issue forms](https://github.com/David-Rodden/diablo2-browser/issues/new/choose). For security problems, see [SECURITY.md](SECURITY.md).

By contributing, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and that your work is licensed under the repo's [MIT License](../LICENSE).
