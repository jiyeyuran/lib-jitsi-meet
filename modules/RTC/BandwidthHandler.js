import RTCBrowserType from './RTCBrowserType';

/**
 * Limit bandwidth via modifying remote sdp.
 */
export default class BandwidthHandler {
    /**
     * Set bandwidth use b=AS:xxx
     * @param {object} sdp - Remote sdp.
     * @param {number | object} bandwidth - Bandwidth to be limited.
     */
    static setBandwidth(sdp, bandwidth) {
        if (!bandwidth) {
            return sdp;
        }
        let workingSdp = sdp;
        let workingBw = bandwidth;
        let modifier = 'AS';

        if (RTCBrowserType.isFirefox()) {
            if (typeof workingBw === 'number') {
                workingBw = workingBw * 1000;
            } else {
                if (bandwidth.audio) {
                    bandwidth.audio = bandwidth * 1000;
                }
                if (bandwidth.video) {
                    bandwidth.video = bandwidth * 1000;
                }
            }
            modifier = 'TIAS';
        }

        if (typeof workingBw === 'number') {
            if (workingSdp.indexOf(`b=${modifier}:`) === -1) {
                workingSdp = workingSdp.replace(/c=IN (.*)\r\n/,
                    `c=IN $1\r\nb=${modifier}:${workingBw}\r\n`);
            } else {
                workingSdp = sdp.replace(new RegExp(`b=${modifier}:.*\r\n`),
                    `b=${modifier}:${workingBw}\r\n`);
            }

            return workingSdp;
        }

        // remove existing bandwidth lines
        if (bandwidth.audio || bandwidth.video) {
            workingSdp = workingSdp.replace(/b=AS([^\r\n]+\r\n)/g, '');
        }
        if (bandwidth.audio) {
            workingSdp = workingSdp.replace(/a=mid:audio\r\n/g,
                `a=mid:audio\r\nb=${modifier}:${bandwidth.audio}\r\n`);
        }
        if (bandwidth.video) {
            workingSdp = workingSdp.replace(/a=mid:video\r\n/g,
                `a=mid:video\r\nb=${modifier}:${bandwidth.video}\r\n`);
        }

        return workingSdp;
    }
}
