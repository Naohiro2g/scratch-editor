import React from 'react';
import '@testing-library/jest-dom';
import {fireEvent, screen} from '@testing-library/react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import McRemoteConnectionMenu from '../../../src/components/menu-bar/mcremote-connection-menu';
import {persistMcRemoteConnectionTargetRoute} from '../../../src/lib/mcremote-connection-target-persistence';

jest.mock('../../../src/lib/mcremote-connection-targets', () => {
    const targets = [
        {id: 'minecraft', sandboxRoute: 'minecraft', label: 'Minecraft', host: '127.0.0.1', port: 25575},
        {id: 'unity-id', sandboxRoute: 'unity-id', label: 'Unity箱庭', host: '127.0.0.1', port: 25585},
        {id: 'ipv6-id', sandboxRoute: 'ipv6-id', label: 'IPv6', host: '::1', port: 25595}
    ];
    return {MCREMOTE_CONNECTION_TARGETS: targets,
        getMcRemoteConnectionTargetByRoute: route => targets.find(target => target.sandboxRoute === route)};
});
jest.mock('../../../src/lib/mcremote-connection-target-persistence', () => ({
    detectMcRemoteConnectionTargetRoute: () => 'unity-id',
    persistMcRemoteConnectionTargetRoute: jest.fn()
}));
jest.mock('../../../src/hooks/use-menu-navigation', () => () => ({
    menuRef: null,
    isExpanded: () => true,
    handleKeyDown: jest.fn(),
    handleKeyDownOpenMenu: jest.fn(),
    handleOnOpen: jest.fn()
}));

test('shows endpoint ports rather than opaque IDs but selects and persists the stable ID', () => {
    const store = configureStore()({locales: {isRtl: false},
        scratchGui: {mcremoteConnectionTarget: {sandboxRoute: 'unity-id'}}});
    renderWithIntl(<Provider store={store}><McRemoteConnectionMenu depth={1} /></Provider>);
    expect(screen.getByText('127.0.0.1:25575')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1:25585')).toBeInTheDocument();
    expect(screen.getByText('[::1]:25595')).toBeInTheDocument();
    expect(screen.queryByText('unity-id')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Minecraft'));
    expect(store.getActions()).toContainEqual({type: 'scratch-gui/mcremote-connection-target/SET', sandboxRoute: 'minecraft'});
    expect(persistMcRemoteConnectionTargetRoute).toHaveBeenCalledWith('minecraft');
});
