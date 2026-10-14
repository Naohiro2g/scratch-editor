export const trackEditor = window => {
    const channel = new window.BroadcastChannel('mc-remote-scratch-local-editor');
    const id = window.crypto.randomUUID();
    const announce = () => channel.postMessage({type: 'opened', id});
    channel.onmessage = ({data}) => {
        if (data.type === 'check') announce();
        else if (data.type === 'focus') window.focus();
    };
    window.addEventListener('pageshow', announce);
    window.addEventListener('pagehide', () => channel.postMessage({type: 'closed', id}));
    announce();
};

if (typeof window !== 'undefined') trackEditor(window);
