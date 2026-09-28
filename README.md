# scratch-editor: The Scratch Editor Monorepo

> [!NOTE]
> このリポジトリの Scratch エディターは、マイクラリモコンのクライアントです。ブロックで作った命令を、ゲームとは別の接続でマインクラフトサーバーへ送ります。
> [公式サイト](https://mc-remote.com/)から使い始められます。この版の使い方は [マイクラリモコン版の案内](README_mc-remote.md)、コードの見方は [実装の案内](mc-remote/README.md)をご覧ください。
>
> This fork makes the Scratch editor a Minecraft Remote client. It sends block commands to the Minecraft server through a connection separate from the game. Start at the [project website](https://mc-remote.com/), or read the [guide to this fork](README_mc-remote.md) and its [code map](mc-remote/README.md).
>
> 公開文書の[言語方針](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/LANGUAGE_POLICY.md)もご覧ください。
> See the [language policy](https://github.com/Naohiro2g/mc-remote-knowledge/blob/main/LANGUAGE_POLICY.md) for public documentation.

## マイクラリモコン版を開く / Open the Minecraft Remote edition

- [公式サイト](https://mc-remote.com/)：マイクラリモコンでマインクラフトに接続して使うエディターへの入口
- [ショーケース](https://naohiro2g.github.io/scratch-editor/)：画面とブロックの見本。マイクラリモコンの接続は無効

The [project website](https://mc-remote.com/) leads to the connected editor. The
[showcase](https://naohiro2g.github.io/scratch-editor/) previews the interface and blocks with the Minecraft Remote connection disabled.

ソースコードを手元で動かすには、Node.js（[`.nvmrc`](.nvmrc) の版）を用意して次を実行します。新規に複製した場合は、各パッケージの成果物を作るため `npm run build` が必要です。

To run the source locally, install the Node.js version in [`.nvmrc`](.nvmrc) and use the commands below. A fresh clone
needs `npm run build` to create the workspace packages' build outputs.

```sh
git clone https://github.com/Naohiro2g/scratch-editor.git
cd scratch-editor
npm ci
npm run build
npm start
```

ブラウザで <http://localhost:8601/> を開きます。これは開発用画面です。既定ではマイクラリモコンの接続が無効なので、実際に遊ぶ場合は公式サイトのエディターを使ってください。

Open <http://localhost:8601/> in a browser. The local development editor has the Minecraft Remote connection disabled by default. Use the editor linked from the project website to play. The original Scratch Foundation README continues below.

If you'd like to use Scratch, please visit the [Scratch website](https://scratch.mit.edu/). You can build your own
Scratch project by pressing "Create" on that website or by visiting <https://scratch.mit.edu/projects/editor/>.

This is a source code repository for the packages that make up the Scratch editor and a few additional support
packages. Use this if you'd like to learn about how the Scratch editor works or to contribute to its development.

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
