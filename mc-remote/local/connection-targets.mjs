export const defaultConnectionTargets = () => ({
    schema_version: 1,
    default_target_id: 'minecraft',
    targets: [
        {id: 'minecraft', label: 'Minecraft', host: '127.0.0.1', port: 25575},
        {id: 'unity', label: 'Unity箱庭', host: '127.0.0.1', port: 25585}
    ]
});

export const validateConnectionTargets = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== 1 ||
        Object.keys(value).some(key => !['schema_version', 'default_target_id', 'targets'].includes(key)) ||
        !Array.isArray(value.targets) || !value.targets.length) {
        throw new Error('接続先一覧と既定の接続先を指定してください。');
    }
    const ids = new Set();
    const targets = value.targets.map(target => {
        if (!target || typeof target !== 'object' || Array.isArray(target) ||
            Object.keys(target).some(key => !['id', 'label', 'host', 'port'].includes(key)) ||
            typeof target.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(target.id) ||
            typeof target.label !== 'string' || !target.label.trim() ||
            typeof target.host !== 'string' || target.host.length > 253 ||
            !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|[a-f0-9]*:[a-f0-9:]+)$/i.test(target.host) ||
            !Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
            throw new Error('接続先のID・名前・ホスト名またはIP・ポート（1〜65535）を確認してください。');
        }
        if (ids.has(target.id)) throw new Error(`接続先のIDが重複しています: ${target.id}`);
        ids.add(target.id);
        return {...target, label: target.label.trim()};
    });
    if (!ids.has(value.default_target_id)) throw new Error('既定の接続先を一覧から選んでください。');
    return {schema_version: 1, default_target_id: value.default_target_id, targets};
};
