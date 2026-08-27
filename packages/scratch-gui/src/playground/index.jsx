// Polyfills
import 'es6-object-assign/auto';
import 'core-js/fn/array/includes';
import 'core-js/fn/promise/finally';
import 'intl'; // For Safari 9

import {loadMcRemoteRuntimeConfig} from '../lib/mcremote-runtime-config.js';
import {requestBrowserStoragePersistence} from '../lib/browser-storage-persistence.js';

import styles from './index.css';

loadMcRemoteRuntimeConfig().then(() => {
    requestBrowserStoragePersistence();


    const React = require('react');
    const ReactDomClient = require('react-dom/client');
    const AppStateHOC = require('../lib/app-state-hoc.jsx').default;
    const BrowserModalComponent = require('../components/browser-modal/browser-modal.jsx').default;
    const supportedBrowser = require('../lib/supported-browser').default;

    const appTarget = document.createElement('div');
    appTarget.className = styles.app;
    document.body.appendChild(appTarget);

    if (supportedBrowser()) {
        // require needed here to avoid importing unsupported browser-crashing code
        // at the top level
        require('./render-gui.jsx').default(appTarget);
    } else {
        BrowserModalComponent.setAppElement(appTarget);
        const WrappedBrowserModalComponent = AppStateHOC(BrowserModalComponent, true /* localesOnly */);
        const handleBack = () => {};
        const root = ReactDomClient.createRoot(appTarget);
        // eslint-disable-next-line react/jsx-no-bind
        root.render(<WrappedBrowserModalComponent onBack={handleBack} />);
    }
});
