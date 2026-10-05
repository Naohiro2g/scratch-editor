"""Compare frozen runtime OCI with the published image under the approved packaging scope."""
from contextlib import contextmanager
from pathlib import Path
import hashlib
import json
import re
import sys
import tarfile
import zipfile

SOURCE = '7fbbf034488760d8fc7e034bf23f3e08e6e1807d'
FROZEN = 'sha256:6702b112ad53b48efa2bf99fc0145fc7b23d24a1d20743018582f781f61c9e34'
KNOWLEDGE = '7eec4255e1b820cf996dc71c42b34d672dea44f8'

@contextmanager
def image_stream(path):
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            entry = next(name for name in archive.namelist() if name.endswith('scratch.oci.tar'))
            with archive.open(entry) as stream:
                yield stream
    else:
        with open(path, 'rb') as stream:
            yield stream

def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()

def load_image(path, expected):
    blobs = {}
    verified = 0
    with image_stream(path) as stream, tarfile.open(fileobj=stream, mode='r|') as archive:
        for entry in archive:
            if not entry.isfile() or not entry.name.startswith('blobs/sha256/'):
                continue
            hasher = hashlib.sha256()
            content = bytearray()
            with archive.extractfile(entry) as data:
                for chunk in iter(lambda: data.read(1048576), b''):
                    hasher.update(chunk)
                    if entry.size <= 500000:
                        content.extend(chunk)
            assert hasher.hexdigest() == entry.name.rsplit('/', 1)[-1], entry.name
            verified += 1
            if entry.size <= 500000:
                try:
                    blobs['sha256:' + hasher.hexdigest()] = json.loads(content)
                except (UnicodeDecodeError, json.JSONDecodeError):
                    pass
    index = blobs[expected]
    platforms = {}
    for item in index['manifests']:
        platform = item.get('platform', {})
        if platform.get('os') != 'linux' or platform.get('architecture') not in ('amd64', 'arm64'):
            continue
        arch = platform['architecture']
        assert arch not in platforms
        manifest = blobs[item['digest']]
        config = blobs[manifest['config']['digest']]
        assert config['architecture'] == arch
        assert config['config']['Labels']['org.opencontainers.image.revision'] == SOURCE
        platforms[arch] = {'manifest': manifest, 'config': config}
    assert set(platforms) == {'amd64', 'arm64'}
    return platforms, verified

def load_layers(path, requested):
    results = {}
    with image_stream(path) as stream, tarfile.open(fileobj=stream, mode='r|') as archive:
        for entry in archive:
            key = 'sha256:' + entry.name.rsplit('/', 1)[-1]
            if not entry.isfile() or key not in requested:
                continue
            records = []
            with tarfile.open(fileobj=archive.extractfile(entry), mode='r|*') as layer:
                for item in layer:
                    content = None
                    if item.isfile():
                        hasher = hashlib.sha256()
                        with layer.extractfile(item) as data:
                            for chunk in iter(lambda: data.read(1048576), b''):
                                hasher.update(chunk)
                        content = hasher.hexdigest()
                    records.append({'path': item.name, 'type': item.type.decode(), 'linkname': item.linkname,
                                    'size': item.size, 'sha256': content, 'mode': item.mode,
                                    'uid': item.uid, 'gid': item.gid, 'uname': item.uname, 'gname': item.gname,
                                    'mtime': item.mtime, 'pax_headers': item.pax_headers})
            results[key] = records
    assert set(results) == requested
    return results

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
        return [item for i, (a, b) in enumerate(zip(before, after)) for item in differences(a, b, f'{path}[{i}]')]
    return [{'path': path, 'before': before, 'after': after}]

def allowed_config(change, changed_layer_indexes):
    if change.get('key_presence_changed'):
        return False
    path, before, after = change['path'], change['before'], change['after']
    if path == 'config.Labels.org.opencontainers.image.version':
        return before == '2320.0.0b9' and after == 'v2320.0.0b9'
    if path == 'created' or re.fullmatch(r'history\[\d+\]\.created', path):
        return True
    rootfs = re.fullmatch(r'rootfs.diff_ids\[(\d+)\]', path)
    if rootfs:
        return int(rootfs[1]) in changed_layer_indexes
    if re.fullmatch(r'history\[\d+\]\.created_by', path) and isinstance(before, str) and isinstance(after, str):
        if before == 'ARG RELEASE_VERSION=2320.0.0b9' and after == 'ARG RELEASE_VERSION=v2320.0.0b9':
            return True
        if before.startswith('EXPOSE &{'):
            return re.sub(r'0x[0-9a-f]+', '[address]', before) == re.sub(r'0x[0-9a-f]+', '[address]', after)
        return ('org.opencontainers.image.version=2320.0.0b9' in before and
                before.replace('org.opencontainers.image.version=2320.0.0b9', 'org.opencontainers.image.version=v2320.0.0b9') == after)
    return False

def compare(frozen_path, published_path, published_digest):
    old, old_count = load_image(frozen_path, FROZEN)
    new, new_count = load_image(published_path, published_digest)
    pairs = []
    for arch in ('amd64', 'arm64'):
        a, b = old[arch]['manifest']['layers'], new[arch]['manifest']['layers']
        assert len(a) == len(b)
        pairs.extend((arch, i, left['digest'], right['digest']) for i, (left, right) in enumerate(zip(a, b)) if left['digest'] != right['digest'])
    old_layers = load_layers(frozen_path, {p[2] for p in pairs})
    new_layers = load_layers(published_path, {p[3] for p in pairs})
    results = []
    for arch in ('amd64', 'arm64'):
        layers = []
        changed_indexes = set()
        for pair_arch, i, left, right in pairs:
            if pair_arch != arch:
                continue
            a, b = old_layers[left], new_layers[right]
            changes = differences(a, b)
            rejected = [c for c in changes if not re.fullmatch(r'\[\d+\]\.mtime', c['path'])]
            layers.append({'index': i, 'frozen_digest': left, 'published_digest': right,
                           'frozen_entry_count': len(a), 'published_entry_count': len(b),
                           'mtime_change_count': len(changes) - len(rejected), 'unexpected_changes': rejected,
                           'content_and_metadata_equal_except_mtime': not rejected})
            if not rejected:
                changed_indexes.add(i)
        config_changes = [{**c, 'allowed': allowed_config(c, changed_indexes)} for c in differences(old[arch]['config'], new[arch]['config'])]
        equal_count = len(old[arch]['manifest']['layers']) - len(layers)
        results.append({'architecture': arch, 'identical_digest_layer_count': equal_count, 'changed_layers': layers,
                        'config_differences': config_changes,
                        'passed': all(v['content_and_metadata_equal_except_mtime'] for v in layers) and all(c['allowed'] for c in config_changes)})
    return {'knowledge_contract_commit': KNOWLEDGE, 'source_commit': SOURCE,
            'frozen_digest': FROZEN, 'published_digest': published_digest,
            'verified_oci_blob_counts': {'frozen': old_count, 'published': new_count},
            'platforms': results, 'passed': all(p['passed'] for p in results),
            'non_claim': 'Attestation and SBOM descriptors are generated metadata; runtime manifests, configs, and all changed runtime layers are compared. Equal layer digests prove equal bytes.'}

if __name__ == '__main__':
    report = compare(sys.argv[1], sys.argv[2], sys.argv[3])
    Path(sys.argv[4]).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'published_digest': report['published_digest'],
                      'platforms': [{k: p[k] for k in ('architecture', 'identical_digest_layer_count', 'passed')} for p in report['platforms']]}))
    sys.exit(0 if report['passed'] else 1)
