import { AVAILABLE_DEVICE } from '../../service/statistics/AnalyticsEvents';
import CameraFacingMode from '../../service/RTC/CameraFacingMode';
import EventEmitter from 'events';
import { getLogger } from 'jitsi-meet-logger';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import JitsiTrackError from '../../JitsiTrackError';
import Listenable from '../util/Listenable';
import * as MediaType from '../../service/RTC/MediaType';
import Resolutions from '../../service/RTC/Resolutions';
import browser from '../browser';
import RTCEvents from '../../service/RTC/RTCEvents';
import ortcRTCPeerConnection from './ortc/RTCPeerConnection';
import ScreenObtainer from './ScreenObtainer';
import SDPUtil from '../xmpp/SDPUtil';
import Statistics from '../statistics/statistics';
import VideoType from '../../service/RTC/VideoType';

const logger = getLogger(__filename);

const eventEmitter = new EventEmitter();

const AVAILABLE_DEVICES_POLL_INTERVAL_TIME = 3000; // ms

// TODO (brian): Move this devices hash, maybe to a model, so RTCUtils remains
// stateless.
const devices = {
    audio: false,
    video: false
};

// Currently audio output device change is supported only in Chrome and
// default output always has 'default' device ID
let audioOutputDeviceId = 'default'; // default device
// whether user has explicitly set a device to use
let audioOutputChanged = false;

// Disables all audio processing
let disableAP = false;

// Disables Acoustic Echo Cancellation
let disableAEC = false;

// Disables Noise Suppression
let disableNS = false;

// Disables Automatic Gain Control
let disableAGC = false;

// Disables Highpass Filter
let disableHPF = false;

const featureDetectionAudioEl = document.createElement('audio');
const isAudioOutputDeviceChangeAvailable
    = typeof featureDetectionAudioEl.setSinkId !== 'undefined';

let currentlyAvailableMediaDevices = [];

const isDeviceChangeEventSupported
    = navigator.mediaDevices
        && typeof navigator.mediaDevices.ondevicechange === 'object';

const isNewStyleConstraintsSupported
    = browser.isFirefox()
        || browser.usesNewGumFlow()
        || browser.isEdge()
        || browser.isReactNative()
        || browser.isTemasysPluginUsed();

/**
 *
 * @param constraints
 * @param resolution
 */
function setResolutionConstraints(constraints, resolution) {
    if (Resolutions[resolution]) {
        if (isNewStyleConstraintsSupported) {
            constraints.video.width = {
                ideal: Resolutions[resolution].width
            };
            constraints.video.height = {
                ideal: Resolutions[resolution].height
            };
        }

        constraints.video.mandatory.minWidth = Resolutions[resolution].width;
        constraints.video.mandatory.minHeight = Resolutions[resolution].height;
    }

    if (constraints.video.mandatory.minWidth) {
        constraints.video.mandatory.maxWidth
            = constraints.video.mandatory.minWidth;
    }

    if (constraints.video.mandatory.minHeight) {
        constraints.video.mandatory.maxHeight
            = constraints.video.mandatory.minHeight;
    }
}

/**
 * Creates a constraints object to be passed into a call to getUserMedia.
 *
 * @param {Array} um - An array of user media types to get. The accepted
 * types are "video" and "audio".
 * @param {Object} options - Various values to be added to the constraints.
 * @param {string} options.cameraDeviceId - The device id for the video
 * capture device to get video from.
 * @param {Object} options.constraints - Default constraints object to use
 * as a base for the returned constraints.
 * @param {string} options.facingMode - Which direction the camera is
 * pointing to.
 * @param {string} options.micDeviceId - The device id for the audio capture
 * device to get audio from.
 * @private
 * @returns {Object}
 */
function getConstraints(um = [], options = {}) {
    if (browser.isSafari()) {
        const ratio = options.resolution > 320 ? 2 : 1;
        const video = um.indexOf('video') >= 0 ? {
            width: 320 * ratio,
            height: 240 * ratio,
            facingMode: options.facingMode || CameraFacingMode.USER
        } : false;

        return {
            audio: um.indexOf('audio') >= 0,
            video
        };
    }

    // Create a deep copy of the constraints to avoid any modification of
    // the passed in constraints object.
    const constraints = JSON.parse(JSON.stringify(options.constraints || {}));


    if (um.indexOf('video') >= 0) {
        if (!constraints.video || typeof constraints.video === 'boolean') {
            constraints.video = {};
        }
        if (!browser.usesNewGumFlow()) {
            if (!constraints.video.mandatory) {
                constraints.video.mandatory = {};
            }
            if (!constraints.video.optional) {
                constraints.video.optional = [];
            }
            if (options.minFps) {
                constraints.video.mandatory.minFrameRate = options.minFps;
            }
            if (options.maxFps) {
                constraints.video.mandatory.maxFrameRate = options.maxFps;
            }
            setResolutionConstraints(constraints, options.resolution);
        }
        if (options.cameraDeviceId) {
            if (isNewStyleConstraintsSupported) {
                constraints.video.deviceId = options.cameraDeviceId;
            } else {
                constraints.video.optional.push({
                    sourceId: options.cameraDeviceId
                });
            }
        } else {
            const facingMode = options.facingMode || CameraFacingMode.USER;

            if (isNewStyleConstraintsSupported) {
                constraints.video.facingMode = facingMode;
            } else {
                constraints.video.optional.push({ facingMode });
            }
        }
    } else {
        constraints.video = false;
    }

    if (um.indexOf('audio') >= 0) {
        if (!constraints.audio || typeof constraints.audio === 'boolean') {
            constraints.audio = {};
        }
        if (!constraints.audio.optional) {
            constraints.audio.optional = [];
        }
        if (options.micDeviceId) {
            if (isNewStyleConstraintsSupported) {
                // New style of setting device id.
                constraints.audio.deviceId = options.micDeviceId;
            } else {
                constraints.video.optional.push({
                    sourceId: options.micDeviceId
                });
            }
        }
        constraints.audio.optional.push(
            { echoCancellation: !disableAEC && !disableAP },
            { googEchoCancellation: !disableAEC && !disableAP },
            { googAutoGainControl: !disableAGC && !disableAP },
            { googNoiseSuppression: !disableNS && !disableAP },
            { googHighpassFilter: !disableHPF && !disableAP },
            { googNoiseSuppression2: !disableNS && !disableAP },
            { googEchoCancellation2: !disableAEC && !disableAP },
            { googAutoGainControl2: !disableAGC && !disableAP }
        );
    } else {
        constraints.audio = false;
    }

    return constraints;
}

/**
 * Checks if new list of available media devices differs from previous one.
 * @param {MediaDeviceInfo[]} newDevices - list of new devices.
 * @returns {boolean} - true if list is different, false otherwise.
 */
function compareAvailableMediaDevices(newDevices) {
    if (newDevices.length !== currentlyAvailableMediaDevices.length) {
        return true;
    }

    /* eslint-disable newline-per-chained-call */

    return (
        newDevices.map(mediaDeviceInfoToJSON).sort().join('')
            !== currentlyAvailableMediaDevices
                .map(mediaDeviceInfoToJSON).sort().join(''));

    /* eslint-enable newline-per-chained-call */

    /**
     *
     * @param info
     */
    function mediaDeviceInfoToJSON(info) {
        return JSON.stringify({
            kind: info.kind,
            deviceId: info.deviceId,
            groupId: info.groupId,
            label: info.label,
            facing: info.facing
        });
    }
}

/**
 * Periodically polls enumerateDevices() method to check if list of media
 * devices has changed. This is temporary workaround until 'devicechange' event
 * will be supported by browsers.
 */
function pollForAvailableMediaDevices() {
    navigator.mediaDevices.enumerateDevices().then(ds => {
        if (compareAvailableMediaDevices(ds)) {
            onMediaDevicesListChanged(ds);
        }

        window.setTimeout(pollForAvailableMediaDevices,
            AVAILABLE_DEVICES_POLL_INTERVAL_TIME);
    });
}

/**
 * Sends analytics event with the passed device list.
 *
 * @param {Array<MediaDeviceInfo>} deviceList - List with info about the
 * available devices.
 * @returns {void}
 */
function sendDeviceListToAnalytics(deviceList) {
    const audioInputDeviceCount
        = deviceList.filter(d => d.kind === 'audioinput').length;
    const audioOutputDeviceCount
        = deviceList.filter(d => d.kind === 'audiooutput').length;
    const videoInputDeviceCount
        = deviceList.filter(d => d.kind === 'videoinput').length;
    const videoOutputDeviceCount
        = deviceList.filter(d => d.kind === 'videooutput').length;

    deviceList.forEach(device => {
        const attributes = {
            'audio_input_device_count': audioInputDeviceCount,
            'audio_output_device_count': audioOutputDeviceCount,
            'video_input_device_count': videoInputDeviceCount,
            'video_output_device_count': videoOutputDeviceCount,
            'device_id': device.deviceId,
            'device_group_id': device.groupId,
            'device_kind': device.kind,
            'device_label': device.label
        };

        Statistics.sendAnalytics(AVAILABLE_DEVICE, attributes);
    });
}

/**
 * Event handler for the 'devicechange' event.
 *
 * @param {MediaDeviceInfo[]} devices - list of media devices.
 * @emits RTCEvents.DEVICE_LIST_CHANGED
 */
function onMediaDevicesListChanged(devicesReceived) {
    currentlyAvailableMediaDevices = devicesReceived.slice(0);
    logger.info('Available devices: ', currentlyAvailableMediaDevices);

    sendDeviceListToAnalytics(currentlyAvailableMediaDevices);

    const videoInputDevices
        = currentlyAvailableMediaDevices.filter(d => d.kind === 'videoinput');
    const audioInputDevices
        = currentlyAvailableMediaDevices.filter(d => d.kind === 'audioinput');
    const videoInputDevicesWithEmptyLabels
        = videoInputDevices.filter(d => d.label === '');
    const audioInputDevicesWithEmptyLabels
        = audioInputDevices.filter(d => d.label === '');

    if (videoInputDevices.length
            && videoInputDevices.length
                === videoInputDevicesWithEmptyLabels.length) {
        devices.video = false;
    }

    if (audioInputDevices.length
            && audioInputDevices.length
                === audioInputDevicesWithEmptyLabels.length) {
        devices.audio = false;
    }

    eventEmitter.emit(RTCEvents.DEVICE_LIST_CHANGED, devicesReceived);
}

/**
 * Handles the newly created Media Streams.
 * @param streams the new Media Streams
 * @param resolution the resolution of the video streams
 * @returns {*[]} object that describes the new streams
 */
function handleLocalStream(streams, resolution) {
    let audioStream, videoStream;
    const desktopStream = streams.desktop;
    const audioVideo = streams.audioVideo;
    const res = [];

    if (audioVideo) {
        const audioTracks = audioVideo.getAudioTracks();
        const videoTracks = audioVideo.getVideoTracks();

        if (audioTracks.length) {
            audioStream = new MediaStream();
            audioTracks.map(track => audioStream.addTrack(track));
        }
        if (videoTracks.length) {
            videoStream = new MediaStream();
            videoTracks.map(track => videoStream.addTrack(track));
        }
    } else {
        audioStream = streams.audio;
        videoStream = streams.video;
    }
    if (desktopStream) {
        const { stream, sourceId, sourceType } = desktopStream;

        res.push({
            stream,
            sourceId,
            sourceType,
            track: stream.getVideoTracks()[0],
            mediaType: MediaType.VIDEO,
            videoType: VideoType.DESKTOP
        });
    }
    if (audioStream) {
        res.push({
            stream: audioStream,
            track: audioStream.getAudioTracks()[0],
            mediaType: MediaType.AUDIO,
            videoType: null
        });
    }
    if (videoStream) {
        res.push({
            stream: videoStream,
            track: videoStream.getVideoTracks()[0],
            mediaType: MediaType.VIDEO,
            videoType: VideoType.CAMERA,
            resolution
        });
    }

    return res;
}

/**
 * Represents a default implementation of setting a <tt>MediaStream</tt> as the
 * source of a video element that tries to be browser-agnostic through feature
 * checking. Note though that it was not completely clear from the predating
 * browser-specific implementations what &quot;videoSrc&quot; was because one
 * implementation of {@link RTCUtils#getVideoSrc} would return
 * <tt>MediaStream</tt> (e.g. Firefox), another a <tt>string</tt> representation
 * of the <tt>URL</tt> of the <tt>MediaStream</tt> (e.g. Chrome) and the return
 * value was only used by {@link RTCUIHelper#getVideoId} which itself did not
 * appear to be used anywhere. Generally, the implementation will try to follow
 * the related standards i.e. work with the <tt>srcObject</tt> and <tt>src</tt>
 * properties of the specified <tt>element</tt> taking into account vender
 * prefixes.
 *
 * @param element the element whose video source/src is to be set to the
 * specified <tt>stream</tt>
 * @param {MediaStream} stream the <tt>MediaStream</tt> to set as the video
 * source/src of <tt>element</tt>
 */
function defaultSetVideoSrc(element, stream) {
    // srcObject
    let srcObjectPropertyName = 'srcObject';

    if (!(srcObjectPropertyName in element)) {
        srcObjectPropertyName = 'mozSrcObject';
        if (!(srcObjectPropertyName in element)) {
            srcObjectPropertyName = null;
        }
    }
    if (srcObjectPropertyName) {
        element[srcObjectPropertyName] = stream;

        return;
    }

    // src
    let src;

    if (stream) {
        src = stream.jitsiObjectURL;

        // Save the created URL for stream so we can reuse it and not keep
        // creating URLs.
        if (!src) {
            stream.jitsiObjectURL = src = URL.createObjectURL(stream);
        }
    }
    element.src = src || '';
}

/**
 *
 */
class RTCUtils extends Listenable {
    /**
     *
     */
    constructor() {
        super(eventEmitter);
    }

    /**
     * Depending on the browser, sets difference instance methods for
     * interacting with user media and adds methods to native webrtc related
     * objects. Also creates an instance variable for peer connection
     * constraints.
     *
     * @param {Object} options
     * @returns {void}
     */
    init(options = {}) {
        if (typeof options.disableAEC === 'boolean') {
            disableAEC = options.disableAEC;
            logger.info(`Disable AEC: ${disableAEC}`);
        }
        if (typeof options.disableNS === 'boolean') {
            disableNS = options.disableNS;
            logger.info(`Disable NS: ${disableNS}`);
        }
        if (typeof options.disableAP === 'boolean') {
            disableAP = options.disableAP;
            logger.info(`Disable AP: ${disableAP}`);
        }
        if (typeof options.disableAGC === 'boolean') {
            disableAGC = options.disableAGC;
            logger.info(`Disable AGC: ${disableAGC}`);
        }
        if (typeof options.disableHPF === 'boolean') {
            disableHPF = options.disableHPF;
            logger.info(`Disable HPF: ${disableHPF}`);
        }

        if (!RTCPeerConnection) {
            const error = new Error('Browser does not support WebRTC');

            error.name = 'WEBRTC_NOT_SUPPORTED';

            return Promise.reject(error);
        }
        this.screenObtainer = new ScreenObtainer(options);
        const mediaDevices = navigator.mediaDevices;

        this.getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
        this.attachMediaStream = wrapAttachMediaStream(
            (element, stream) => {
                defaultSetVideoSrc(element, stream);

                return element;
            });
        if (browser.isEdge()) {
            this.RTCPeerConnectionType = ortcRTCPeerConnection;
            this.getStreamID = stream => SDPUtil.filterSpecialChars(
                stream.jitsiRemoteId || stream.id);
            this.getTrackID = track => track.jitsiRemoteId || track.id;
        } else {
            this.RTCPeerConnectionType = RTCPeerConnection;
            this.getStreamID = stream => SDPUtil.filterSpecialChars(stream.id);
            this.getTrackID = track => track.id;
        }
        this._initPCConstraints(options);

        if (browser.isReactNative()) {
            return Promise.resolve();
        }

        this.enumerateDevices
            = mediaDevices.enumerateDevices.bind(mediaDevices);
        if (isDeviceChangeEventSupported) {
            mediaDevices.ondevicechange = () => {
                this.enumerateDevices().then(
                    onMediaDevicesListChanged,
                    () => onMediaDevicesListChanged([]));
            };
        } else if (!browser.isMobile()) {
            setTimeout(pollForAvailableMediaDevices,
                AVAILABLE_DEVICES_POLL_INTERVAL_TIME);
        }

        return this.enumerateDevices()
            .then(onMediaDevicesListChanged)
            .catch();
    }

    /**
     * Creates instance objects for peer connection constraints both for p2p
     * and outside of p2p.
     *
     * @params {Object} options - Configuration for setting RTCUtil's instance
     * objects for peer connection constraints.
     * @params {boolean} options.useIPv6 - Set to true if IPv6 should be used.
     * @params {boolean} options.disableSuspendVideo - Whether or not video
     * should become suspended if bandwidth estimation becomes low.
     * @params {Object} options.testing - Additional configuration for work in
     * development.
     * @params {Object} options.testing.forceP2PSuspendVideoRatio - True if
     * video should become suspended if bandwidth estimation becomes low while
     * in peer to peer connection mode.
     */
    _initPCConstraints(options) {
        this.pcConstraints = { optional: [
            { googHighStartBitrate: 0 },
            { googPayloadPadding: true },
            { googScreencastMinBitrate: options.screencastMinBitrate || 400 },
            { googCpuOveruseDetection: true },
            { googCpuOveruseEncodeUsage: true },
            { googCpuUnderuseThreshold: 55 },
            { googCpuOveruseThreshold: 85 },
            { googDscp: true }
        ] };
        if (options.useIPv6) {
            this.pcConstraints.optional.push({ googIPv6: true });
        }
        this.p2pPcConstraints
            = JSON.parse(JSON.stringify(this.pcConstraints));
        if (!options.disableSuspendVideo) {
            this.pcConstraints.optional.push(
                { googSuspendBelowMinBitrate: true });
        }

        // There's no reason not to use this for p2p
        this.p2pPcConstraints.optional.push({
            googSuspendBelowMinBitrate: true
        });

        this.p2pPcConstraints = this.p2pPcConstraints || this.pcConstraints;
    }

    /* eslint-enable max-params */

    /**
     * Creates the local MediaStreams.
     * @param {Object} [options] optional parameters
     * @param {Array} options.devices the devices that will be requested
     * @param {string} options.resolution resolution constraints
     * @returns {*} Promise object that will receive the new JitsiTracks
     */
    obtainAudioAndVideoPermissions(options = {}) {
        return new Promise((resolve, reject) => {
            const successCallback = stream => {
                if (!devices.audio) {
                    devices.audio = Boolean(stream.audio || stream.audioVideo);
                }
                if (!devices.video) {
                    devices.video = Boolean(
                        stream.video || stream.audioVideo || stream.desktop);
                }
                eventEmitter.emit(RTCEvents.AVAILABLE_DEVICES_CHANGED, devices);
                resolve(handleLocalStream(stream, options.resolution));
            };

            options.resolution = options.resolution || '360';
            options.devices = options.devices || [ 'audio', 'video' ];
            const hasDesktop = options.devices.includes('desktop');
            const hasAudio = options.devices.includes('audio');
            const hasVideo = options.devices.includes('video');
            const streams = {};
            let promise = Promise.resolve();
            let error;

            if (browser.isReactNative()
                    || browser.isTemasysPluginUsed()) {
                if (hasAudio) {
                    const constraints = getConstraints([ 'audio' ], options);

                    promise = promise.then(() => this.getUserMedia(constraints))
                    .then(stream => {
                        streams.audio = stream;
                    })
                    .catch(err => {
                        error = new JitsiTrackError(
                            err, constraints, [ 'audio' ]);
                    });
                }
                if (hasVideo) {
                    const constraints = getConstraints([ 'video' ], options);

                    promise = promise.then(() => this.getUserMedia(constraints))
                    .then(stream => {
                        streams.video = stream;
                    })
                    .catch(err => {
                        error = new JitsiTrackError(
                            err, constraints, [ 'video' ]);
                    });
                }
            } else {
                const constraints = getConstraints(
                    options.devices.filter(d => d !== 'desktop'), options);

                promise = promise.then(() => this.getUserMedia(constraints))
                .then(stream => {
                    streams.audioVideo = stream;
                })
                .catch(err => {
                    error = new JitsiTrackError(
                        err, constraints, options.devices);
                });
            }
            promise.then(() => {
                if (hasDesktop && this.screenObtainer.isSupported()) {
                    const dsOptions = {
                        ...options.desktopSharingExtensionExternalInstallation,
                        desktopSharingSources: options.desktopSharingSources
                    };

                    this.screenObtainer.obtainStream(dsOptions, desktop => {
                        streams.desktop = desktop;
                        successCallback(streams);
                    }, err => {
                        if (streams.audio
                            || streams.video
                            || streams.audioVideo) {
                            successCallback(streams);
                        } else {
                            reject(err);
                        }
                    });
                } else if (streams.audio
                    || streams.video
                    || streams.audioVideo) {
                    successCallback(streams);
                } else {
                    if (!error) {
                        error = new Error('Desktop not supported');
                    }
                    reject(error);
                }
            });
        });
    }

    /**
     * Creates the local MediaStreams.
     * @param {Object} [options] optional parameters
     */
    newObtainAudioAndVideoPermissions(options = {}) {
        return this.obtainAudioAndVideoPermissions(options);
    }

    /**
     *
     */
    getDeviceAvailability() {
        return devices;
    }

    /**
     *
     */
    isDeviceListAvailable() {
        return Promise.resolve(Boolean(this.enumerateDevices));
    }

    /**
     * Returns true if changing the input (camera / microphone) or output
     * (audio) device is supported and false if not.
     * @params {string} [deviceType] - type of device to change. Default is
     *      undefined or 'input', 'output' - for audio output device change.
     * @returns {boolean} true if available, false otherwise.
     */
    isDeviceChangeAvailable(deviceType) {
        return deviceType === 'output' || deviceType === 'audiooutput'
            ? isAudioOutputDeviceChangeAvailable
            : Boolean(this.enumerateDevices);
    }

    /**
     * A method to handle stopping of the stream.
     * One point to handle the differences in various implementations.
     * @param mediaStream MediaStream object to stop.
     */
    stopMediaStream(mediaStream) {
        mediaStream.getTracks().forEach(track => {
            // stop() not supported with IE
            if (!browser.isTemasysPluginUsed() && track.stop) {
                track.stop();
            }
        });

        // leave stop for implementation still using it
        if (mediaStream.stop) {
            mediaStream.stop();
        }

        // The MediaStream implementation of the react-native-webrtc project has
        // an explicit release method that is to be invoked in order to release
        // used resources such as memory.
        if (mediaStream.release) {
            mediaStream.release();
        }

        // if we have done createObjectURL, lets clean it
        const url = mediaStream.jitsiObjectURL;

        if (url) {
            delete mediaStream.jitsiObjectURL;
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Returns whether the desktop sharing is enabled or not.
     * @returns {boolean}
     */
    isDesktopSharingEnabled() {
        return this.screenObtainer.isSupported();
    }

    /**
     * Sets current audio output device.
     * @param {string} deviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), 'default' for default
     *      device
     * @returns {Promise} - resolves when audio output is changed, is rejected
     *      otherwise
     */
    setAudioOutputDevice(deviceId) {
        if (!this.isDeviceChangeAvailable('output')) {
            Promise.reject(
                new Error('Audio output device change is not supported'));
        }

        return featureDetectionAudioEl.setSinkId(deviceId)
            .then(() => {
                audioOutputDeviceId = deviceId;
                audioOutputChanged = true;

                logger.log(`Audio output device set to ${deviceId}`);

                eventEmitter.emit(RTCEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
                    deviceId);
            });
    }

    /**
     * Returns currently used audio output device id, '' stands for default
     * device
     * @returns {string}
     */
    getAudioOutputDevice() {
        return audioOutputDeviceId;
    }

    /**
     * Returns list of available media devices if its obtained, otherwise an
     * empty array is returned/
     * @returns {Array} list of available media devices.
     */
    getCurrentlyAvailableMediaDevices() {
        return currentlyAvailableMediaDevices;
    }

    /**
     * Returns event data for device to be reported to stats.
     * @returns {MediaDeviceInfo} device.
     */
    getEventDataForActiveDevice(device) {
        const deviceList = [];
        const deviceData = {
            'deviceId': device.deviceId,
            'kind': device.kind,
            'label': device.label,
            'groupId': device.groupId
        };

        deviceList.push(deviceData);

        return { deviceList };
    }

    /**
     * Configures the given PeerConnection constraints to either enable or
     * disable (according to the value of the 'enable' parameter) the
     * 'googSuspendBelowMinBitrate' option.
     * @param constraints the constraints on which to operate.
     * @param enable {boolean} whether to enable or disable the suspend video
     * option.
     */
    setSuspendVideo(constraints, enable) {
        if (!constraints.optional) {
            constraints.optional = [];
        }

        // Get rid of all "googSuspendBelowMinBitrate" constraints (we assume
        // that the elements of constraints.optional contain a single property).
        constraints.optional
            = constraints.optional.filter(
                c => !c.hasOwnProperty('googSuspendBelowMinBitrate'));

        if (enable) {
            constraints.optional.push({ googSuspendBelowMinBitrate: 'true' });
        }
    }
}

const rtcUtils = new RTCUtils();

/**
 * Wraps original attachMediaStream function to set current audio output device
 * if this is supported.
 * @param {Function} origAttachMediaStream
 * @returns {Function}
 */
function wrapAttachMediaStream(origAttachMediaStream) {
    return function(element, stream) {
        // eslint-disable-next-line prefer-rest-params
        const res = origAttachMediaStream.apply(rtcUtils, arguments);

        if (stream
                && stream.getAudioTracks().length
                && rtcUtils.isDeviceChangeAvailable('output')

                // we skip setting audio output if there was no explicit change
                && audioOutputChanged) {
            element.setSinkId(rtcUtils.getAudioOutputDevice())
                .catch(function(ex) {
                    const err
                        = new JitsiTrackError(ex, null, [ 'audiooutput' ]);

                    GlobalOnErrorHandler.callUnhandledRejectionHandler({
                        promise: this, // eslint-disable-line no-invalid-this
                        reason: err
                    });

                    logger.warn(
                        'Failed to set audio output device for the element.'
                            + ' Default audio output device will be used'
                            + ' instead',
                        element,
                        err);
                });
        }

        return res;
    };
}

export default rtcUtils;
