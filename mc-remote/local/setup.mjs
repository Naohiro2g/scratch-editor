import {validateConnectionTargets} from './connection-targets.mjs';

export const setupPage = async window => {
    const {document} = window;
    const form = document.getElementById('target');
    const saveButton = document.getElementById('save-target');
    const openButton = document.getElementById('open-scratch');
    const error = document.getElementById('error');
    const version = document.getElementById('version');
    const status = document.getElementById('scratch-status');
    const targetList = document.getElementById('target-list');
    const addButton = document.getElementById('add-target');
    const channel = new window.BroadcastChannel('mc-remote-scratch-local-editor');
    const editors = new Set();
    let busy = true;
    let saving = false;
    let awaitingEditor = new window.URL(window.location.href).searchParams.get('scratch') === 'opening';
    let savedTarget;
    let editor;
    const currentTarget = () => ({
        schema_version: 1,
        default_target_id: targetList.querySelector('input[name="default-target"]:checked')?.value || '',
        targets: Array.from(targetList.children, row => ({
            id: row.dataset.id,
            label: row.querySelector('[data-field="label"]').value.trim(),
            host: row.querySelector('[data-field="host"]').value.trim(),
            port: Number(row.querySelector('[data-field="port"]').value)
        }))
    });
    const updateControls = () => {
        const current = currentTarget();
        const unsaved = !savedTarget || JSON.stringify(savedTarget) !== JSON.stringify(current);
        const locked = busy || awaitingEditor || editors.size > 0;
        saveButton.disabled = locked;
        openButton.disabled = busy || awaitingEditor || (!editors.size && unsaved);
        openButton.textContent = editors.size ? 'Scratchに戻る' : '改造版のScratchを開く';
        addButton.disabled = locked;
        for (const input of targetList.querySelectorAll('input')) {
            if (input.type === 'radio') input.disabled = locked;
            else input.readOnly = locked;
        }
        for (const button of targetList.querySelectorAll('button')) {
            button.disabled = locked || targetList.children.length === 1;
        }
        status.classList.toggle('editor-open', editors.size > 0);
        status.classList.toggle('opening-editor', awaitingEditor && editors.size === 0);
        status.textContent = editors.size ?
            'いずれかのタブでScratchが既に開いています。接続先を変えるときは、Scratchのタブを閉じてください。' :
            awaitingEditor ? 'Scratchを開いています。開いたタブを確認してください。' :
                busy ? (saving ? '接続先を保存しています。' : '設定を読み込んでいます。') :
                    unsaved ? '接続先を保存してから、改造版のScratchを開いてください。' :
                        '設定を保存しました。改造版のScratchを開けます。';
    };
    const renderTargets = value => {
        targetList.textContent = '';
        value.targets.forEach((target, index) => {
            const row = document.createElement('fieldset');
            row.dataset.id = target.id;
            const legend = document.createElement('legend');
            legend.textContent = `接続先 ${index + 1}`;
            row.appendChild(legend);
            for (const [field, caption] of [['label', '表示名'], ['host', 'ホスト名またはIP'], ['port', 'ポート']]) {
                const label = document.createElement('label');
                label.textContent = caption;
                const input = document.createElement('input');
                input.dataset.field = field;
                input.value = target[field];
                input.required = true;
                if (field === 'port') {
                    input.type = 'number';
                    input.min = '1';
                    input.max = '65535';
                    input.step = '1';
                }
                input.addEventListener('input', updateControls);
                label.appendChild(input);
                row.appendChild(label);
            }
            const defaultLabel = document.createElement('label');
            defaultLabel.className = 'choice';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'default-target';
            radio.value = target.id;
            radio.checked = target.id === value.default_target_id;
            radio.addEventListener('change', updateControls);
            defaultLabel.appendChild(radio);
            defaultLabel.appendChild(document.createTextNode('既定の接続先'));
            row.appendChild(defaultLabel);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-target';
            remove.textContent = 'この接続先を削除';
            remove.addEventListener('click', () => {
                if (remove.disabled) return;
                const next = currentTarget();
                next.targets = next.targets.filter(candidate => candidate.id !== target.id);
                if (next.default_target_id === target.id) next.default_target_id = next.targets[0].id;
                renderTargets(next);
                updateControls();
            });
            row.appendChild(remove);
            targetList.appendChild(row);
        });
    };
    channel.onmessage = ({data}) => {
        if (data.type === 'opened') {
            editors.add(data.id);
            awaitingEditor = false;
        } else if (data.type === 'closed') {
            editors.delete(data.id);
        }
        updateControls();
    };
    channel.postMessage({type: 'check'});
    updateControls();
    addButton.addEventListener('click', () => {
        if (addButton.disabled) return;
        const next = currentTarget();
        next.targets.push({id: `target-${window.crypto.randomUUID()}`, label: '', host: '127.0.0.1', port: 25575});
        renderTargets(next);
        updateControls();
        targetList.lastElementChild.querySelector('[data-field="label"]').focus();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || awaitingEditor || editors.size) return;
        busy = true;
        saving = true;
        error.textContent = '';
        updateControls();
        try {
            const next = validateConnectionTargets(currentTarget());
            const response = await window.fetch('/target', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(next)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            savedTarget = next;
        } catch (problem) {
            error.textContent = problem.message;
        } finally {
            busy = false;
            saving = false;
            updateControls();
        }
    });
    openButton.addEventListener('click', () => {
        if (busy || awaitingEditor || openButton.disabled) return;
        if (editors.size) {
            if (editor && !editor.closed) editor.focus();
            else channel.postMessage({type: 'focus'});
            return;
        }
        error.textContent = '';
        editor = window.open('/editor/?extension=mcremote', 'mc-remote-scratch');
        if (!editor) {
            error.textContent = 'ポップアップがブロックされました。このページで許可して、もう一度押してください。';
            return;
        }
        awaitingEditor = true;
        updateControls();
    });
    try {
        const [target, identity] = await Promise.all([
            window.fetch('/target').then(response => response.json()),
            window.fetch('/identity.json').then(response => response.json())
        ]);
        version.textContent = `mc-remote Scratch ${identity.version}`;
        const {saved, ...settings} = target;
        renderTargets(settings);
        if (saved) savedTarget = settings;
    } catch (problem) {
        error.textContent = `設定を読み取れません: ${problem.message}`;
    } finally {
        busy = false;
        updateControls();
    }
};

if (typeof window !== 'undefined') void setupPage(window);
