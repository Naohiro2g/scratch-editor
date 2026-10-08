import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile


spec = importlib.util.spec_from_file_location('local_build', Path(__file__).with_name('build-mcremote-local.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class LocalBuildTest(unittest.TestCase):
    def license_fixture(self, root, sources):
        (root / 'LICENSE').write_text('Scratch license')
        (root / 'TRADEMARK').write_text('Scratch trademark')
        local = root / 'mc-remote/local'
        local.mkdir(parents=True)
        (local / 'license-overrides.json').write_text('{"entries": []}')
        gui = root / 'packages/scratch-gui/build'
        gui.mkdir(parents=True)
        (gui / 'gui.js.map').write_text(json.dumps({'sources': sources}))
        package = root / 'node_modules/example'
        package.mkdir(parents=True)
        (package / 'package.json').write_text('{"name":"example","version":"1.0.0","license":"MIT"}')
        return [{'location': 'node_modules/example', 'name': 'example', 'version': '1.0.0'}]

    def test_runtime_dependency_without_license_body_stops_packaging(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            installed = self.license_fixture(root, ['webpack://GUI/../node_modules/example/index.js'])
            with patch.object(build, 'ROOT', root), patch.object(build.subprocess, 'check_output',
                    return_value=json.dumps(installed).encode()):
                with self.assertRaisesRegex(ValueError, 'Runtime license text missing: example@1.0.0'):
                    build.license_files()

    def test_nested_source_map_path_marks_only_the_embedded_package_as_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            installed = self.license_fixture(root,
                ['webpack://GUI/../node_modules/example/node_modules/fonts/pixel.ttf'])
            with patch.object(build, 'ROOT', root), patch.object(build.subprocess, 'check_output',
                    return_value=json.dumps(installed).encode()):
                files = build.license_files()
            inventory = json.loads(files['licenses/build-inputs.json'])
            self.assertEqual(inventory[0]['distribution'], 'build-only')
            self.assertEqual(inventory[0]['license_status'], 'not-distributed')
            self.assertEqual(inventory[0]['files'], [])

    def test_supplemental_license_hash_is_checked_and_attribution_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            installed = self.license_fixture(root, ['webpack://GUI/../node_modules/example/index.js'])
            local = root / 'mc-remote/local'
            (local / 'licenses').mkdir()
            body = b'Copyright author\nPermission is hereby granted...'
            (local / 'licenses/example.txt').write_bytes(body)
            override = {'entries': [{'name': 'example', 'version': '1.0.0', 'files': [{
                'path': 'licenses/example.txt', 'bytes': len(body), 'sha256': build.sha256(body),
                'source': {'repository': 'owner/example', 'commit': 'a' * 40, 'path': 'LICENSE'}}]}]}
            (local / 'license-overrides.json').write_text(json.dumps(override))
            with patch.object(build, 'ROOT', root), patch.object(build.subprocess, 'check_output',
                    return_value=json.dumps(installed).encode()):
                files = build.license_files()
                inventory = json.loads(files['licenses/build-inputs.json'])
                self.assertEqual(inventory[0]['distribution'], 'runtime')
                self.assertEqual(inventory[0]['license_status'], 'supplemented')
                self.assertEqual(files[inventory[0]['files'][0]], body)
                (local / 'licenses/example.txt').write_bytes(body + b'changed')
                with self.assertRaisesRegex(ValueError, 'Supplemental license identity mismatch'):
                    build.license_files()

    def test_runtime_preserves_binary_and_license_but_omits_npm(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'node.zip'
            with zipfile.ZipFile(p, 'w') as z:
                z.writestr('node-v24.19.0-win-x64/node.exe', b'official binary')
                z.writestr('node-v24.19.0-win-x64/LICENSE', b'license text')
                z.writestr('node-v24.19.0-win-x64/node_modules/npm/index.js', b'excluded')
            entry = {'file': p.name, 'sha256': build.sha256(p.read_bytes()), 'os': 'windows', 'arch': 'x64'}
            files = build.runtime_files(p, entry)
            self.assertEqual(files['runtime/node.exe'], b'official binary')
            self.assertEqual(files['licenses/Node-LICENSE'], b'license text')
            self.assertEqual(len(files), 2)
            entry['sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'hash'):
                build.runtime_files(p, entry)

    def test_bridge_extracts_only_common_js_and_rejects_different_platforms(self):
        app = {'app/package.json': b'{"type":"module"}', 'app/dist/main.js': b'bridge',
               'app/node_modules/ws/LICENSE': b'ws license'}

        def archive(changed=False):
            blobs = {}
            manifests = []
            for arch in ['amd64', 'arm64']:
                raw = io.BytesIO()
                with tarfile.open(fileobj=raw, mode='w:gz') as layer:
                    values = {**app, 'etc/secret': b'not in bundle'}
                    if changed and arch == 'arm64':
                        values['app/dist/main.js'] = b'different'
                    for name, data in values.items():
                        info = tarfile.TarInfo(name)
                        info.size = len(data)
                        layer.addfile(info, io.BytesIO(data))
                digest = build.sha256(raw.getvalue())
                blobs[digest] = raw.getvalue()
                manifest = json.dumps({'layers': [{'digest': 'sha256:' + digest}]}).encode()
                digest = build.sha256(manifest)
                blobs[digest] = manifest
                manifests.append({'digest': 'sha256:' + digest, 'platform': {'os': 'linux', 'architecture': arch}})
            index = json.dumps({'manifests': manifests}).encode()
            digest = build.sha256(index)
            blobs[digest] = index
            root = json.dumps({'manifests': [{'digest': 'sha256:' + digest}]}).encode()
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode='w') as t:
                for name, data in {'index.json': root, **{'blobs/sha256/' + k: v for k, v in blobs.items()}}.items():
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    t.addfile(info, io.BytesIO(data))
            return output.getvalue(), 'sha256:' + digest

        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'bridge.oci.tar'
            data, digest = archive()
            p.write_bytes(data)
            files = build.bridge_files(p, digest)
            self.assertEqual(files['bridge/dist/main.js'], b'bridge')
            self.assertNotIn('etc/secret', files)
            data, digest = archive(changed=True)
            p.write_bytes(data)
            with self.assertRaisesRegex(ValueError, 'platform'):
                build.bridge_files(p, digest)

    def test_zip_is_repeatable_with_permissions_and_one_top_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / 'bundle.zip'
            files = {'runtime/bin/node': b'node', 'start-mc-remote.sh': b'#!/bin/sh\n', 'identity.json': b'{}'}
            build.write_zip(p, 'bundle', files)
            first = p.read_bytes()
            build.write_zip(p, 'bundle', dict(reversed(list(files.items()))))
            self.assertEqual(first, p.read_bytes())
            with zipfile.ZipFile(p) as z:
                self.assertEqual(z.namelist(), sorted('bundle/' + name for name in files))
                self.assertEqual(z.getinfo('bundle/start-mc-remote.sh').external_attr >> 16 & 0o777, 0o755)
                self.assertEqual(z.read('bundle/identity.json'), b'{}')


if __name__ == '__main__':
    unittest.main()
