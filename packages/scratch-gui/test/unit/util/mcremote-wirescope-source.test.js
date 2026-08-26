import {
    createWireScopeSource,
    toWireScopeSnapshot
} from '../../../src/lib/mcremote-wirescope-source';
import eventsFixture from '../../../../../mc-remote/protocol/test/fixtures/events-v23.json';
import dimensionFixture from '../../../../../mc-remote/protocol/test/fixtures/dimensions-v22.json';
import spawnFixture from '../../../../../mc-remote/protocol/test/fixtures/spawn-v22.json';

// spawn-v22.json's spawn_entity.result predates the protocol 23 mcr_eh_ handle prefix
// (DECISIONS 2026-08-26-08) and is kept as-is since it is a protocol-22-labeled fixture;
// use a protocol 23 handle here instead when exercising the current allowlist.
const PROTOCOL_23_ENTITY_HANDLE = 'mcr_eh_example';

const connectedObservation = () => ({
    status: 'connected',
    streamId: 'default',
    sourceKind: 'scratch',
    displayAlias: 'MOSS-ORBIT-000027',
    pairCode: '123-456',
    pairCommand: '/mcremote pair 123-456',
    hello: {
        protocol: '22.0.0',
        mc_version: '1.21.11',
        supported_mc_versions: ['1.21.11'],
        catalogHash: null,
        world_constants: {y_sea: 62, future_secret: 'no'},
        dimension: 'minecraft:overworld',
        origin: [200, 0, 200],
        player: 'player-uuid',
        permissions: {
            online: true,
            offline: false,
            buildRange: 100,
            credential_id: 'credential-1'
        }
    },
    frameLog: [{
        sequence: 1,
        timestamp: 1000,
        streamId: 'default',
        direction: 'send',
        id: 1,
        method: 'hello',
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'hello',
            params: {
                protocol: '22.0.0',
                client: {name: 'scratch-mcremote', version: 'build-1'},
                auth: {token: 'mcrs_secret'},
                device_label: 'classroom laptop'
            }
        }
    }, {
        sequence: 2,
        timestamp: 1001,
        streamId: 'default',
        direction: 'receive',
        id: 2,
        method: 'auth.pairPoll',
        payload: {result: {token: 'mcrs_secret'}}
    }, {
        sequence: 3,
        timestamp: 1002,
        streamId: 'default',
        direction: 'send',
        id: 3,
        method: 'world.setBlock',
        payload: {params: [1, 2, 3, {block_id: 'minecraft:stone', state: {}}]}
    }]
});

describe('McRemote WireScope source adapter', () => {
    test('projects a connected Scratch observation through a generation-side allowlist', () => {
        const snapshot = toWireScopeSnapshot(connectedObservation(), 'target-01', 2000);

        expect(snapshot).toMatchObject({
            schema: 'mcremote.observer',
            schema_version: 1,
            emitted_at: 2000,
            target: {
                id: 'target-01',
                display_alias: 'MOSS-ORBIT-000027',
                source_kind: 'scratch'
            },
            streams: [{
                id: 'main',
                kind: 'main',
                hello: {
                    protocol: '22.0.0',
                    dimension: 'minecraft:overworld',
                    origin: [200, 0, 200],
                    permissions: {online: true, offline: false, build_range: 100}
                }
            }]
        });
        expect(snapshot.streams[0].frames).toHaveLength(2);
        expect(snapshot.streams[0].frames.map((...[frame]) => frame.method)).toEqual([
            'hello',
            'world.setBlock'
        ]);
        const serialized = JSON.stringify(snapshot);
        for (const forbidden of [
            'mcrs_secret', 'pairCode', 'pair_code', 'pairCommand', 'player-uuid',
            'credential_id', 'device_label', 'future_secret', 'auth.pairPoll', 'auth'
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    test('projects protocol 22 FAST notifications and connection.flush without synthetic results', () => {
        const observation = connectedObservation();
        observation.frameLog.push({
            sequence: 4,
            timestamp: 1003,
            streamId: 'default',
            direction: 'send',
            method: 'world.setBlock',
            payload: {params: [4, 5, 6, {block_id: 'oak_log', state: {axis: 'z'}}]}
        }, {
            sequence: 5,
            timestamp: 1004,
            streamId: 'default',
            direction: 'send',
            id: 4,
            method: 'connection.flush',
            payload: {params: []}
        }, {
            sequence: 6,
            timestamp: 1005,
            streamId: 'default',
            direction: 'receive',
            id: 4,
            method: 'connection.flush',
            payload: {result: null}
        });

        const snapshot = toWireScopeSnapshot(observation, 'target-01', 2000);
        expect(snapshot.streams[0].frames.slice(-3)).toEqual([{
            sequence: 4,
            observed_at: 1003,
            direction: 'send',
            request_id: null,
            method: 'world.setBlock',
            payload: {params: [4, 5, 6, {block_id: 'oak_log', state: {axis: 'z'}}]}
        }, {
            sequence: 5,
            observed_at: 1004,
            direction: 'send',
            request_id: 4,
            method: 'connection.flush',
            payload: {params: []}
        }, {
            sequence: 6,
            observed_at: 1005,
            direction: 'receive',
            request_id: 4,
            method: 'connection.flush',
            payload: {result: null}
        }]);
    });

    test('projects strict events.poll requests and results without changing schema_version', () => {
        const observation = connectedObservation();
        observation.frameLog.push({
            sequence: 10,
            timestamp: 1010,
            streamId: 'default',
            direction: 'send',
            id: 7,
            method: 'events.poll',
            payload: {params: eventsFixture.poll_requests.default}
        }, {
            sequence: 11,
            timestamp: 1011,
            streamId: 'default',
            direction: 'receive',
            id: 7,
            method: 'events.poll',
            payload: {result: eventsFixture.poll_result}
        });

        const snapshot = toWireScopeSnapshot(observation, 'target-01', 2000);
        expect(snapshot.schema_version).toBe(1);
        expect(snapshot.streams[0].frames.slice(-2)).toEqual([{
            sequence: 10,
            observed_at: 1010,
            direction: 'send',
            request_id: 7,
            method: 'events.poll',
            payload: {params: [0]}
        }, {
            sequence: 11,
            observed_at: 1011,
            direction: 'receive',
            request_id: 7,
            method: 'events.poll',
            payload: {result: eventsFixture.poll_result}
        }]);
    });

    test('does not project pairing or disconnected observations', () => {
        expect(toWireScopeSnapshot({status: 'pairing'}, 'target-01', 2000)).toBeNull();
        expect(toWireScopeSnapshot({status: 'closed'}, 'target-01', 2000)).toBeNull();
    });

    test('projects player pose requests and strict pose results', () => {
        const observation = connectedObservation();
        observation.frameLog.push({
            sequence: 4,
            timestamp: 1003,
            streamId: 'default',
            direction: 'send',
            id: 4,
            method: 'player.getPose',
            payload: {params: []}
        }, {
            sequence: 5,
            timestamp: 1004,
            streamId: 'default',
            direction: 'receive',
            id: 4,
            method: 'player.getPose',
            payload: {result: {dimension: 'minecraft:overworld', pos: [5, 6, 7], yaw: 135, pitch: -20}}
        });

        const snapshot = toWireScopeSnapshot(observation, 'target-01', 2000);
        expect(snapshot.streams[0].frames.slice(-2)).toEqual([{
            sequence: 4,
            observed_at: 1003,
            direction: 'send',
            request_id: 4,
            method: 'player.getPose',
            payload: {params: []}
        }, {
            sequence: 5,
            observed_at: 1004,
            direction: 'receive',
            request_id: 4,
            method: 'player.getPose',
            payload: {result: {dimension: 'minecraft:overworld', pos: [5, 6, 7], yaw: 135, pitch: -20}}
        }]);
    });

    test('preserves a raw DimensionRef and validates the canonical setter result', () => {
        const observation = connectedObservation();
        observation.frameLog.push({
            sequence: 4,
            timestamp: 1003,
            streamId: 'default',
            direction: 'send',
            id: 4,
            method: 'build.setDimension',
            payload: {params: ['myworld:world']}
        }, {
            sequence: 5,
            timestamp: 1004,
            streamId: 'default',
            direction: 'receive',
            id: 4,
            method: 'build.setDimension',
            payload: {result: dimensionFixture.custom_build_context}
        });

        const frames = toWireScopeSnapshot(observation, 'target-01', 2000).streams[0].frames.slice(-2);
        expect(frames[0].payload).toEqual({params: ['myworld:world']});
        expect(frames[1].payload).toEqual({result: dimensionFixture.custom_build_context});
    });

    test('projects height and coordinate-first spawn requests and results', () => {
        const observation = connectedObservation();
        observation.frameLog.push({
            sequence: 4,
            timestamp: 1003,
            streamId: 'default',
            direction: 'send',
            id: 4,
            method: 'world.getHeight',
            payload: {params: [7, 9, 20]}
        }, {
            sequence: 5,
            timestamp: 1004,
            streamId: 'default',
            direction: 'receive',
            id: 4,
            method: 'world.getHeight',
            payload: {result: -1}
        }, {
            sequence: 6,
            timestamp: 1005,
            streamId: 'default',
            direction: 'send',
            id: 5,
            method: 'world.spawnEntity',
            payload: {params: spawnFixture.spawn_entity.params}
        }, {
            sequence: 7,
            timestamp: 1006,
            streamId: 'default',
            direction: 'receive',
            id: 5,
            method: 'world.spawnEntity',
            payload: {result: PROTOCOL_23_ENTITY_HANDLE}
        }, {
            sequence: 8,
            timestamp: 1007,
            streamId: 'default',
            direction: 'send',
            id: 6,
            method: 'world.spawnParticle',
            payload: {params: spawnFixture.spawn_particle.explicit_false.params}
        }, {
            sequence: 9,
            timestamp: 1008,
            streamId: 'default',
            direction: 'receive',
            id: 6,
            method: 'world.spawnParticle',
            payload: {result: spawnFixture.spawn_particle.explicit_false.result}
        });

        const snapshot = toWireScopeSnapshot(observation, 'target-01', 2000);
        expect(snapshot.streams[0].frames.slice(-6)).toEqual([{
            sequence: 4,
            observed_at: 1003,
            direction: 'send',
            request_id: 4,
            method: 'world.getHeight',
            payload: {params: [7, 9, 20]}
        }, {
            sequence: 5,
            observed_at: 1004,
            direction: 'receive',
            request_id: 4,
            method: 'world.getHeight',
            payload: {result: -1}
        }, {
            sequence: 6,
            observed_at: 1005,
            direction: 'send',
            request_id: 5,
            method: 'world.spawnEntity',
            payload: {params: spawnFixture.spawn_entity.params}
        }, {
            sequence: 7,
            observed_at: 1006,
            direction: 'receive',
            request_id: 5,
            method: 'world.spawnEntity',
            payload: {result: PROTOCOL_23_ENTITY_HANDLE}
        }, {
            sequence: 8,
            observed_at: 1007,
            direction: 'send',
            request_id: 6,
            method: 'world.spawnParticle',
            payload: {params: spawnFixture.spawn_particle.explicit_false.params}
        }, {
            sequence: 9,
            observed_at: 1008,
            direction: 'receive',
            request_id: 6,
            method: 'world.spawnParticle',
            payload: {result: spawnFixture.spawn_particle.explicit_false.result}
        }]);
    });

    test('rejects legacy spawn order and malformed particle params', () => {
        const observation = connectedObservation();
        observation.frameLog.push({
            sequence: 4,
            timestamp: 1003,
            streamId: 'default',
            direction: 'send',
            id: 4,
            method: 'world.spawnEntity',
            payload: {params: spawnFixture.spawn_entity.legacy_entity_first}
        }, {
            sequence: 5,
            timestamp: 1004,
            streamId: 'default',
            direction: 'send',
            id: 5,
            method: 'world.spawnParticle',
            payload: {params: [1, 2, 3, -1, 0, 0, 'minecraft:flame', 0, 1]}
        });

        const snapshot = toWireScopeSnapshot(observation, 'target-01', 2000);
        expect(snapshot.streams[0].frames).toHaveLength(2);
    });

    test('accepts a protocol 23 mcr_eh_ entity handle and rejects a protocol-22 mceh_ handle', () => {
        const withMcrEh = connectedObservation();
        withMcrEh.frameLog.push({
            sequence: 4,
            timestamp: 1003,
            streamId: 'default',
            direction: 'receive',
            id: 4,
            method: 'world.spawnEntity',
            payload: {result: 'mcr_eh_abc123'}
        });
        const acceptedSnapshot = toWireScopeSnapshot(withMcrEh, 'target-01', 2000);
        expect(acceptedSnapshot.streams[0].frames.map((...[frame]) => frame.method))
            .toContain('world.spawnEntity');

        const withMceh = connectedObservation();
        withMceh.frameLog.push({
            sequence: 4,
            timestamp: 1003,
            streamId: 'default',
            direction: 'receive',
            id: 4,
            method: 'world.spawnEntity',
            payload: {result: 'mceh_legacy'}
        });
        const rejectedSnapshot = toWireScopeSnapshot(withMceh, 'target-01', 2000);
        expect(rejectedSnapshot.streams[0].frames.map((...[frame]) => frame.method))
            .not.toContain('world.spawnEntity');
    });

    test('hands a one-time grant over MessageChannel and ends it with the target', () => {
        const windowListeners = {};
        const observerWindow = {postMessage: jest.fn()};
        const port1 = {
            addEventListener: jest.fn((type, listener) => {
                port1.listener = listener;
            }),
            start: jest.fn(),
            postMessage: jest.fn(),
            close: jest.fn()
        };
        const port2 = {};
        const sourceWindow = {
            addEventListener: jest.fn((type, listener) => {
                windowListeners[type] = listener;
            }),
            removeEventListener: jest.fn(),
            open: jest.fn(() => observerWindow)
        };
        const environment = {
            window: sourceWindow,
            MessageChannel: jest.fn(() => ({port1, port2})),
            crypto: {getRandomValues: function (array) {
                array.fill(7);
                return array;
            }},
            now: jest.fn(() => 5000),
            setTimeout: jest.fn(() => 9),
            clearTimeout: jest.fn()
        };
        const source = createWireScopeSource(environment);
        source.update(connectedObservation());

        expect(source.launch('https://live.example/wirescope')).toBe(true);
        windowListeners.message({
            source: observerWindow,
            origin: 'https://attacker.example',
            data: {type: 'mcremote.wirescope.ready', protocol_version: 1}
        });
        expect(environment.MessageChannel).not.toHaveBeenCalled();
        windowListeners.message({
            source: observerWindow,
            origin: 'https://live.example',
            data: {type: 'mcremote.wirescope.ready', protocol_version: 1}
        });

        expect(observerWindow.postMessage).toHaveBeenCalledWith({
            type: 'mcremote.wirescope.attach',
            protocol_version: 1
        }, 'https://live.example', [port2]);
        const grantMessage = port1.postMessage.mock.calls[0][0];
        expect(grantMessage).toMatchObject({
            type: 'mcremote.wirescope.grant',
            protocol_version: 1,
            expires_at: 20000
        });
        expect(grantMessage.grant).toHaveLength(48);
        expect(JSON.stringify(observerWindow.postMessage.mock.calls)).not.toContain(grantMessage.grant);
        expect(environment.setTimeout.mock.contexts[0]).toBe(sourceWindow);

        port1.listener({
            data: {
                type: 'mcremote.wirescope.redeem',
                protocol_version: 1,
                grant: grantMessage.grant
            }
        });
        expect(port1.postMessage.mock.calls[1][0]).toMatchObject({
            type: 'mcremote.wirescope.snapshot',
            protocol_version: 1,
            snapshot: {schema: 'mcremote.observer'}
        });

        port1.listener({
            data: {
                type: 'mcremote.wirescope.redeem',
                protocol_version: 1,
                grant: grantMessage.grant
            }
        });
        expect(port1.postMessage).toHaveBeenCalledTimes(2);
        expect(environment.clearTimeout.mock.contexts[0]).toBe(sourceWindow);

        source.update({status: 'closed'});
        expect(port1.postMessage.mock.calls[2][0]).toEqual({
            type: 'mcremote.wirescope.end',
            protocol_version: 1,
            reason: 'target-ended'
        });
        expect(port1.close).toHaveBeenCalled();
    });

    test('ends an active observer with source-closed when the Scratch page is hidden', () => {
        const windowListeners = {};
        const observerWindow = {postMessage: jest.fn()};
        const port1 = {
            addEventListener: jest.fn((type, listener) => {
                port1.listener = listener;
            }),
            start: jest.fn(),
            postMessage: jest.fn(),
            close: jest.fn()
        };
        const sourceWindow = {
            addEventListener: jest.fn((type, listener) => {
                windowListeners[type] = listener;
            }),
            removeEventListener: jest.fn(),
            open: jest.fn(() => observerWindow)
        };
        const environment = {
            window: sourceWindow,
            MessageChannel: jest.fn(() => ({port1, port2: {}})),
            crypto: {getRandomValues: function (array) {
                array.fill(7);
                return array;
            }},
            now: jest.fn(() => 5000),
            setTimeout: jest.fn(() => 9),
            clearTimeout: jest.fn()
        };
        const source = createWireScopeSource(environment);
        source.update(connectedObservation());
        source.launch('https://live.example/wirescope');
        windowListeners.message({
            source: observerWindow,
            origin: 'https://live.example',
            data: {type: 'mcremote.wirescope.ready', protocol_version: 1}
        });
        const grantMessage = port1.postMessage.mock.calls[0][0];
        port1.listener({
            data: {
                type: 'mcremote.wirescope.redeem',
                protocol_version: 1,
                grant: grantMessage.grant
            }
        });

        windowListeners.pagehide();

        expect(port1.postMessage.mock.calls[2][0]).toEqual({
            type: 'mcremote.wirescope.end',
            protocol_version: 1,
            reason: 'source-closed'
        });
        expect(port1.close).toHaveBeenCalled();
    });
});
