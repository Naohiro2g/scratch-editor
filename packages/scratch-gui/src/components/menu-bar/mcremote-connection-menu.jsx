import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, defineMessage, useIntl} from 'react-intl';
import {connect} from 'react-redux';

import {MenuItem, Submenu} from '../menu/menu.jsx';
import useMenuNavigation from '../../hooks/use-menu-navigation';

import {
    MCREMOTE_CONNECTION_TARGETS,
    getMcRemoteConnectionTargetByRoute
} from '../../lib/mcremote-connection-targets.js';
import {persistMcRemoteConnectionTargetRoute} from '../../lib/mcremote-connection-target-persistence.js';
import {setMcRemoteConnectionTarget} from '../../reducers/mcremote-connection-target.js';

import settingsMenuStyles from './settings-menu.css';
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
    sandboxRoute
}) => {
    const intl = useIntl();
    const selectedTarget = getMcRemoteConnectionTargetByRoute(sandboxRoute);
    const selectedLabel = selectedTarget ? selectedTarget.label : '';

    const {
        menuRef,
        isExpanded,
        handleKeyDown,
        handleKeyDownOpenMenu,
        handleOnOpen
    } = useMenuNavigation({
        depth,
        isRtl
    });

    const handleSelect = function (target) {
        onChangeConnectionTarget(target.sandboxRoute);
        persistMcRemoteConnectionTargetRoute(target.sandboxRoute);
    };

    if (!selectedTarget) return null;

    return (
        <MenuItem
            isExpanded={isExpanded()}
            isDataMenuItemWrapper
            ref={menuRef}
            onKeyDown={handleKeyDown}
        >
            <button
                className={settingsMenuStyles.option}
                aria-label={intl.formatMessage(connectionMenuAriaMessage)}
                onClick={handleOnOpen}
                data-menu-item
            >
                <img
                    src={connectionIcon}
                    style={{width: 24}}
                />
                <span className={settingsMenuStyles.submenuLabel}>
                    <FormattedMessage {...menuLabelMessage} />
                </span>
                <span className={styles.mcremoteConnectionTarget}>
                    {selectedLabel}
                </span>
                <img
                    className={settingsMenuStyles.expandCaret}
                    src={dropdownCaret}
                />
            </button>
            <Submenu place={isRtl ? 'left' : 'right'}>
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
                                        {target.label}
                                    </span>
                                    <code>{target.sandboxRoute}</code>
                                </div>
                            </div>
                        </MenuItem>
                    );
                })}
            </Submenu>
        </MenuItem>
    );
};

McRemoteConnectionMenu.propTypes = {
    depth: PropTypes.number,
    isRtl: PropTypes.bool,
    onChangeConnectionTarget: PropTypes.func.isRequired,
    sandboxRoute: PropTypes.string
};

const mapStateToProps = function (state) {
    return {
        isRtl: state.locales.isRtl,
        sandboxRoute: state.scratchGui.mcremoteConnectionTarget.sandboxRoute
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
