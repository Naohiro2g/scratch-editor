/**
 * @file
 * Utility function to detect locale from the browser setting or paramenter on the URL.
 */

import queryString from 'query-string';

const canonicalLocale = function (candidate, supportedLocales) {
    const normalizedCandidate = candidate.toLowerCase();
    for (const locale of supportedLocales) {
        if (locale.toLowerCase() === normalizedCandidate) return locale;
    }
    return null;
};

/**
 * look for language setting in the browser. Check against supported locales.
 * If there's a parameter in the URL, override the browser setting
 * @param {Array.string} supportedLocales An array of supported locale codes.
 * @returns {string} the preferred locale
 */
const detectLocale = function (supportedLocales) {
    let locale = 'en'; // default
    let browserLocale = window.navigator.userLanguage || window.navigator.language;
    // try to set locale from browserLocale
    const exactBrowserLocale = canonicalLocale(browserLocale, supportedLocales);
    if (exactBrowserLocale) {
        locale = exactBrowserLocale;
    } else {
        browserLocale = browserLocale.split('-')[0];
        locale = canonicalLocale(browserLocale, supportedLocales) || locale;
    }

    const queryParams = queryString.parse(location.search);
    // Flatten potential arrays and remove falsy values
    const potentialLocales = [].concat(queryParams.locale, queryParams.lang).filter(Boolean);
    if (!potentialLocales.length) {
        return locale;
    }

    return canonicalLocale(potentialLocales[0], supportedLocales) || locale;
};

export {
    detectLocale
};
