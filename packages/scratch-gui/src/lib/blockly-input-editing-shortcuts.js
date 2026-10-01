const allowNativeBlocklyInputEditingShortcut = event => {
    if (!(event.target instanceof HTMLInputElement) ||
        !event.target.classList.contains('blocklyHtmlInput') ||
        !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
        !['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) return;

    // Scratch Blocks treats modified letters as invalid numeric text and
    // cancels native input editing shortcuts.
    event.stopImmediatePropagation();
};

export default allowNativeBlocklyInputEditingShortcut;
