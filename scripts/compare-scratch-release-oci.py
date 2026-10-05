from pathlib import Path
import hashlib
import json
import re
import sys
import tarfile
import zipfile

frozen_path = Path(sys.argv[1])
rebuilt_path = Path(sys.argv[2])
output_path = Path(sys.argv[3])


def load_candidate(path):
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read(next(name for name in archive.namelist() if name.endswith('candidate-manifest.json'))))
        image = next(item for item in manifest['artifacts'] if item['role'] == 'scratch')
        entry = next(name for name in archive.namelist() if name.endswith('/' + image['file']) or name == image['file'])
        assert archive.getinfo(entry).file_size == image['bytes']
        archive_hash = hashlib.sha256()
        with archive.open(entry) as stream:
            for chunk in iter(lambda: stream.read(1048576), b''):
                archive_hash.update(chunk)
        assert archive_hash.hexdigest() == image['sha256']
        blobs = {}
        verified_blobs = 0
        with archive.open(entry) as stream, tarfile.open(fileobj=stream, mode='r|') as tar:
            for member in tar:
                if not member.isfile() or not member.name.startswith('blobs/sha256/'):
                    continue
                blob_stream = tar.extractfile(member)
                digest = hashlib.sha256()
                content = bytearray()
                for chunk in iter(lambda: blob_stream.read(1048576), b''):
                    digest.update(chunk)
                    if member.size <= 500000:
                        content.extend(chunk)
                assert digest.hexdigest() == member.name.rsplit('/', 1)[1]
                verified_blobs += 1
                if member.size <= 500000:
                    try:
                        blobs['sha256:' + digest.hexdigest()] = json.loads(content)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        pass
        index = blobs[image['digest']]
        platforms = {}
        for descriptor in index['manifests']:
            platform = descriptor.get('platform', {})
            if platform.get('os') != 'linux' or platform.get('architecture') not in ('amd64', 'arm64'):
                continue
            architecture = platform['architecture']
            assert architecture not in platforms
            image_manifest = blobs[descriptor['digest']]
            config = blobs[image_manifest['config']['digest']]
            assert config['architecture'] == architecture
            platforms[architecture] = {'manifest': image_manifest, 'config': config}
        assert set(platforms) == {'amd64', 'arm64'}
        return manifest, image, platforms, verified_blobs


def differences(before, after, path=''):
    if before == after:
        return []
    if isinstance(before, dict) and isinstance(after, dict):
        result = []
        for key in sorted(before.keys() | after.keys()):
            child = f'{path}.{key}' if path else key
            if key not in before or key not in after:
                result.append({'path': child, 'before': before.get(key), 'after': after.get(key), 'key_presence_changed': True})
            else:
                result.extend(differences(before[key], after[key], child))
        return result
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [difference for i, (old, new) in enumerate(zip(before, after))
                for difference in differences(old, new, f'{path}[{i}]')]
    return [{'path': path, 'before': before, 'after': after}]


def allowed_difference(difference):
    if difference.get('key_presence_changed'):
        return False
    path = difference['path']
    if path == 'config.Labels.org.opencontainers.image.version':
        return difference['before'] == '2320.0.0b9' and difference['after'] == 'v2320.0.0b9'
    if path == 'created' or re.fullmatch(r'history\[\d+\]\.created', path):
        return True
    if re.fullmatch(r'history\[\d+\]\.created_by', path):
        before, after = difference['before'], difference['after']
        return (isinstance(before, str) and isinstance(after, str) and
                'org.opencontainers.image.version=2320.0.0b9' in before and
                before.replace('org.opencontainers.image.version=2320.0.0b9',
                               'org.opencontainers.image.version=v2320.0.0b9') == after)
    return False


old_manifest, old_image, old_platforms, old_blobs = load_candidate(frozen_path)
new_manifest, new_image, new_platforms, new_blobs = load_candidate(rebuilt_path)
source = '7fbbf034488760d8fc7e034bf23f3e08e6e1807d'
assert old_manifest['source']['commit'] == new_manifest['source']['commit'] == source
assert old_image['digest'] == 'sha256:6702b112ad53b48efa2bf99fc0145fc7b23d24a1d20743018582f781f61c9e34'
results = []
for architecture in ('amd64', 'arm64'):
    before, after = old_platforms[architecture], new_platforms[architecture]
    assert before['config']['config']['Labels']['org.opencontainers.image.revision'] == source
    assert after['config']['config']['Labels']['org.opencontainers.image.revision'] == source
    old_layers = [layer['digest'] for layer in before['manifest']['layers']]
    new_layers = [layer['digest'] for layer in after['manifest']['layers']]
    changed = [{**difference, 'allowed': allowed_difference(difference)}
               for difference in differences(before['config'], after['config'])]
    results.append({'architecture': architecture, 'frozen_layers': old_layers, 'rebuilt_layers': new_layers,
                    'all_layer_digests_equal': old_layers == new_layers,
                    'config_differences': changed,
                    'config_difference_scope_allowed': all(item['allowed'] for item in changed)})
passed = all(item['all_layer_digests_equal'] and item['config_difference_scope_allowed'] for item in results)
result = {'knowledge_contract_commit': 'ede3d0fc8d548e76eefadc93b6dd415f9dce7b1b',
          'source_commit': source, 'frozen_scratch_oci': old_image, 'rebuilt_scratch_oci': new_image,
          'verified_oci_blob_counts': {'frozen': old_blobs, 'rebuilt': new_blobs}, 'platforms': results,
          'passed': passed, 'publication_allowed_by_comparison': passed,
          'non_claim': 'Attestation/SBOM layers are generation metadata; the compared layers belong to the linux/amd64 and linux/arm64 runtime images.'}
output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': passed, 'frozen_digest': old_image['digest'], 'rebuilt_digest': new_image['digest'],
                  'platforms': [{'architecture': item['architecture'],
                                 'all_layer_digests_equal': item['all_layer_digests_equal'],
                                 'config_difference_scope_allowed': item['config_difference_scope_allowed']}
                                for item in results]}))
sys.exit(0 if passed else 1)
