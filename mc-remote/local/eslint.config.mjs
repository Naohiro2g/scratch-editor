import {eslintConfigScratch} from 'eslint-config-scratch';
import globals from 'globals';

export default eslintConfigScratch.defineConfig(
    eslintConfigScratch.legacy.base,
    eslintConfigScratch.legacy.node,
    {languageOptions: {globals: globals.node}, rules: {'no-console': 'off'}},
    {files: ['mc-remote/local/setup.mjs', 'mc-remote/local/editor-tab.mjs'],
        languageOptions: {globals: globals.browser}}
);
