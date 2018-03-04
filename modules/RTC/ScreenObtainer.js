/* global $, AdapterJS */

import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import browser from '../browser';

const logger = require('jitsi-meet-logger').getLogger(__filename);

/**
 * Indicates whether the Chrome desktop sharing extension is installed.
 * @type {boolean}
 */
let chromeExtInstalled = false;

/**
 * Handles obtaining a stream from a screen capture on different browsers.
 */
class ScreenObtainer {
    /**
     * Initializes the function used to obtain a screen capture
     * (this.obtainStream).
     *
     * @param {object} options
     * @param {boolean} [options.disableDesktopSharing]
     * @param {boolean} [options.desktopSharingChromeDisabled]
     * @param {boolean} [options.desktopSharingChromeExtId]
     * @param {boolean} [options.desktopSharingFirefoxDisabled]
     * @param {boolean} [options.desktopSharingFirefoxExtId] (deprecated)
     * @param {Function} gum GUM method
     */
    init(options = {
        disableDesktopSharing: false,
        desktopSharingChromeDisabled: false,
        desktopSharingChromeExtId: null,
        desktopSharingFirefoxDisabled: false,
        desktopSharingFirefoxExtId: null
    }, gum) {
        // eslint-disable-next-line no-param-reassign
        this.options = options = options || {};
        this.gumFunction = gum;
        this.extId = options.desktopSharingChromeExtId;

        this.obtainStream
            = this.options.disableDesktopSharing
                ? null : this._createObtainStreamMethod();

        if (!this.obtainStream) {
            logger.info('Desktop sharing disabled');

            return;
        }
    }

    /**
     * Returns a method which will be used to obtain the screen sharing stream
     * (based on the browser type).
     *
     * @returns {Function}
     * @private
     */
    _createObtainStreamMethod() {
        if (browser.isNWJS()) {
            return (_, onSuccess, onFailure) => {
                window.JitsiMeetNW.obtainDesktopStream(
                    onSuccess,
                    (error, constraints) => {
                        let jitsiError;

                        // FIXME:
                        // This is very very dirty fix for recognising that the
                        // user have clicked the cancel button from the Desktop
                        // sharing pick window. The proper solution would be to
                        // detect this in the NWJS application by checking the
                        // streamId === "". Even better solution would be to
                        // stop calling GUM from the NWJS app and just pass the
                        // streamId to lib-jitsi-meet. This way the desktop
                        // sharing implementation for NWJS and chrome extension
                        // will be the same and lib-jitsi-meet will be able to
                        // control the constraints, check the streamId, etc.
                        //
                        // I cannot find documentation about "InvalidStateError"
                        // but this is what we are receiving from GUM when the
                        // streamId for the desktop sharing is "".

                        if (error && error.name === 'InvalidStateError') {
                            jitsiError = new JitsiTrackError(
                                JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED
                            );
                        } else {
                            jitsiError = new JitsiTrackError(
                                error, constraints, [ 'desktop' ]);
                        }
                        (typeof onFailure === 'function')
                            && onFailure(jitsiError);
                    });
            };
        }
        if (browser.isElectron()) {
            return this.obtainScreenOnElectron;
        }
        if (browser.isChrome() || browser.isOpera()) {
            if (browser.isVersionLessThan('34')) {
                logger.info('Chrome extension not supported until ver 34');

                return null;
            } else if (this.options.desktopSharingChromeDisabled
                || !this.extId) {

                return null;
            }

            logger.info('Using Chrome extension for desktop sharing');
            initChromeExtension(this.extId);

            return this.obtainScreenFromExtension;
        }
        if (browser.isFirefox()) {
            if (this.options.desktopSharingFirefoxDisabled) {
                return null;
            } else if (browser.isVersionLessThan('52')) {
                logger.info('Firefox screensharing not supported until ver 52');

                return null;
            } else if (window.location.protocol === 'http:') {
                logger.log('Screen sharing is not supported over HTTP. '
                    + 'Use of HTTPS is required.');

                return null;
            }

            return this._onGetStreamResponse.bind(
                this, { streamType: 'window' });
        }
        if (browser.isTemasysPluginUsed()) {
            if (AdapterJS
                    && AdapterJS.WebRTCPlugin.plugin.isScreensharingAvailable) {
                const sourceId = AdapterJS.WebRTCPlugin.plugin.screensharingKey;

                return this._onGetStreamResponse.bind(
                    this,
                    {
                        streamId: sourceId,
                        streamType: 'screen'
                    }
                );
            }
        }
        logger.log(
            'Screen sharing not supported by the current browser: ',
            browser.getName());

        return null;
    }

    /**
     * Checks whether obtaining a screen capture is supported in the current
     * environment.
     * @returns {boolean}
     */
    isSupported() {
        return Boolean(this.obtainStream);
    }

    /**
     * Obtains a screen capture stream on Electron.
     *
     * @param {Object} [options] - Screen sharing options.
     * @param {Array<string>} [options.desktopSharingSources] - Array with the
     * sources that have to be displayed in the desktop picker window ('screen',
     * 'window', etc.).
     * @param onSuccess - Success callback.
     * @param onFailure - Failure callback.
     */
    obtainScreenOnElectron(options = {}, onSuccess, onFailure) {
        if (window.JitsiMeetScreenObtainer
            && window.JitsiMeetScreenObtainer.openDesktopPicker) {
            const { desktopSharingSources, gumOptions } = options;

            window.JitsiMeetScreenObtainer.openDesktopPicker(
                {
                    desktopSharingSources: desktopSharingSources
                        || this.options.desktopSharingChromeSources
                },
                (streamId, streamType) =>
                    this._onGetStreamResponse(
                        {
                            response: {
                                streamId,
                                streamType
                            },
                            gumOptions
                        },
                        onSuccess,
                        onFailure
                    ),
                err => onFailure(new JitsiTrackError(
                    JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_ERROR,
                    err
                ))
            );
        } else {
            onFailure(new JitsiTrackError(
                JitsiTrackErrors.ELECTRON_DESKTOP_PICKER_NOT_FOUND));
        }
    }

    /**
     * Asks Chrome extension to call chooseDesktopMedia and gets chrome
     * 'desktop' stream for returned stream token.
     */
    obtainScreenFromExtension(extOptions, streamCallback, failCallback) {
        if (chromeExtInstalled) {
            this._doGetStreamFromExtension(
                extOptions, streamCallback, failCallback);
        } else {
            if (browser.isOpera()) {
                extOptions.extUrl = null;
                extOptions.listener(false, getWebStoreInstallUrl(this.extId));
                this._handleExternalInstall(
                    extOptions, streamCallback, failCallback);

                return;
            }
            if (this.extId !== extOptions.extId) {
                this.extId = extOptions.extId;
                if (extOptions.extUrl) {
                    this._handleExternalInstall(
                        extOptions, streamCallback, failCallback);
                } else {
                    chromeExtInstalled = true;
                    this._doGetStreamFromExtension(
                        extOptions, streamCallback, failCallback);
                }

                return;
            }
            if (extOptions.extUrl) {
                this._handleExternalInstall(
                    extOptions, streamCallback, failCallback);

                return;
            }

            this._installExtFromChromeStore(
                extOptions, streamCallback, failCallback);
        }
    }

    /**
     * Install extension from chrome store.
     */
    _installExtFromChromeStore(extOptions, streamCallback, failCallback) {
        try {
            window.chrome.webstore.install(
                getWebStoreInstallUrl(this.extId),
                arg => {
                    logger.log('Extension installed successfully', arg);
                    let maxRetries = 0;

                    chromeExtInstalled = true;
                    const t = setInterval(() => {
                        checkChromeExtInstalled(this.extId, ok => {
                            if (ok) {
                                clearInterval(t);
                                chromeExtInstalled = true;
                                this._doGetStreamFromExtension(
                                    extOptions, streamCallback, failCallback);
                            } else if (maxRetries++ > 60) {
                                clearInterval(t);
                            }
                        });
                    }, 500);
                }, () => {
                    failCallback(new JitsiTrackError(
                        JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED));
                }
            );
        } catch (e) {
            logger.log(e);
            failCallback(new JitsiTrackError(
                JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR, e));
        }
    }

    /**
     * Install extension from external url.
     */
    _handleExternalInstall(extOptions, streamCallback, failCallback) {
        const now = new Date();
        const maxWaitDur = 1 * 60 * 1000;

        window.open(extOptions.extUrl);
        const t = setInterval(() => {
            checkChromeExtInstalled(this.extId, ok => {
                if (ok) {
                    chromeExtInstalled = true;
                    this._doGetStreamFromExtension(
                        extOptions, streamCallback, failCallback);
                    extOptions.listener(true);
                    clearInterval(t);
                } else if (extOptions.checkAgain() === false
                    || (new Date() - now) > maxWaitDur) {
                    failCallback(
                        JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR);
                    clearInterval(t);
                }
            });
        }, extOptions.interval);
    }

    /**
     *
     * @param options
     * @param streamCallback
     * @param failCallback
     */
    _doGetStreamFromExtension(options, streamCallback, failCallback) {
        const {
            desktopSharingChromeSources
        } = this.options;

        window.chrome.runtime.sendMessage(
            this.extId,
            {
                getStream: true,
                sources:
                    options.desktopSharingSources || desktopSharingChromeSources
            },
            response => {
                if (!response) {
                    // possibly re-wraping error message to make code consistent
                    const lastError = window.chrome.runtime.lastError;

                    failCallback(lastError instanceof Error
                        ? lastError
                        : new JitsiTrackError(
                            JitsiTrackErrors.CHROME_EXTENSION_GENERIC_ERROR,
                            lastError));

                    return;
                }
                logger.log('Response from extension: ', response);
                this._onGetStreamResponse(
                    {
                        response,
                        gumOptions: options.gumOptions
                    },
                    streamCallback,
                    failCallback
                );
            }
        );
    }

    /**
     * Handles response from external application / extension and calls GUM to
     * receive the desktop streams or reports error.
     * @param {object} options
     * @param {object} options.response
     * @param {string} options.response.streamId - the streamId for the desktop
     * stream.
     * @param {string} options.response.error - error to be reported.
     * @param {object} options.gumOptions - options passed to GUM.
     * @param {Function} onSuccess - callback for success.
     * @param {Function} onFailure - callback for failure.
     * @param {object} gumOptions - options passed to GUM.
     */
    _onGetStreamResponse(
            options = {
                response: {},
                gumOptions: {}
            },
            onSuccess,
            onFailure) {
        const { streamId, streamType, error } = options.response || {};

        if (streamId) {
            this.gumFunction(
                [ 'desktop' ],
                stream => onSuccess({
                    stream,
                    sourceId: streamId,
                    sourceType: streamType
                }),
                onFailure,
                {
                    desktopStream: streamId,
                    ...options.gumOptions
                });
        } else {
            // As noted in Chrome Desktop Capture API:
            // If user didn't select any source (i.e. canceled the prompt)
            // then the callback is called with an empty streamId.
            if (streamId === '') {
                onFailure(new JitsiTrackError(
                    JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED));

                return;
            }

            onFailure(new JitsiTrackError(
                JitsiTrackErrors.CHROME_EXTENSION_GENERIC_ERROR,
                error));
        }
    }
}

/**
 *
 * @param extId
 *
 */
function initChromeExtension(extId) {
    initInlineInstall(extId);
    checkChromeExtInstalled(extId, ok => {
        chromeExtInstalled = ok;
    });
}

/**
 *
 * @param extId
 */
function checkChromeExtInstalled(extId, callback) {
    if (!window.chrome || !window.chrome.runtime) {
        callback(false);
    } else {
        window.chrome.runtime.sendMessage(extId, { getVersion: true },
            response => {
                if (response) {
                    callback(true);
                } else {
                    callback(false);
                }
            });
    }
}

/**
 * Initializes <link rel=chrome-webstore-item /> with extension id set in
 * config.js to support inline installs. Host site must be selected as main
 * website of published extension.
 * @param extId supports "desktopSharingChromeExtId"
 */
function initInlineInstall(extId) {
    if ($('link[rel=chrome-webstore-item]').length === 0) {
        $('head').append('<link rel="chrome-webstore-item">');
    }
    $('link[rel=chrome-webstore-item]').attr('href',
        getWebStoreInstallUrl(extId));
}

/**
 * Constructs inline install URL for Chrome desktop streaming extension.
 * The 'chromeExtensionId' must be defined in options parameter.
 * @param options supports "desktopSharingChromeExtId"
 * @returns {string}
 */
function getWebStoreInstallUrl(extId) {
    return `https://chrome.google.com/webstore/detail/${extId}`;
}

export default new ScreenObtainer();
