import PropTypes from 'prop-types';
import {useEffect} from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import {getMcRemoteConnectionTargetByRoute} from '../../lib/mcremote-connection-targets.js';

/**
 * Pushes the configured McRemote connection target into the VM whenever it changes.
 * Mounted unconditionally (unlike the picker UI, which lives inside the on-demand
 * Settings menu) so the VM stays in sync even if the user never opens Settings.
 * @param {object} root0 - component props.
 * @param {string} root0.sandboxRoute - the configured connection target's sandbox route.
 * @param {VM} root0.vm - the Scratch VM instance to push the target into.
 * @returns {null} this component has no UI of its own.
 */
const McRemoteConnectionTargetSync = ({sandboxRoute, vm}) => {
    const selectedTarget = getMcRemoteConnectionTargetByRoute(sandboxRoute);
    const selectedLabel = selectedTarget.label;

    useEffect(() => {
        if (vm && typeof vm.setMcRemoteConnectionTarget === 'function') {
            vm.setMcRemoteConnectionTarget({
                sandboxRoute: selectedTarget.sandboxRoute,
                label: selectedLabel
            });
        }
    }, [vm, selectedTarget.sandboxRoute, selectedLabel]);

    return null;
};

McRemoteConnectionTargetSync.propTypes = {
    sandboxRoute: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = function (state) {
    return {
        sandboxRoute: state.scratchGui.mcremoteConnectionTarget.sandboxRoute,
        vm: state.scratchGui.vm
    };
};

export default connect(mapStateToProps)(McRemoteConnectionTargetSync);
