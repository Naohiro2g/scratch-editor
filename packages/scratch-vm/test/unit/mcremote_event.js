const test = require('tap').test;
const fixture = require('../../../../mc-remote/protocol/test/fixtures/events-v23.json');
const {
    eventStatusValue,
    eventValue,
    initialEventStatus,
    validateEventPollResult
} = require('../../src/extensions/scratch3_mcremote/event');

test('event poll results validate the exact b6 fixture and advance through_sequence', t => {
    const parsed = validateEventPollResult(fixture.poll_result, 0, initialEventStatus());
    t.equal(parsed.cursor, 3);
    t.equal(parsed.status.latestSequence, 3);
    t.same(parsed.events.map(event => event.type), [
        'pickaxe_poke',
        'chat_posted',
        'projectile_hit'
    ]);
    t.ok(Object.isFrozen(parsed.events[0]), 'validated DTOs are immutable');
    t.end();
});

test('event poll validation rejects unknown fields, future cursors and non-monotonic counters', t => {
    const status = initialEventStatus();
    t.throws(() => validateEventPollResult(Object.assign({}, fixture.poll_result, {unknown: true}), 0, status));
    t.throws(() => validateEventPollResult(Object.assign({}, fixture.poll_result, {
        through_sequence: 4,
        latest_sequence: 3
    }), 0, status));
    const laterStatus = Object.assign({}, status, {overflowDroppedTotal: 2});
    t.throws(() => validateEventPollResult(fixture.poll_result, 0, laterStatus));
    t.end();
});

test('event values are read from one immutable thread DTO without network parsing', t => {
    const parsed = validateEventPollResult(fixture.poll_result, 0, initialEventStatus());
    const click = parsed.events[0];
    const projectile = parsed.events[2];
    t.equal(eventValue(click, 'sequence'), 1);
    t.equal(eventValue(click, 'dimension'), 'minecraft:overworld');
    t.equal(eventValue(click, 'x'), 1);
    t.equal(eventValue(click, 'origin_x'), 200);
    t.equal(eventValue(click, 'block'), 'minecraft:stone');
    t.equal(eventValue(click, 'item'), 'minecraft:diamond_pickaxe');
    t.equal(eventValue(projectile, 'target_kind'), 'block');
    t.equal(eventValue(projectile, 'target_z'), 6);
    t.equal(eventValue(projectile, 'target_block'), 'minecraft:oak_log[axis=z]');
    t.equal(eventValue(parsed.events[1], 'message'), 'hello');
    t.equal(eventValue(null, 'dimension'), '');
    t.end();
});

const projectileHitWithEntityTarget = handle => ({
    events: [
        {
            sequence: 1,
            type: 'projectile_hit',
            dimension: 'minecraft:overworld',
            origin: [200, 0, 200],
            projectile: 'minecraft:arrow',
            pos: [1, 2, 3],
            target: {kind: 'entity', handle}
        }
    ],
    through_sequence: 1,
    latest_sequence: 1,
    filtered_out: 0,
    overflow_dropped_total: 0,
    capacity_dropped_total: 0,
    explicitly_discarded_total: 0
});

test('protocol 23 accepts an mcr_eh_ entity target handle', t => {
    const parsed = validateEventPollResult(
        projectileHitWithEntityTarget('mcr_eh_abc123'), 0, initialEventStatus()
    );
    t.equal(parsed.events[0].target.handle, 'mcr_eh_abc123');
    t.end();
});

test('protocol 23 rejects a protocol-22 mceh_ entity target handle', t => {
    t.throws(() => validateEventPollResult(
        projectileHitWithEntityTarget('mceh_abc123'), 0, initialEventStatus()
    ));
    t.end();
});

test('protocol 23 rejects an invalid-prefix, empty, or non-string entity target handle', t => {
    t.throws(() => validateEventPollResult(
        projectileHitWithEntityTarget('not_an_entity_handle'), 0, initialEventStatus()
    ));
    t.throws(() => validateEventPollResult(projectileHitWithEntityTarget(''), 0, initialEventStatus()));
    t.throws(() => validateEventPollResult(projectileHitWithEntityTarget(42), 0, initialEventStatus()));
    t.end();
});

test('the current events fixture carries no protocol-22 mceh_ handles', t => {
    t.notMatch(JSON.stringify(fixture), /mceh_/);
    t.end();
});

test('event status exposes cursor and distinct cumulative loss counters', t => {
    const status = {
        cursor: 9,
        latestSequence: 10,
        overflowDroppedTotal: 2,
        capacityDroppedTotal: 3,
        explicitlyDiscardedTotal: 0
    };
    t.equal(eventStatusValue(status, 'cursor'), 9);
    t.equal(eventStatusValue(status, 'latest'), 10);
    t.equal(eventStatusValue(status, 'overflow'), 2);
    t.equal(eventStatusValue(status, 'capacity'), 3);
    t.equal(eventStatusValue(status, 'total_loss'), 5);
    t.end();
});
