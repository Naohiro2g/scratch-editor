export const setupPage = async window => {
    const {document} = window;
    const form = document.getElementById('target');
    const saveButton = document.getElementById('save-target');
    const openButton = document.getElementById('open-scratch');
    const error = document.getElementById('error');
    const version = document.getElementById('version');
    const status = document.getElementById('scratch-status');
    const host = document.getElementById('host');
    const port = document.getElementById('port');
    const localOption = form.querySelector('input[value="this"]');
    const lanOption = form.querySelector('input[value="lan"]');
    const channel = new window.BroadcastChannel('mc-remote-scratch-local-editor');
    const editors = new Set();
    let busy = true;
    let saving = false;
    let awaitingEditor = new window.URL(window.location.href).searchParams.get('scratch') === 'opening';
    let savedTarget;
    let editor;
    const currentTarget = () => ({host: host.value.trim(), port: Number(port.value)});
    const updateControls = () => {
        const current = currentTarget();
        const unsaved = !savedTarget || savedTarget.host !== current.host || savedTarget.port !== current.port;
        const locked = busy || awaitingEditor || editors.size > 0;
        saveButton.disabled = locked;
        openButton.disabled = busy || awaitingEditor || (!editors.size && unsaved);
        openButton.textContent = editors.size ? 'Scratchに戻る' : '改造版のScratchを開く';
        host.readOnly = locked || localOption.checked;
        port.readOnly = locked;
        localOption.disabled = lanOption.disabled = locked;
        status.classList.toggle('editor-open', editors.size > 0);
        status.classList.toggle('opening-editor', awaitingEditor && editors.size === 0);
        status.textContent = editors.size ?
            'いずれかのタブでScratchが既に開いています。接続先を変えるときは、Scratchのタブを閉じてください。' :
            awaitingEditor ? 'Scratchを開いています。開いたタブを確認してください。' :
                busy ? (saving ? '接続先を保存しています。' : '設定を読み込んでいます。') :
                    unsaved ? '接続先を保存してから、改造版のScratchを開いてください。' :
                        '設定を保存しました。改造版のScratchを開けます。';
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
    localOption.addEventListener('change', () => {
        if (localOption.checked) host.value = '127.0.0.1';
        updateControls();
    });
    lanOption.addEventListener('change', () => {
        if (lanOption.checked && host.value === '127.0.0.1') host.value = '';
        updateControls();
    });
    host.addEventListener('input', updateControls);
    port.addEventListener('input', updateControls);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || awaitingEditor || editors.size) return;
        busy = true;
        saving = true;
        error.textContent = '';
        updateControls();
        try {
            const next = currentTarget();
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
        host.value = target.host;
        port.value = target.port;
        localOption.checked = target.host === '127.0.0.1';
        lanOption.checked = !localOption.checked;
        if (target.saved) savedTarget = {host: target.host, port: target.port};
    } catch (problem) {
        error.textContent = `設定を読み取れません: ${problem.message}`;
    } finally {
        busy = false;
        updateControls();
    }
};

if (typeof window !== 'undefined') void setupPage(window);
