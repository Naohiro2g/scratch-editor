import 'web-audio-test-api';

import React from 'react';
import {waitFor} from '@testing-library/react';
import configureStore from 'redux-mock-store';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {LoadingState} from '../../../src/reducers/project-state';
import VM from '@scratch/scratch-vm';

import SBFileUploaderHOC from '../../../src/lib/sb-file-uploader-hoc.jsx';
import {IntlProvider} from 'react-intl';

describe('SBFileUploaderHOC', () => {
    const mockStore = configureStore();
    let store;
    let vm;

    // Wrap this in a function so it gets test specific states and can be reused.
    const getContainer = function () {
        const Component = () => <div />;
        return SBFileUploaderHOC(Component);
    };

    const unwrappedInstance = () => {
        const WrappedComponent = getContainer();
        // default starting state: looking at a project you created, not logged in
        const wrapper = renderWithIntl(
            <WrappedComponent
                projectChanged
                canSave={false}
                cancelFileUpload={jest.fn()}
                closeFileMenu={jest.fn()}
                requestProjectUpload={jest.fn()}
                userOwnsProject={false}
                vm={vm}
                onLoadingFinished={jest.fn()}
                onLoadingStarted={jest.fn()}
                onUpdateProjectTitle={jest.fn()}
                store={store}
            />
        );
        return wrapper;
    };

    beforeEach(() => {
        vm = new VM();
        store = mockStore({
            scratchGui: {
                projectState: {
                    loadingState: LoadingState.SHOWING_WITHOUT_ID
                },
                vm: {}
            },
            locales: {
                locale: 'en'
            }
        });
    });

    const dropFiles = files => {
        const event = new Event('drop', {bubbles: true, cancelable: true});
        Object.defineProperty(event, 'dataTransfer', {value: {types: ['Files'], files}});
        document.dispatchEvent(event);
        return event;
    };

    test('dropping one .sb3 uses the existing project upload flow', async () => {
        const requestProjectUpload = jest.fn();
        const onSetProjectTitle = jest.fn();
        const loadProject = jest.fn().mockResolvedValue();
        const WrappedComponent = getContainer();
        const props = {
            projectChanged: false,
            canSave: false,
            requestProjectUpload,
            userOwnsProject: false,
            vm: {loadProject},
            onSetProjectTitle,
            onLoadingFinished: jest.fn(),
            onLoadingStarted: jest.fn(),
            store
        };
        const {rerender} = renderWithIntl(<WrappedComponent {...props} />);
        const file = new File(['project'], '授業.sb3');

        expect(dropFiles([file]).defaultPrevented).toBe(true);
        expect(requestProjectUpload).toHaveBeenCalledWith(LoadingState.SHOWING_WITHOUT_ID);

        rerender(<IntlProvider
            locale="en"
            messages={{}}
        >
            <WrappedComponent
                {...props}
                isLoadingUpload
            />
        </IntlProvider>);
        await waitFor(() => expect(loadProject).toHaveBeenCalledWith(expect.any(ArrayBuffer)));
        await waitFor(() => expect(onSetProjectTitle).toHaveBeenCalledWith('授業'));
    });

    test('a rejected replacement and unrelated drops leave the project alone', () => {
        const requestProjectUpload = jest.fn();
        const WrappedComponent = getContainer();
        renderWithIntl(<WrappedComponent
            projectChanged
            canSave={false}
            requestProjectUpload={requestProjectUpload}
            userOwnsProject={false}
            vm={vm}
            store={store}
        />);
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        try {
            dropFiles([new File(['project'], 'lesson.sb3')]);
            expect(confirm).toHaveBeenCalledTimes(1);
            expect(requestProjectUpload).not.toHaveBeenCalled();
            dropFiles([new File(['image'], 'picture.png')]);
            dropFiles([new File(['first'], 'first.sb3'), new File(['second'], 'second.sb3')]);
            expect(requestProjectUpload).not.toHaveBeenCalled();
        } finally {
            confirm.mockRestore();
        }
    });

    test('a browser-saved project opens without a replacement confirmation', async () => {
        const requestProjectUpload = jest.fn();
        let completeSave;
        const onSaveCurrentProject = jest.fn().mockReturnValue(new Promise(resolve => {
            completeSave = resolve;
        }));
        const WrappedComponent = getContainer();
        renderWithIntl(<WrappedComponent
            projectChanged
            canSave={false}
            onSaveCurrentProject={onSaveCurrentProject}
            requestProjectUpload={requestProjectUpload}
            userOwnsProject
            vm={vm}
            store={store}
        />);
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        try {
            dropFiles([new File(['new project'], 'lesson.sb3')]);
            expect(onSaveCurrentProject).toHaveBeenCalledTimes(1);
            expect(requestProjectUpload).not.toHaveBeenCalled();
            completeSave(true);
            await waitFor(() => expect(requestProjectUpload).toHaveBeenCalledTimes(1));
            expect(confirm).not.toHaveBeenCalled();
        } finally {
            confirm.mockRestore();
        }
    });

    test('a failed browser save keeps the current project open', async () => {
        const requestProjectUpload = jest.fn();
        const onSaveCurrentProject = jest.fn().mockResolvedValue(false);
        const WrappedComponent = getContainer();
        renderWithIntl(<WrappedComponent
            projectChanged
            canSave={false}
            onSaveCurrentProject={onSaveCurrentProject}
            requestProjectUpload={requestProjectUpload}
            userOwnsProject={false}
            vm={vm}
            store={store}
        />);
        const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
        try {
            dropFiles([new File(['new project'], 'lesson.sb3')]);
            await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
            expect(requestProjectUpload).not.toHaveBeenCalled();
        } finally {
            alert.mockRestore();
        }
    });

    test('if isLoadingUpload becomes true, without fileToUpload set, will call cancelFileUpload', () => {
        const mockedCancelFileUpload = jest.fn();
        const WrappedComponent = getContainer();
        const {rerender} = renderWithIntl(
            <WrappedComponent
                projectChanged
                canSave={false}
                cancelFileUpload={mockedCancelFileUpload}
                closeFileMenu={jest.fn()}
                isLoadingUpload={false}
                requestProjectUpload={jest.fn()}
                store={store}
                userOwnsProject={false}
                vm={vm}
                onLoadingFinished={jest.fn()}
                onLoadingStarted={jest.fn()}
                onUpdateProjectTitle={jest.fn()}
            />
        );
        rerender(
            <IntlProvider
                locale="en"
                messages={{ }}
            >
                <WrappedComponent
                    projectChanged
                    canSave={false}
                    cancelFileUpload={mockedCancelFileUpload}
                    closeFileMenu={jest.fn()}
                    isLoadingUpload
                    requestProjectUpload={jest.fn()}
                    store={store}
                    userOwnsProject={false}
                    vm={vm}
                    onLoadingFinished={jest.fn()}
                    onLoadingStarted={jest.fn()}
                    onUpdateProjectTitle={jest.fn()}
                />
            </IntlProvider>
        );
        expect(mockedCancelFileUpload).toHaveBeenCalled();
    });
});
