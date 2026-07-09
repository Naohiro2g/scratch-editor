import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useEffect} from 'react';
import {FormattedMessage, defineMessage, useIntl} from 'react-intl';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import {MenuItem, MenuSection} from '../menu/menu.jsx';
import MenuBarMenu from './menu-bar-menu.jsx';
import useMenuNavigation from '../../hooks/use-menu-navigation';

import {
    MCREMOTE_CONNECTION_TARGETS,
    getMcRemoteConnectionTargetByRoute
} from '../../lib/mcremote-connection-targets.js';
import {persistMcRemoteConnectionTargetRoute} from '../../lib/mcremote-connection-target-persistence.js';
import {setMcRemoteConnectionTarget} from '../../reducers/mcremote-connection-target.js';

import styles from './menu-bar.css';

import dropdownCaret from './dropdown-caret.svg';
import connectionIcon from './icon--mcremote-connection.svg';
import check from './check.svg';

const connectionMenuAriaMessage = defineMessage({
    id: 'gui.aria.mcremoteConnectionMenu',
    defaultMessage: 'McRemote connection menu',
    description: 'Accessibility label for the McRemote connection target menu'
});

const menuLabelMessage = defineMessage({
    id: 'gui.menuBar.mcremoteConnection',
    defaultMessage: 'Connection',
    description: 'Text for the McRemote connection target dropdown menu'
});

const McRemoteConnectionMenu = ({
    depth,
    isRtl,
    onChangeConnectionTarget,
    sandboxRoute,
    vm
}) => {
    const intl = useIntl();
    const selectedTarget = getMcRemoteConnectionTargetByRoute(sandboxRoute);
    const selectedLabel = intl.formatMessage(selectedTarget.label);

    const {
        menuRef,
        isExpanded,
        handleKeyDown,
        handleKeyDownOpenMenu,
        handleOnOpen,
        handleOnClose
    } = useMenuNavigation({
        depth,
        isRtl
    });

    useEffect(() => {
        if (vm && typeof vm.setMcRemoteConnectionTarget === 'function') {
            vm.setMcRemoteConnectionTarget({
                sandboxRoute: selectedTarget.sandboxRoute,
                label: selectedLabel
            });
        }
    }, [vm, selectedTarget.sandboxRoute, selectedLabel]);

    const handleSelect = function (target) {
        onChangeConnectionTarget(target.sandboxRoute);
        persistMcRemoteConnectionTargetRoute(target.sandboxRoute);
        handleOnClose();
    };

    return (
        <button
            className={classNames(styles.menuBarItem, styles.hoverable, {
                [styles.active]: isExpanded()
            })}
            aria-expanded={isExpanded()}
            aria-label={intl.formatMessage(connectionMenuAriaMessage)}
            onClick={handleOnOpen}
            onKeyDown={handleKeyDown}
            ref={menuRef}
        >
            <img src={connectionIcon} />
            <span className={styles.collapsibleLabel}>
                <FormattedMessage {...menuLabelMessage} />
            </span>
            <span className={styles.mcremoteConnectionTarget}>
                {selectedLabel}
            </span>
            <img src={dropdownCaret} />
            <MenuBarMenu
                className={classNames(styles.menuBarMenu)}
                open={isExpanded()}
                place={isRtl ? 'left' : 'right'}
                onRequestClose={handleOnClose}
            >
                <MenuSection>
                    {/* eslint-disable-next-line arrow-parens */}
                    {MCREMOTE_CONNECTION_TARGETS.map(target => {
                        const isSelected = target.sandboxRoute === selectedTarget.sandboxRoute;
                        return (
                            <MenuItem
                                isDataMenuItem
                                isSelected={isSelected}
                                key={target.id}
                                onParentKeyDown={handleKeyDownOpenMenu}
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={() => handleSelect(target)}
                            >
                                <div className={styles.mcremoteConnectionOption}>
                                    <img
                                        className={classNames(styles.mcremoteConnectionCheck, {
                                            [styles.selected]: isSelected
                                        })}
                                        src={check}
                                    />
                                    <div className={styles.mcremoteConnectionText}>
                                        <span>
                                            <FormattedMessage {...target.label} />
                                        </span>
                                        <code>{target.sandboxRoute}</code>
                                    </div>
                                </div>
                            </MenuItem>
                        );
                    })}
                </MenuSection>
            </MenuBarMenu>
        </button>
    );
};

McRemoteConnectionMenu.propTypes = {
    depth: PropTypes.number,
    isRtl: PropTypes.bool,
    onChangeConnectionTarget: PropTypes.func.isRequired,
    sandboxRoute: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = function (state) {
    return {
        isRtl: state.locales.isRtl,
        sandboxRoute: state.scratchGui.mcremoteConnectionTarget.sandboxRoute,
        vm: state.scratchGui.vm
    };
};

const mapDispatchToProps = function (dispatch) {
    return {
        onChangeConnectionTarget: function (sandboxRoute) {
            dispatch(setMcRemoteConnectionTarget(sandboxRoute));
        }
    };
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(McRemoteConnectionMenu);
