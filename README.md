# scratch-editor: The Scratch Editor Monorepo

If you'd like to use Scratch, please visit the [Scratch website](https://scratch.mit.edu/). You can build your own
Scratch project by pressing "Create" on that website or by visiting <https://scratch.mit.edu/projects/editor/>.

This is a source code repository for the packages that make up the Scratch editor and a few additional support
packages. Use this if you'd like to learn about how the Scratch editor works or to contribute to its development.

## McRemote fork

This fork adds Minecraft Remote (McRemote), a Scratch extension for controlling a Minecraft/Paper server through
the McRemote plugin. The browser editor connects over WSS to the payload-transparent Bridge, which relays the
JSON-RPC stream to the plugin over TCP. WireScope can observe a sanitized, read-only view of that stream.

The current published beta is McRemote Scratch `2300.0.0b6`, using protocol `23.0.0`. Its exact prerelease identity
and artifact declarations are in the
[`v2300.0.0b6` release notes](https://github.com/Naohiro2g/scratch-editor/releases/tag/v2300.0.0b6).

### Start the editor from source

Install the workspace dependencies and start the Scratch GUI from the repository root:

```sh
npm ci
npm start
```

Open <http://localhost:8601/>. The checked-in
[`mc-remote-runtime-config.json`](packages/scratch-gui/static/mc-remote-runtime-config.json) selects the Bridge,
Sandbox, connection availability, WireScope URL, and notices for local development. Starting the editor does not
start Minecraft, the McRemote plugin, or the Bridge; the selected deployment must provide a compatible protocol
23 server path. The public GitHub Pages build is a showcase whose Minecraft connection is deliberately disabled.

For a self-hosted path, build and configure the
[`@mc-remote/bridge`](mc-remote/bridge/README.md) separately. WireScope local development is described in the
[`@mc-remote/live` README](mc-remote/live/README.md).

### Shortest b6 success

This path makes no persistent world change, so it needs no world cleanup:

1. Open a connection-enabled McRemote Scratch deployment and add the Minecraft Remote extension.
2. Run the `connect` block. If the browser has no valid session token, WireScope mini shows a pairing command in
   the form `/mcremote pair NNN-NNN`.
3. Enter that command in Minecraft chat as the player to pair, then wait for the Scratch connection to complete.
4. Run `say [Hello from Scratch] in chat`.

Expected result: the paired Minecraft session shows `Hello from Scratch`. The pairing session token is scoped to
the selected connection target; it is not saved inside the Scratch project.

### Saving

Projects are automatically saved to IndexedDB in the current browser and origin. Use **File → Browser-saved
projects** to restore or delete them. Save an individual sprite with **Save to browser** in the sprite context menu,
then restore or delete it from **File → Browser-saved sprites**. These records contain project or sprite data, not
McRemote credentials, connection targets, or WireScope observations. Standard `.sb3` download and upload remain
available for file transfer. Clearing site data or using another browser or origin does not carry browser-saved
records across; export a file when transfer or backup matters.

### WireScope

WireScope is the read-only observer app in [`mc-remote/live`](mc-remote/live). Build and preview it from the root:

```sh
npm run build --workspace=@mc-remote/live
npm run preview --workspace=@mc-remote/live
```

The default preview is <http://127.0.0.1:4173/>. It must use an origin distinct from the Scratch editor. Connect
Scratch to Minecraft first, then open WireScope from the connected WireScope mini panel; direct navigation
intentionally receives no observation capability. WireScope does not send Minecraft commands and does not save
observer sessions or transport state.

### Fork and upstream boundary

McRemote-specific packages live under `mc-remote/`; the Scratch VM extension lives under
`packages/scratch-vm/src/extensions/scratch3_mcremote/`, with its UI integration in `packages/scratch-gui/`.
Everything else continues to track the Scratch editor monorepo. McRemote is a fork feature: it is not part of the
Scratch website or the upstream `scratchfoundation/scratch-editor` product. Keep generally useful Scratch changes
separable from McRemote product behavior when contributing upstream.

## What's in this repository?

The `packages` directory in this repository contains:

- `scratch-gui` provides the buttons, menus, and other elements that you interact with when creating and editing a
  project. It's also the "glue" that brings most of the other modules together at runtime.
- `scratch-media-lib-scripts` builds (or rebuilds) media libraries for the editor.
- `scratch-paint` provides a way to draw vector (SVG) or bitmap (PNG) images for costumes and backdrops.
- `scratch-render` draws backdrops, sprites, and clones on the stage.
- `scratch-storage` helps load project assets like images and sounds. It also provides `ScratchFetch`, a customized
  wrapper around `fetch`.
- `scratch-svg-renderer` processes SVG (vector) images for use with Scratch projects.
- `scratch-vm` is the virtual machine that runs Scratch projects.
- `task-herder` manages queues of tasks with throttling and concurrency limits.

The McRemote fork also contains private workspace packages under `mc-remote/`:

- `protocol` mirrors the versioned McRemote wire contract as dependency-free TypeScript types and fixtures.
- `bridge` is the payload-transparent WSS-to-TCP proxy used by browser clients.
- `live` is the WireScope browser app, observer schema, and source/station adapters.

_Please add to this list as more packages are migrated to the monorepo._

Each package has its own `README.md` file with more information about that package.

## Monorepo migration

### What's going on?

We're migrating the Scratch editor packages into this monorepo. This will allow us to manage all the packages that
make up the Scratch editor in one place, making  it easier to manage dependencies and make changes that affect
multiple packages.

### Why are there only a few packages in this repo?

We're migrating packages in stages. The current plan, which is subject to change, has us migrating repositories in
four batches. We plan to complete the migration within 2025.

### What will happen to the existing repositories?

The existing repositories will be archived and made read-only. Those repositories contain valuable work and
information, including but not limited to issues and pull requests. We plan to keep that information available for
reference, and to selectively migrate it to this new repository.

## Thank you

Scratch would not be what it is today without help from the global community of Scratchers and open-source
contributors. Thank you for your contributions and support. _[Scratch on!](https://scratch.mit.edu/projects/65347738/fullscreen/)_

## Donate

We provide [Scratch](https://scratch.mit.edu) free of charge, and want to keep it that way! Please consider making a
[donation](https://www.scratchfoundation.org/donate) to support our continued engineering, design, community, and
resource development efforts. Donations of any size are appreciated. Thank you!
