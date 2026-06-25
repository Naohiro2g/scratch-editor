import {isRtl} from 'scratch-l10n';
import editorMessages from 'scratch-l10n/locales/editor-msgs';
import mcremoteMessages from '../lib/mcremote-l10n';

const UPDATE_LOCALES = 'scratch-gui/locales/UPDATE_LOCALES';
const SELECT_LOCALE = 'scratch-gui/locales/SELECT_LOCALE';

// Merge this fork's translations into the scratch-l10n catalog, which does not
// carry them. The merged catalog feeds both react-intl and the VM's
// format-message via state.locales.messages.
const messagesByLocale = Object.keys(mcremoteMessages).reduce((acc, locale) => {
    acc[locale] = Object.assign({}, editorMessages[locale], mcremoteMessages[locale]);
    return acc;
}, Object.assign({}, editorMessages));

const initialState = {
    isRtl: false,
    locale: 'en',
    messagesByLocale: messagesByLocale,
    messages: messagesByLocale.en
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SELECT_LOCALE:
        return Object.assign({}, state, {
            isRtl: isRtl(action.locale),
            locale: action.locale,
            messagesByLocale: state.messagesByLocale,
            messages: state.messagesByLocale[action.locale]
        });
    case UPDATE_LOCALES:
        return Object.assign({}, state, {
            isRtl: state.isRtl,
            locale: state.locale,
            messagesByLocale: action.messagesByLocale,
            messages: action.messagesByLocale[state.locale]
        });
    default:
        return state;
    }
};

const selectLocale = function (locale) {
    return {
        type: SELECT_LOCALE,
        locale: locale
    };
};

const setLocales = function (localesMessages) {
    return {
        type: UPDATE_LOCALES,
        messagesByLocale: localesMessages
    };
};
const initLocale = function (currentState, locale) {
    if (Object.prototype.hasOwnProperty.call(currentState.messagesByLocale, locale)) {
        return Object.assign(
            {},
            currentState,
            {
                isRtl: isRtl(locale),
                locale: locale,
                messagesByLocale: currentState.messagesByLocale,
                messages: currentState.messagesByLocale[locale]
            }
        );
    }
    // don't change locale if it's not in the current messages
    return currentState;
};
export {
    reducer as default,
    initialState as localesInitialState,
    initLocale,
    selectLocale,
    setLocales
};
