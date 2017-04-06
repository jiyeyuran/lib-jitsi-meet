/**
 * The errors for the conference.
 */

/**
 * Indicates that client must be authenticated to create the conference.
 */
export const AUTHENTICATION_REQUIRED = 'conference.authenticationRequired';

/**
 * Indicates that chat error occurred.
 */
export const CHAT_ERROR = 'conference.chatError';

/**
 * Indicates that conference has been destroyed.
 */
export const CONFERENCE_DESTROYED = 'conference.destroyed';

/**
 * Indicates that max users limit has been reached.
 */
export const CONFERENCE_MAX_USERS = 'conference.max_users';

/**
 * Indicates that a connection error occurred when trying to join a conference.
 */
export const CONNECTION_ERROR = 'conference.connectionError';

/**
 * Indicates that a connection error is due to not allowed,
 * occurred when trying to join a conference.
 */
export const NOT_ALLOWED_ERROR = 'conference.connectionError.notAllowed';

/**
 * Indicates that focus error happened.
 */
export const FOCUS_DISCONNECTED = 'conference.focusDisconnected';

/**
 * Indicates that focus left the conference.
 */
export const FOCUS_LEFT = 'conference.focusLeft';

/**
 * Indicates that graceful shutdown happened.
 */
export const GRACEFUL_SHUTDOWN = 'conference.gracefulShutdown';

/**
 * Indicates that the versions of the server side components are incompatible
 * with the client side.
 */
export const INCOMPATIBLE_SERVER_VERSIONS
    = 'conference.incompatible_server_versions';

/**
 * Indicates that jingle fatal error happened.
 */
export const JINGLE_FATAL_ERROR = 'conference.jingleFatalError';

/**
 * Indicates that password cannot be set for this conference.
 */
export const PASSWORD_NOT_SUPPORTED = 'conference.passwordNotSupported';

/**
 * Indicates that a password is required in order to join the conference.
 */
export const PASSWORD_REQUIRED = 'conference.passwordRequired';

/**
 * Indicates that reservation system returned error.
 */
export const RESERVATION_ERROR = 'conference.reservationError';

/**
 * Indicates that the conference setup failed.
 */
export const SETUP_FAILED = 'conference.setup_failed';

/**
 * Indicates that there is no available videobridge.
 */
export const VIDEOBRIDGE_NOT_AVAILABLE = 'conference.videobridgeNotAvailable';
