import React from 'react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import MenuBar from '../../../src/components/menu-bar/menu-bar';
import {menuInitialState} from '../../../src/reducers/menus';
import {LoadingState} from '../../../src/reducers/project-state';
import {DEFAULT_MODE} from '../../../src/lib/settings/color-mode';
import {fireEvent} from '@testing-library/react';

import {PLATFORM} from '../../../src/lib/platform';

import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';
import VM from '@scratch/scratch-vm';
import {MenuRefProvider} from '../../../src/contexts/menu-ref-context.jsx';

describe('MenuBar Component', () => {
    const makeStore = function ({
        sandboxRoute = 'sb.mc-remote.com',
        vm = new VM()
    } = {}) {
        return configureStore()({
            locales: {
                isRtl: false,
                locale: 'en-US'
            },
            scratchGui: {
                menus: menuInitialState,
                projectState: {
                    loadingState: LoadingState.NOT_LOADED
                },
                settings: {
                    colorMode: DEFAULT_MODE
                },
                mcremoteConnectionTarget: {
                    sandboxRoute: sandboxRoute
                },
                timeTravel: {
                    year: 'NOW'
                },
                vm: vm,
                platform: {
                    platform: PLATFORM.WEB
                }
            }
        });
    };

    const getComponentWithStore = function (props = {}, storeOptions = {}) {
        const store = makeStore(storeOptions);
        return {
            store,
            component: (<Provider store={store}>
                <MenuRefProvider>
                    <MenuBar {...props} />
                </MenuRefProvider>
            </Provider>)
        };
    };

    const getComponent = function (props = {}, storeOptions = {}) {
        return getComponentWithStore(props, storeOptions).component;
    };

    test('menu bar with no About handler has no About button', () => {
        const {container} = renderWithIntl(getComponent());
        const button = container.querySelector('button[aria-label="About menu"]');
        expect(button).toBeFalsy();
    });

    test('menu bar with an About handler has an About button', () => {
        const onClickAbout = jest.fn();
        const {container} = renderWithIntl(getComponent({onClickAbout}));
        const button = container.querySelector('button[aria-label="About menu"]');
        expect(button).toBeTruthy();
    });

    describe('triggering About button handler', () => {
        test('clicking on About button calls the handler', () => {
            const onClickAbout = jest.fn();
            const {container} = renderWithIntl(getComponent({onClickAbout}));
            const button = container.querySelector('button[aria-label="About menu"]');
    
            fireEvent.click(button);
            expect(onClickAbout).toHaveBeenCalledTimes(1);
        });
    
        test('not clicking on About button does not call the handler', () => {
            const onClickAbout = jest.fn();
            renderWithIntl(getComponent({onClickAbout}));
    
            expect(onClickAbout).toHaveBeenCalledTimes(0);
        });
    });

    test('McRemote connection menu pushes the deployment default to VM for a removed target', () => {
        const vm = new VM();
        vm.setMcRemoteConnectionTarget = jest.fn();
        renderWithIntl(getComponent({}, {
            sandboxRoute: 'sb-dev.mc-remote.com',
            vm
        }));

        expect(vm.setMcRemoteConnectionTarget).toHaveBeenCalledWith({
            sandboxRoute: 'sb.mc-remote.com',
            label: 'Stable'
        });
    });

    test('McRemote connection menu saves selected route', () => {
        localStorage.removeItem('mcremote.connectionTarget.v1');
        const {component, store} = getComponentWithStore();
        const {container, getByText} = renderWithIntl(component);
        const button = container.querySelector('button[aria-label="McRemote connection menu"]');

        fireEvent.click(button);
        fireEvent.click(getByText('sb.mc-remote.com'));

        expect(localStorage.getItem('mcremote.connectionTarget.v1')).toBe('sb.mc-remote.com');
        expect(store.getActions()).toContainEqual({
            type: 'scratch-gui/mcremote-connection-target/SET',
            sandboxRoute: 'sb.mc-remote.com'
        });
    });
});
