import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defaultConnectionTargets, validateConnectionTargets} from './connection-targets.mjs';

test('the two local servers and another host remain separate targets', () => {
    const value = defaultConnectionTargets();
    assert.deepEqual(value.targets[1], {id: 'unity', label: '.NET箱庭', host: '127.0.0.1', port: 25585});
    value.targets.push({id: 'other', label: '別のPC', host: 'server.example', port: 12345});
    assert.deepEqual(validateConnectionTargets(value), value);
    assert.deepEqual(value.targets.map(target => target.port), [25575, 25585, 12345]);
});

test('IDs must be unique, endpoints need not be', () => {
    const value = defaultConnectionTargets();
    value.targets[1].host = value.targets[0].host;
    value.targets[1].port = value.targets[0].port;
    assert.doesNotThrow(() => validateConnectionTargets(value));
    value.targets[1].id = value.targets[0].id;
    assert.throws(() => validateConnectionTargets(value), /重複/);
});

test('rejects missing defaults, unknown fields and invalid endpoints', () => {
    assert.throws(() => validateConnectionTargets({...defaultConnectionTargets(), default_target_id: 'missing'}));
    for (const patch of [{port: 0}, {port: 65536}, {host: 'http://localhost'}, {id: 'bad/id'}, {token: 'no'}]) {
        const value = defaultConnectionTargets();
        Object.assign(value.targets[0], patch);
        assert.throws(() => validateConnectionTargets(value));
    }
});
