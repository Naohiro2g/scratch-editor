"""Build deterministic Scratch Local ZIPs from pinned tooling and Node inputs."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def runtime_files(archive, entry):
    data = archive.read_bytes()
    if sha256(data) != entry['sha256']:
        raise ValueError('Node archive hash differs from local-runtime-lock')
    if entry['os'] == 'windows':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            prefix = z.namelist()[0].split('/')[0]
            binary = z.read(prefix + '/node.exe')
            license_text = z.read(prefix + '/LICENSE')
        path = 'runtime/node.exe'
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as t:
            prefix = t.getmembers()[0].name.split('/')[0]
            binary = t.extractfile(prefix + '/bin/node').read()
            license_text = t.extractfile(prefix + '/LICENSE').read()
        path = 'runtime/bin/node'
    return {path: binary, 'licenses/Node-LICENSE': license_text}


def bridge_files(archive, pinned_digest):
    with tarfile.open(archive) as outer:
        def blob(digest):
            data = outer.extractfile('blobs/sha256/' + digest.removeprefix('sha256:')).read()
            if 'sha256:' + sha256(data) != digest:
                raise ValueError('Bridge OCI blob hash mismatch')
            return data

        index = json.load(outer.extractfile('index.json'))
        if not any(item['digest'] == pinned_digest for item in index['manifests']):
            raise ValueError('Bridge OCI index does not reference tooling-lock digest')
        manifests = json.loads(blob(pinned_digest))['manifests']
        platforms = []
        for arch in ['amd64', 'arm64']:
            manifest = next(item for item in manifests if item.get('platform') == {'os': 'linux', 'architecture': arch})
            files = {}
            for layer in json.loads(blob(manifest['digest']))['layers']:
                with tarfile.open(fileobj=io.BytesIO(blob(layer['digest'])), mode='r:*') as t:
                    for member in t:
                        name = member.name.removeprefix('./')
                        if not name.startswith('app/') or member.isdir():
                            continue
                        relative = PurePosixPath(name).relative_to('app')
                        if '..' in relative.parts or not member.isfile() or relative.name.startswith('.wh.'):
                            raise ValueError('Bridge app contains unsupported archive entry: ' + name)
                        files['bridge/' + str(relative)] = t.extractfile(member).read()
            platforms.append(files)
        if platforms[0] != platforms[1]:
            raise ValueError('Bridge app differs between OCI platforms; requires owner review')
        for required in ['bridge/dist/main.js', 'bridge/package.json', 'bridge/node_modules/ws/LICENSE']:
            if required not in platforms[0]:
                raise ValueError('Bridge app is missing ' + required)
        if any(name.endswith(('.node', '.so', '.exe')) for name in platforms[0]):
            raise ValueError('Bridge contains native platform dependency; requires owner review')
        return platforms[0]


def wirescope_files(archive, manifest, tooling):
    files = {}
    for path in [archive, manifest]:
        pinned = next(item for item in tooling['artifacts']['files'] if item['file'] == path.name)
        data = path.read_bytes()
        if len(data) != pinned['bytes'] or sha256(data) != pinned['sha256']:
            raise ValueError('WireScope artifact differs from tooling-lock: ' + path.name)
        files[path.name] = data
    identity = json.loads(files[manifest.name])
    if identity['source']['commit'] != tooling['source']['commit'] or \
            identity['archive']['sha256'] != sha256(files[archive.name]):
        raise ValueError('WireScope manifest differs from tooling-lock source or archive')
    with zipfile.ZipFile(io.BytesIO(files[archive.name])) as z:
        assets = identity['assets']
        names = [asset['path'] for asset in assets]
        if sorted(names) != sorted(z.namelist()) or len(names) != len(set(names)):
            raise ValueError('WireScope archive differs from manifest inventory')
        if not {'index.html', 'LICENSE', 'NOTICE'}.issubset(names):
            raise ValueError('WireScope app or license files missing')
        for asset in assets:
            name = asset['path']
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or '\\' in name:
                raise ValueError('WireScope asset path is outside app: ' + name)
            data = z.read(name)
            if len(data) != asset['bytes'] or sha256(data) != asset['sha256']:
                raise ValueError('WireScope asset identity mismatch: ' + name)
            files['wirescope/' + name] = data
    return files


def write_zip(destination, name, files):
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path, data in sorted(files.items()):
            info = zipfile.ZipInfo(name + '/' + path, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            executable = path in ['start-mc-remote.sh', 'start-mc-remote.command', 'runtime/bin/node']
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            z.writestr(info, data, compresslevel=6)


def source_archive():
    paths = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0'))
    paths.discard('')
    paths.update(str(p.relative_to(ROOT)) for p in (ROOT / 'mc-remote/local').rglob('*') if p.is_file())
    paths.update(['scripts/build-mcremote-local.py', 'scripts/build-mcremote-local.test.py',
                  'scripts/mcremote-local-artifacts.mjs', 'scripts/mcremote-local-artifacts.test.mjs',
                  'scripts/acquire-mcremote-local.mjs', 'scripts/acquire-mcremote-local.test.mjs',
                  'scripts/test-mcremote-local.mjs',
                  'mc-remote/local-runtime-lock.json'])
    data = io.BytesIO()
    with gzip.GzipFile(fileobj=data, mode='wb', filename='', mtime=0, compresslevel=6) as g:
        with tarfile.open(fileobj=g, mode='w') as t:
            for name in sorted(paths):
                path = ROOT / name
                if not path.is_file():
                    continue
                content = path.read_bytes()
                info = tarfile.TarInfo(name)
                info.size = len(content)
                info.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
                t.addfile(info, io.BytesIO(content))
    return data.getvalue()


def bundled_packages(gui):
    evidence = {}
    maps = sorted(gui.rglob('*.map'))
    if not maps:
        raise ValueError('Scratch source maps are required to review bundled licenses')
    for path in maps:
        for source in json.loads(path.read_text()).get('sources', []):
            matches = list(re.finditer(r'node_modules/((?:@[^/]+/)?[^/]+)', source))
            if matches:
                name = matches[-1][1]
                reference = path.relative_to(gui).as_posix() + ': ' + source
                values = evidence.setdefault(name, [])
                if len(values) < 3 and reference not in values:
                    values.append(reference)
    if 'scratch-blocks' in evidence:
        evidence['blockly'] = ['Blockly is embedded in scratch-blocks/dist/main.mjs']
    if (gui / 'chunks/mediapipe/face_detection').is_dir():
        evidence['@mediapipe/face_detection'] = ['CopyWebpackPlugin: chunks/mediapipe/face_detection']
    return evidence


def license_files():
    files = {'licenses/Scratch-AGPL-3.0.txt': (ROOT / 'LICENSE').read_bytes(),
             'licenses/Scratch-TRADEMARK': (ROOT / 'TRADEMARK').read_bytes()}
    inventory = []
    evidence = bundled_packages(ROOT / 'packages/scratch-gui/build')
    local = ROOT / 'mc-remote/local'
    overrides = json.loads((local / 'license-overrides.json').read_text())
    supplemental = {(item['name'], item['version']): item for item in overrides['entries']}
    installed = json.loads(subprocess.check_output(['npm', 'query', '*'], cwd=ROOT))
    for package in sorted(installed, key=lambda item: item['location']):
        location = package['location']
        if not location:
            continue
        if not package.get('name'):
            print('license_files: unresolved npm link has no package metadata: ' + location)
            continue
        directory = ROOT / location
        if not directory.is_dir() or not (directory / 'package.json').is_file():
            raise ValueError('Installed build dependency is missing: ' + location)
        metadata = json.loads((directory / 'package.json').read_text())
        found = []
        for p in sorted(directory.iterdir()):
            if p.is_file() and re.match(r'^(license|licence|copying|notice)(\b|[._-])', p.name, re.I):
                destination = 'licenses/build-inputs/' + location + '/' + p.name
                files[destination] = p.read_bytes()
                found.append(destination)
        original_files = list(found)
        name, version = metadata['name'], metadata['version']
        sources = []
        override = supplemental.get((name, version))
        if override:
            for entry in override['files']:
                data = (local / entry['path']).read_bytes()
                if len(data) != entry['bytes'] or sha256(data) != entry['sha256']:
                    raise ValueError('Supplemental license identity mismatch: ' + entry['path'])
                destination = 'licenses/supplemental/' + entry['path'].removeprefix('licenses/')
                files[destination] = data
                found.append(destination)
                sources.append(entry['source'])
        runtime = name in evidence
        if runtime and not found:
            raise ValueError('Runtime license text missing: ' + name + '@' + version)
        inventory.append({'name': name, 'version': version, 'location': location,
                          'declared_license': metadata.get('license', metadata.get('licenses')),
                          'distribution': 'runtime' if runtime else 'build-only',
                          'evidence': evidence.get(name, []),
                          'root_license_missing': not original_files,
                          'review_open': bool(override and override.get('review_open')),
                          'license_status': 'supplemented' if override else 'included' if found else 'not-distributed',
                          'supplemental_sources': sources, 'files': found})
    files['licenses/build-inputs.json'] = json_bytes(inventory)
    files['licenses/supplemental-sources.json'] = json_bytes(overrides)
    gaps = [item for item in inventory if item['root_license_missing']]
    files['licenses/review.json'] = json_bytes({
        'schema': 'mc-remote.scratch-local-license-review', 'schema_version': 1,
        'gap_entries': len(gaps),
        'runtime_gap_entries': sum(item['distribution'] == 'runtime' for item in gaps),
        'build_only_gap_entries': sum(item['distribution'] == 'build-only' for item in gaps),
        'open_reviews': [{'name': item['name'], 'version': item['version']}
                         for item in gaps if item['review_open']],
        'entries': gaps})
    return files


def build(args):
    runtime_lock = json.loads((ROOT / 'mc-remote/local-runtime-lock.json').read_text())
    entry = next((item for item in runtime_lock['artifacts'] if (item['os'], item['arch']) == (args.os, args.arch)), None)
    if entry is None:
        raise ValueError('OS/arch is not pinned in local-runtime-lock')
    tooling = json.loads((ROOT / 'mc-remote/tooling-lock.json').read_text())
    bridge = ROOT / 'mc-remote/tooling/artifacts/bridge.oci.tar'
    pinned = next(item for item in tooling['artifacts']['files'] if item['file'] == bridge.name)
    if bridge.stat().st_size != pinned['bytes'] or sha256(bridge.read_bytes()) != pinned['sha256']:
        raise ValueError('Bridge archive differs from tooling-lock')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
    if not re.fullmatch('[a-f0-9]{40}', args.commit) or head != args.commit:
        raise ValueError('--commit must equal the full current HEAD')
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=ROOT))
    dirty = dirty or bool(subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--',
        'mc-remote/local', 'mc-remote/local-runtime-lock.json', 'scripts/build-mcremote-local.py',
        'scripts/mcremote-local-artifacts.mjs'], cwd=ROOT))
    if dirty and not args.allow_dirty:
        raise ValueError('Working tree is dirty; local drafts require --allow-dirty')
    version = re.search(r"module.exports = '([^']+)'", (ROOT / 'packages/scratch-vm/src/extensions/scratch3_mcremote/client-version.js').read_text())[1]
    gui = ROOT / 'packages/scratch-gui/build'
    if version not in (gui / 'gui.js').read_text():
        raise ValueError('Scratch GUI build does not contain current client version; run npm run build')
    cache = ROOT / 'mc-remote/local-inputs'
    cache.mkdir(exist_ok=True)
    runtime_archive = cache / entry['file']
    runtime_url = 'https://nodejs.org/dist/v' + runtime_lock['version'] + '/' + entry['file']
    if not runtime_archive.exists():
        temporary = runtime_archive.with_suffix(runtime_archive.suffix + '.tmp')
        with urllib.request.urlopen(runtime_url, timeout=60) as response:
            data = response.read()
        if sha256(data) != entry['sha256']:
            raise ValueError('Downloaded Node archive hash differs from lock')
        temporary.write_bytes(data)
        temporary.replace(runtime_archive)
    files = runtime_files(runtime_archive, entry)
    files.update(bridge_files(bridge, tooling['artifacts']['bridge_digest']))
    artifact_root = ROOT / 'mc-remote/tooling/artifacts'
    files.update(wirescope_files(artifact_root / 'wirescope-app.zip',
                                artifact_root / 'wirescope-app.manifest.json', tooling))
    files.update(license_files())
    for path in sorted(gui.rglob('*')):
        if path.is_file():
            files['scratch/' + path.relative_to(gui).as_posix()] = path.read_bytes()
    for name in ['launcher.mjs', 'setup.html']:
        files['app/' + name] = (ROOT / 'mc-remote/local' / name).read_bytes()
    source = source_archive()
    files['source/scratch-source.tar.gz'] = source
    files['licenses/Bridge-AGPL-3.0.txt'] = (ROOT / 'LICENSE').read_bytes()
    files['licenses/ws-LICENSE'] = files['bridge/node_modules/ws/LICENSE']
    files['NOTICE_ja.md'] = (ROOT / 'mc-remote/local/NOTICE_ja.md').read_bytes()
    files['README_ja.md'] = (ROOT / 'mc-remote/local/USER_GUIDE_ja.md').read_bytes()
    identity = {'schema': 'mc-remote.scratch-local', 'schema_version': 1, 'version': version,
                'os': args.os, 'arch': args.arch,
                'source': {'repository': 'https://github.com/Naohiro2g/scratch-editor', 'commit': head,
                           'working_tree_dirty': dirty, 'archive': 'source/scratch-source.tar.gz',
                           'archive_sha256': sha256(source)},
                'tooling': {**tooling['source'], 'bridge_digest': tooling['artifacts']['bridge_digest'],
                            'bridge_archive_sha256': pinned['sha256'],
                            'wirescope_archive_sha256': sha256(files['wirescope-app.zip']),
                            'wirescope_manifest_sha256': sha256(files['wirescope-app.manifest.json'])},
                'runtime': {'name': 'Node.js', 'version': runtime_lock['version'], 'url': runtime_url,
                            'archive_sha256': entry['sha256']}}
    files['identity.json'] = json_bytes(identity)
    files['SOURCE_ja.md'] = ('# 対応するソース\n\n'
        'Scratchとランチャー: 同梱の`source/scratch-source.tar.gz`。`npm ci`、`npm run build`で再構築します。\n\n'
        f'Bridge: https://github.com/{tooling["source"]["repository"]}/tree/{tooling["source"]["commit"]}\n\n'
        'Bridgeの入力はtooling-lock.jsonで固定したOCIの/appから、変更せず取り出しています。\n\n'
        f'WireScope: https://github.com/{tooling["source"]["repository"]}/tree/{tooling["source"]["commit"]}/packages/live\n\n'
        'WireScopeの入力と再構築の手順はwirescope-app.manifest.jsonに記載しています。\n\n'
        f'Node.js: https://nodejs.org/dist/v{runtime_lock["version"]}/node-v{runtime_lock["version"]}.tar.gz\n\n'
        '第三者のbuild入力はpackage-lock.json、ライセンス本文とnoticeはlicenses/と各Scratch bundleのLICENSE.txtを参照してください。\n').encode()
    if args.os == 'windows':
        launcher = '@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node.exe" "app\\launcher.mjs" --open\r\nif errorlevel 1 pause\r\n'
        suffix = 'cmd'
    else:
        launcher = '#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nexec "./runtime/bin/node" "./app/launcher.mjs" --open\n'
        suffix = 'command' if args.os == 'macos' else 'sh'
    files['start-mc-remote.' + suffix] = launcher.encode()
    name = f'mc-remote-scratch-local-{version}-{args.os}-{args.arch}'
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    destination = output / (name + '.zip')
    write_zip(destination, name, files)
    artifact = {'role': 'scratch-local', 'kind': 'file', 'file': destination.name, 'os': args.os, 'arch': args.arch,
                'bytes': destination.stat().st_size, 'sha256': sha256(destination.read_bytes()),
                'source_commit': head, 'working_tree_dirty': dirty}
    (output / (name + '.artifact.json')).write_bytes(json_bytes(artifact))
    print(json.dumps(artifact))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--os', required=True, choices=['windows', 'macos', 'linux'])
    parser.add_argument('--arch', required=True, choices=['x64', 'arm64'])
    parser.add_argument('--commit', required=True)
    parser.add_argument('--output', default='candidate')
    parser.add_argument('--allow-dirty', action='store_true')
    build(parser.parse_args())
