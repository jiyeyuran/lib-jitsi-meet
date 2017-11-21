/* global chrome, $, AdapterJS */

import JitsiTrackError from '../../JitsiTrackError';
import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import RTCBrowserType from './RTCBrowserType';

const logger = require('jitsi-meet-logger').getLogger(__filename);

/**
 * Indicates whether the Chrome desktop sharing extension is installed.
 * @type {boolean}
 */
let chromeExtInstalled = false;

/**
 * Handles obtaining a stream from a screen capture on different browsers.
 */
const ScreenObtainer = {
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
        this.extId = options.desktopSharingChromeExtId;
        this.gum = gum;

        this._handleExternalInstall = this._handleExternalInstall.bind(this);
        this._installExtFromChromeStore
            = this._installExtFromChromeStore.bind(this);
        this._doGetStreamFromExtension
            = this._doGetStreamFromExtension.bind(this);
        this._onGetStreamResponse = this._onGetStreamResponse.bind(this);
        this.obtainStream
            = this.options.disableDesktopSharing
                ? null : this._createObtainStreamMethod();

        if (!this.obtainStream) {
            logger.info('Desktop sharing disabled');

            return;
        }
        this.obtainStream = this.obtainStream.bind(this);
    },

    /**
     * Returns a method which will be used to obtain the screen sharing stream
     * (based on the browser type).
     *
     * @returns {Function}
     * @private
     */
    _createObtainStreamMethod() {
        if (RTCBrowserType.isChrome() || RTCBrowserType.isOpera()) {
            initChromeExtension(this.extId);

            return this.obtainScreenFromExtension;
        }
        if (RTCBrowserType.isElectron()) {
            return this.obtainScreenOnElectron;
        }
        if (RTCBrowserType.isFirefox()) {
            if (RTCBrowserType.getFirefoxVersion() >= 52) {
                return this.obtainWebRTCScreen;
            }
        }
        if (RTCBrowserType.isTemasysPluginUsed()) {
            if (AdapterJS
                    && AdapterJS.WebRTCPlugin.plugin.isScreensharingAvailable) {
                return this.obtainWebRTCScreen;
            }
        }
        logger.log(
            'Screen sharing not supported by the current browser: ',
            RTCBrowserType.getBrowserType(),
            RTCBrowserType.getBrowserName());

        return null;
    },

    /**
     * Checks whether obtaining a screen capture is supported in the current
     * environment.
     * @returns {boolean}
     */
    isSupported() {
        return Boolean(this.obtainStream);
    },

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
            window.JitsiMeetScreenObtainer.openDesktopPicker(
                {
                    desktopSharingSources:
                        options.desktopSharingSources
                            || this.options.desktopSharingChromeSources
                },
                (streamId, streamType) =>
                    this._onGetStreamResponse(
                        {
                            streamId,
                            streamType
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
    },

    /**
     * Asks Chrome extension to call chooseDesktopMedia and gets chrome
     * 'desktop' stream for returned stream token.
     */
    obtainScreenFromExtension(extOptions, streamCallback, failCallback) {
        if (chromeExtInstalled) {
            this._doGetStreamFromExtension(streamCallback, failCallback);
        } else {
            if (RTCBrowserType.isOpera()) {
                extOptions.extUrl = null;
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
                        streamCallback, failCallback);
                }

                return;
            }
            if (extOptions.extUrl) {
                this._handleExternalInstall(
                    extOptions, streamCallback, failCallback);

                return;
            }

            this._installExtFromChromeStore(
                streamCallback, failCallback);
        }
    },

    _installExtFromChromeStore(streamCallback, failCallback) {
        try {
            chrome.webstore.install(getWebStoreInstallUrl(this.extId),
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
                                    streamCallback, failCallback);
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
    },

    /**
     * Obtains a desktop stream using getUserMedia.
     *
     * On firefox, the document's domain must be white-listed in the
     * 'media.getusermedia.screensharing.allowed_domains' preference in
     * 'about:config'.
     */
    obtainWebRTCScreen(options, streamCallback, failCallback) {
        this.gum(
            [ 'screen' ],
            stream => streamCallback({ stream }),
            failCallback
        );
    },

    _handleExternalInstall(options, streamCallback, failCallback) {
        const now = new Date();
        const maxWaitDur = 1 * 60 * 1000;

        if (options.extUrl) {
            window.open(options.extUrl);
        } else {
            options.listener(false, getWebStoreInstallUrl(this.extId));
        }
        const t = setInterval(() => {
            checkChromeExtInstalled(this.extId, ok => {
                if (ok) {
                    chromeExtInstalled = true;
                    this._doGetStreamFromExtension(
                        streamCallback, failCallback);
                    !options.extUrl && options.listener(true);
                    clearInterval(t);
                } else if (options.checkAgain() === false
                    || (new Date() - now) > maxWaitDur) {
                    failCallback(
                        JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR);
                    clearInterval(t);
                }
            });
        }, options.interval);
    },

    /**
     *
     * @param options
     * @param streamCallback
     * @param failCallback
     */
    _doGetStreamFromExtension(streamCallback, failCallback) {
        chrome.runtime.sendMessage(
            this.extId,
            {
                getStream: true,
                sources: this.options.desktopSharingChromeSources
            },
            response => {
                if (!response) {
                    logger.error('chrome last error: ',
                        chrome.runtime.lastError);

                    failCallback(
                        JitsiTrackErrors.CHROME_EXTENSION_INSTALLATION_ERROR,
                        chrome.runtime.lastError);

                    return;
                }
                if (!response.streamId) {
                    failCallback(new JitsiTrackError(
                        JitsiTrackErrors.CHROME_EXTENSION_USER_CANCELED));

                    return;
                }
                logger.log('Response from extension: ', response);
                this._onGetStreamResponse(
                    response, streamCallback, failCallback);
            }
        );
    },

    /**
     * Handles response from external application / extension and calls GUM to
     * receive the desktop streams or reports error.
     * @param {object} response
     * @param {string} response.streamId - the streamId for the desktop stream
     * @param {string} response.error - error to be reported.
     * @param {Function} onSuccess - callback for success.
     * @param {Function} onFailure - callback for failure.
     */
    _onGetStreamResponse({ streamId, streamType }, onSuccess, onFailure) {
        this.gum(
            [ 'desktop' ],
            stream => onSuccess({
                stream,
                sourceId: streamId,
                sourceType: streamType
            }),
            onFailure,
            {
                ...this.options,
                desktopStream: streamId
            });
    }
};

/**
 *
 * @param extId
 *
 */
function initChromeExtension(extId) {
    initInlineInstalls(extId);
    checkChromeExtInstalled(extId, ok => {
        chromeExtInstalled = ok;
    });
}

/**
 *
 * @param extId
 */
function checkChromeExtInstalled(extId, callback) {
    if (!chrome || !chrome.runtime) {
        callback(false);
    } else {
        chrome.runtime.sendMessage(extId, { getVersion: true },
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
function initInlineInstalls(extId) {
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

export default ScreenObtainer;
