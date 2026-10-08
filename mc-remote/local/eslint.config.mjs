import {eslintConfigScratch} from 'eslint-config-scratch';
import globals from 'globals';

export default eslintConfigScratch.defineConfig(
    eslintConfigScratch.legacy.base,
    eslintConfigScratch.legacy.node,
    {languageOptions: {globals: globals.node}, rules: {'no-console': 'off'}}
);
