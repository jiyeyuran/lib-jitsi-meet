/* global $, JitsiMeetJS */

const options = {
    hosts: {
        domain: 'room.jhmeeting.com',
        anonymousdomain: 'guest.room.jhmeeting.com',
        muc: 'muc.room.jhmeeting.com'
    },
    bosh: 'https://room.jhmeeting.com/http-bind'
};

const confOptions = {
    openBridgeChannel: true
};

const gumConstraints = {
    video: {
        aspectRatio: 16 / 9,
        height: {
            ideal: 360,
            max: 360,
            min: 240
        }
    }
};

// 简会会议室名称
const roomName = '10047';

// 简会jwt
const token = null;

let connection = null;
let isJoined = false;
let room = null;
let localTracksAdded = false;

let localTracks = [];
const remoteTracks = {};

/**
 * Handles local tracks.
 * @param tracks Array with JitsiTrack objects
 */
function onLocalTracks(tracks) {
    localTracks = tracks;

    localTracks.forEach(track => {
        track.addEventListener(
            JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
            () => console.log('local track stoped')
        );
        track.addEventListener(
            JitsiMeetJS.events.track.TRACK_AUDIO_OUTPUT_CHANGED,
            deviceId =>
                console.log(
                    `track audio output device was changed to ${deviceId}`
                )
        );

        if (track.getType() === 'video') {
            $('body').append('<video autoplay id=\'localVideo\' />');
            track.attach($('#localVideo')[0]);
        } else {
            $('body').append('<audio muted id=\'localAudio\' />');
            track.attach($('#localAudio')[0]);
        }
    });

    if (isJoined && !localTracksAdded) {
        console.log('add local tracks to conference');
        localTracksAdded = true;
        localTracks.forEach(track => room.addTrack(track));
    }
}

/**
 * Handles remote tracks
 * @param track JitsiTrack object
 */
function onAddTrack(track) {
    if (track.isLocal()) {
        return;
    }

    console.log(`track added!!! ${track}`);

    const participant = track.getParticipantId();

    if (track.getType() === 'video') {
        room.selectParticipant(participant);
    }

    if (!remoteTracks[participant]) {
        remoteTracks[participant] = [];
    }
    remoteTracks[participant].push(track);

    const id = participant + track.getType();

    $('body').append(`<${track.getType()} autoplay id='${id}' />`);

    track.attach($(`#${id}`)[0]);
}

/**
 * That function is executed when the conference is joined
 */
function onConferenceJoined() {
    console.log('conference joined!');
    isJoined = true;

    if (!localTracksAdded) {
        localTracksAdded = true;
        localTracks.forEach(track => {
            room.addTrack(track);
        });
    }
}

/**
 * User left conference.
 * @param id
 */
function onUserLeft(id) {
    console.log('user left', id);

    const tracks = remoteTracks[id] || [];

    tracks.forEach(onRemoveTrack);
}

/**
 * Remove track on UI.
 * @param track JitsiTrack object
 */
function onRemoveTrack(track) {
    if (track.isLocal()) {
        return;
    }
    console.log(`track removed!!! ${track}`);

    const id = track.getParticipantId();

    remoteTracks[id] = remoteTracks[id].filter(t => t === track);

    const elementId = `${id}${track.getType()}`;

    track.detach($(`#${elementId}`)[0]);
    $(`#${elementId}`).remove();
}

/**
 * That function is called when connection is established successfully
 */
function onConnectionSuccess() {
    room = connection.initJitsiConference(roomName, confOptions);
    room.on(JitsiMeetJS.events.conference.TRACK_ADDED, onAddTrack);
    room.on(JitsiMeetJS.events.conference.TRACK_REMOVED, onRemoveTrack);
    room.on(
        JitsiMeetJS.events.conference.CONFERENCE_JOINED,
        onConferenceJoined
    );
    room.on(JitsiMeetJS.events.conference.USER_JOINED, id => {
        console.log('user join', id);
    });
    room.on(JitsiMeetJS.events.conference.USER_LEFT, onUserLeft);
    room.on(JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED, track => {
        console.log(`${track.getType()} - ${track.isMuted()}`);

        const id = track.getParticipantId() + track.getType();

        $(`#${id}`).prop('muted', track.muted);
    });
    room.on(
        JitsiMeetJS.events.conference.DISPLAY_NAME_CHANGED,
        (userID, displayName) => console.log(`${userID} - ${displayName}`)
    );
    room.on(
        JitsiMeetJS.events.conference.TRACK_AUDIO_LEVEL_CHANGED,
        (userID, audioLevel) => {
            console.log(`${userID} - ${audioLevel}`);
        }
    );
    room.join();
}

/**
 * This function is called when the connection fail.
 */
function onConnectionFailed() {
    console.error('Connection Failed!');
}

/**
 * This function is called when the connection fail.
 */
function onDeviceListChanged(devices) {
    console.info('current devices', devices);
}

/**
 * This function is called when we disconnect.
 */
function disconnect() {
    console.log('disconnect!');
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onConnectionSuccess
    );
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onConnectionFailed
    );
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        disconnect
    );
}

/**
 *
 */
function unload() {
    console.log('unload');
    localTracks.forEach(track => track.dispose());
    room.leave();
    connection.disconnect();
}

let isVideo = true;

/**
 *
 */
function switchVideo() { // eslint-disable-line no-unused-vars
    isVideo = !isVideo;
    if (localTracks[1]) {
        localTracks[1].dispose();
        localTracks.pop();
    }
    JitsiMeetJS.createLocalTracks({
        devices: [ isVideo ? 'video' : 'desktop' ],
        constraints: gumConstraints
    })
        .then(tracks => {
            localTracks.push(tracks[0]);
            localTracks[1].addEventListener(
                JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
                () => console.log('local track stoped')
            );
            localTracks[1].attach($('#localVideo')[0]);
            room.addTrack(localTracks[1]);
        })
        .catch(error => console.log(error));
}

/**
 *
 * @param selected
 */
function changeAudioOutput(selected) { // eslint-disable-line no-unused-vars
    JitsiMeetJS.mediaDevices.setAudioOutputDevice(selected.value);
}

$(window).bind('beforeunload', unload);
$(window).bind('unload', unload);

JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);

JitsiMeetJS.init({});

connection = new JitsiMeetJS.JitsiConnection(null, token, options);

connection.addEventListener(
    JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
    onConnectionSuccess
);
connection.addEventListener(
    JitsiMeetJS.events.connection.CONNECTION_FAILED,
    onConnectionFailed
);
connection.addEventListener(
    JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
    disconnect
);

JitsiMeetJS.mediaDevices.addEventListener(
    JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED,
    onDeviceListChanged
);

connection.connect();

JitsiMeetJS.createLocalTracks({
    devices: [ 'audio', 'video' ],
    constraints: gumConstraints
})
    .then(onLocalTracks)
    .catch(error => {
        throw error;
    });

if (JitsiMeetJS.mediaDevices.isDeviceChangeAvailable('output')) {
    JitsiMeetJS.mediaDevices.enumerateDevices(devices => {
        const audioOutputDevices = devices.filter(
            d => d.kind === 'audiooutput'
        );

        if (audioOutputDevices.length > 1) {
            $('#audioOutputSelect').html(
                audioOutputDevices
                    .map(
                        d => `<option value="${d.deviceId}">${d.label}</option>`
                    )
                    .join('\n')
            );

            $('#audioOutputSelectWrapper').show();
        }
    });
}
