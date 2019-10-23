简会 API
============

使用简会API创建定制视频会议界面.

安装
==========

首先嵌入简会API库

```javascript
<script src="https://cdn.bootcss.com/jquery/3.4.1/jquery.slim.min.js"></script>
<script src="https://room.jhmeeting.com/libs/lib-jitsi-meet.min.js"></script>
```

然后通过 ```JitsiMeetJS``` 全局对象访问简会API.

组件
=========

简会API具有以下组件:

* JitsiMeetJS

* JitsiConnection

* JitsiConference

* JitsiTrack

* JitsiTrackError

使用
======
JitsiMeetJS
----------
你可以通过 ```JitsiMeetJS``` 对象使用以下方法和对象。


*  ```JitsiMeetJS.init(options)``` - 初始化简会API。
```options``` 参数是 JS 对象，具有以下属性。
    - `useIPv6` - boolean 允许使用IPv6地址，
    - `disableAudioLevels` - boolean 是否关闭语音音量大小检测。

* ```JitsiMeetJS.JitsiConnection``` - ```JitsiConnection``` 构造函数，用于创建服务器链接。

* ```JitsiMeetJS.setLogLevel``` - 改变日志级别，例如只显示错误log:
```
JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
```

* ```JitsiMeetJS.createLocalTracks(options, firePermissionPromptIsShownEvent)``` - 创建媒体流tracks，返回 ```Promise``` 对象。 如果失败则抛出 ```JitsiTrackError``` 实例.
    - options - 创建本地媒体流tracks的JS配置对象：
        1. devices - string数组 - 可以是"desktop", "video" 或 "audio"，如果没有设置将获取当前设备的音视频流
        2. resolution - 设置本地视频分辨率，例如360，720
        3. constraints - 新版设置本地视频分辨率，可代替resolution
        4. cameraDeviceId - 指定视频设备ID
        5. micDeviceId - 指定音频设备
        6. minFps - 最小视频帧率
        7. maxFps - 最大视频帧率
        8. facingMode - 指定前后摄像头 (可设置值为 - 'user', 'environment') 
    - firePermissionPromptIsShownEvent - 可选 boolean 参数，如果设置为 ```true```， 当浏览器请求摄像头和麦克风权限时，会产生 ```JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN``` 事件。

* ```JitsiMeetJS.isDesktopSharingEnabled()``` - 是否支持桌面分享。注意：此方法必须在 ```JitsiMeetJS.init(options)``` 完成后调用，否则会返回null。

* ```JitsiMeetJS.mediaDevices``` - JS对象，可与本地媒体设备交互。具有以下方法：
    - ```isDeviceListAvailable()``` - 返回是否可以获取设备列表。
    - ```isDeviceChangeAvailable(deviceType)``` - 是否允许改变输入设备（摄像头 / 麦克风）或输出设备（音频）。```deviceType``` 是要改变的设备类型。Undefined 或 'input' 代表输入设备，'output' - 代表音频输出设备.
    - ```enumerateDevices(callback)``` - 作为回调函数参数返回可用的设备列表。每个设备都是一个有以下属性的 MediaDeviceInfo 对象:
        - label - 设备名字
        - kind - "audioinput", "videoinput" 或 "audiooutput"
        - deviceId - 设备ID
        - groupId - 组标识ID，具有相同组ID的2个设备属于同一个物理设备；例如：一个显示器可能自带麦克风和摄像头。
    - ```setAudioOutputDevice(deviceId)``` - 设置当前的音频输出设备。```deviceId``` - 来自```JitsiMeetJS.enumerateDevices()```，kind 为 'audiooutput' 的设备ID，'' 可设置为默认设备。
    - ```getAudioOutputDevice()``` - 返回当前使用的音频输入设备ID，'' 表示默认设备。
    - ```isDevicePermissionGranted(type)``` - 返回Promise对象指示用户是否允许访问设备。```type``` - 'audio', 'video' 或者 ```undefined```。如果是```undefined```则检测是否音频和视频都被授权访问。
    - ```addEventListener(event, handler)``` - 添加事件处理函数
    - ```removeEventListener(event, handler)``` - 移除事件处理函数

* ```JitsiMeetJS.events``` - JS对象，包含可用于订阅连接或会议的事件。
    当前有两种事件类型 - connection 和 conference，可以通过以下方式访问 ```JitsiMeetJS.events.<event_type>.<event_name>```.
    例如：订阅某参会者离开会议室 - ```JitsiMeetJS.events.conference.USER_LEFT```.
    以下是支持的事件：
    1. conference
        - TRACK_ADDED - 收到流. (参数 - JitsiTrack)
        - TRACK_REMOVED - 移除流. (参数 - JitsiTrack)
        - TRACK_MUTE_CHANGED - JitsiTrack 打开或关闭. (参数 - JitsiTrack)
        - TRACK_AUDIO_LEVEL_CHANGED - JitsiTrack 音量改变. (参数 - participantId(string), audioLevel(number))
        - DOMINANT_SPEAKER_CHANGED - 发言者改变. (参数 - id(string))
        - USER_JOINED - 新用户加入会议室。(参数 - id(string), user(JitsiParticipant))
        - USER_LEFT - 成员离开会议室. (参数 - id(string), user(JitsiParticipant))
        - MESSAGE_RECEIVED - 收到新的文本消息。(参数 - id(string), text(string), ts(number))
        - DISPLAY_NAME_CHANGED - 用户改变名字。(参数 - id(string), displayName(string))
        - SUBJECT_CHANGED - 通知会议主题发生改变。(参数 - subject(string))
        - LAST_N_ENDPOINTS_CHANGED - lastN改变(参数 - leavingEndpointIds(array)离开lastN的成员ID, enteringEndpointIds(array) 进入lastN的成员ID)
        - CONFERENCE_JOINED - 本地用户成功加入会议室。(无参数)
        - CONFERENCE_LEFT - 通知本地用户成功离开会议室。(无参数)
        - USER_ROLE_CHANGED - 通知用户角色发生改变。(参数 - id(string), role(string))
        - USER_STATUS_CHANGED - 通知用户状态发生改变。(参数 - id(string), status(string))
        - CONFERENCE_FAILED - 通知用户加入会议失败。(参数 - errorCode(JitsiMeetJS.errors.conference))
        - CONFERENCE_ERROR - 通知发生错误。(参数 - errorCode(JitsiMeetJS.errors.conference))
        - KICKED - 通知用户已被踢出会议室。(参数 - user(JitsiParticipant))
        - START_MUTED_POLICY_CHANGED - 通知新加入会议的用户是否会打开音视频流 (参数 - JS对象，属性是 - audio(boolean), video(boolean))
        - STARTED_MUTED - 通知本地用户已静音。
        - ENDPOINT_MESSAGE_RECEIVED - 收到来自用户的视频质量消息。

    2. connection
        - CONNECTION_FAILED - 指示服务器连接失败。
        - CONNECTION_ESTABLISHED - 指示成功建立服务器连接。
        - CONNECTION_DISCONNECTED - 指示连接已断开
        - WRONG_STATE - 指定连接状态错误，用户无法执行操作。

    3. tracks
        - LOCAL_TRACK_STOPPED - 指示本地媒体流停止，调用```dispose()```方法会触发此事件.
        - TRACK_AUDIO_OUTPUT_CHANGED - 指示音频输出设备发生改变。(参数 - deviceId (string) - 新的音频输出设备).

    4. mediaDevices
        - DEVICE_LIST_CHANGED - 指示当前连接的设备列表发生改变。(参数 - devices(MediaDeviceInfo[])).
        - PERMISSION_PROMPT_IS_SHOWN - 指示当前正显示获取音视频设备权限窗口的环境。(参数 - environmentType ('chrome'|'opera'|'firefox'|'safari'|'nwjs'|'react-native'|'android').
        
    5. connectionQuality
        - LOCAL_STATS_UPDATED - 收到本地连接质量统计报告。(参数 - stats(object))
        - REMOTE_STATS_UPDATED - 收到远程连接质量统计报告。(参数 - id(string), stats(object))

* ```JitsiMeetJS.errors``` - 包含所有API错误的JS对象，可以使用此对象检测API出现的错误。
    有三种错误类型 - connection, conference 和 track，格式：```JitsiMeetJS.errors.<error_type>.<error_name>```.
    例如会议室需要密码才能加入 - ```JitsiMeetJS.errors.conference.PASSWORD_REQUIRED```.
    以下是支持的错误:
    1. conference
        - CONNECTION_ERROR - 会议连接错误。
        - SETUP_FAILED - 会议创建失败。
        - AUTHENTICATION_REQUIRED - 创建会议授权失败。
        - PASSWORD_REQUIRED - 指示连接失败，需要输入密码才能加入会议室。
        - PASSWORD_NOT_SUPPORTED - 指示会议室不能被加锁。
        - VIDEOBRIDGE_NOT_AVAILABLE - 视频服务器问题。
        - RESERVATION_ERROR - 预定会议室失败
        - GRACEFUL_SHUTDOWN - 会议室优雅关闭
        - CONFERENCE_DESTROYED - 会议室已销毁
        - CHAT_ERROR - 聊天发生错误
        - FOCUS_DISCONNECTED - focus服务器错误
        - FOCUS_DISCONNECTED - focus服务器离开会议室
        - CONFERENCE_MAX_USERS - 最大允许的参会人数达到限制
    2. connection
        - CONNECTION_DROPPED_ERROR - 指示连接断开，大部分原因是因为网络问题。
        - PASSWORD_REQUIRED - 需要输入密码才能加入会议室。
        - SERVER_ERROR - 指示太多服务器 5XX 相关的错误。
        - OTHER_ERROR - 所有其他错误。
    3. track
        - GENERAL - getUserMedia相关的一般性错误。
        - UNSUPPORTED_RESOLUTION - getUserMedia相关的错误，指示摄像头无法满足请求的分辨率。
        - PERMISSION_DENIED - getUserMedia相关的错误, 指示用户拒绝访问摄像头的权限。
        - NOT_FOUND - getUserMedia相关的错误， 指示请求设备没有找到。
        - CONSTRAINT_FAILED - getUserMedia相关的错误，指示无法满足getUserMedia中的constraints。
        - TRACK_IS_DISPOSED - 指示track已销毁不能被使用。
        - TRACK_NO_STREAM_FOUND - 指示媒体track没有关联MediaStream。

* ```JitsiMeetJS.errorTypes``` - 构造 Error 实例。可用于判断实例类型 ```error instanceof JitsiMeetJS.errorTypes.JitsiTrackError```。以下错误可用:
    1. ```JitsiTrackError``` - JitsiTrack发生错误

* ```JitsiMeetJS.logLevels``` - log对象等级:
    1. TRACE
    2. DEBUG
    3. INFO
    4. LOG
    5. WARN
    6. ERROR

JitsiConnection
------------
此对象代表服务器连接。可以使用```JitsiMeetJS.JitsiConnection```创建 ```JitsiConnection```对象。```JitsiConnection``` 有以下方法：


1. ```JitsiConnection(appID, token, options)``` - 创建连接对象.

    - appID - 会议服务商ID **注意：当前没有实现。必须输入```null```**
    - token - 创建会议室的token.
    - options - 服务器连接配置对象，属性有:
        1. bosh - 连接地址
        2. hosts - JS对象
            - domain
            - muc
            - anonymousdomain

2. connect(options) - 建立服务器连接
    - options - 对象有 ```id``` 和 ```password```属性.

3. disconnect() - 断开服务器连接

4. initJitsiConference(name, options) - 创建新的```JitsiConference```对象.
    - name - 会议室名字
    - options - JS配置对象，可选属性:
        1. openBridgeChannel - 开启brige通道，必须设置为true
        2. recordingType - 录制类型，必须设置为jibri
        3. startSilent - 开启静音模式，不发送和接收音频

5. addEventListener(event, listener) - 订阅事件
    - event - 来自```JitsiMeetJS.events.connection```对象的事件.
    - listener - 事件处理函数。

6. removeEventListener(event, listener) - 移除订阅事件
    - event - 事件。
    - listener - 移除的事件处理函数。


JitsiConference
-----------
此对象代表会议室，具有以下方法:


1. join(password) - 加入会议室
    - password - 可选，会议室密码。

2. leave() - 离开会议室，返回Promise。

3. myUserId() - 本地用户ID

4. getLocalTracks() - 代表本地媒体流的JitsiTrack数组。

5. addEventListener(event, listener) - 订阅会议事件
    - event - 来自```JitsiMeetJS.events.conference```对象的事件。
    - listener - 事件监听函数。

6. removeEventListener(event, listener) - 移除订阅事件
    - event - 事件
    - listener - 待移除事件监听函数。

7. on(event, listener) - 同addEventListener

8. off(event, listener) - 同removeEventListener

9. sendTextMessage(text) - 发送消息给所有其他参会者。

10. setDisplayName(name) - 改变本地参会者名称。
    - name - 新的名称

11. selectParticipant(participantId) - 接收参会者的高清视频流。
    - participantId - 参数者ID

如果操作失败抛出 NetworkError 或 InvalidStateError 或 Error.

17. addTrack(track) - 向会议室添加 JitsiLocalTrack 对象. 如果添加第二个视频流则抛出错误，返回Promise。
    - track - the JitsiLocalTrack

18. removeTrack(track) - 从会议室中移除 JitsiLocalTrack，返回Promise.
    - track - the JitsiLocalTrack

20. getRole() - 返回当前用户的角色("moderator" or "none")

21. isModerator() - 检测本地用户是否有 "moderator" 角色

22. lock(password) - 设置会议室密码，返回Promise
    - password - string password

    注意：仅moderator用户可用

23. unlock() - 移除会议室密码，返回Promise

    注意：仅moderator用户可用

24. kick(id) - 将成员踢出会议室
    - id - string 成员id

25. setStartMutedPolicy(policy) - 设置新加入的成员是否打开音视频
    - policy - JS对象，属性：
        - audio - boolean 是否静音
        - video - boolean 是否打开视频

    注意：仅moderator用户可用

26. getStartMutedPolicy() - 返回当前Muted Policy设置
    - policy - JS对象，属性：
        - audio - boolean 是否静音
        - video - boolean 是否打开视频

27. isStartAudioMuted() - 检测是否加入时静音

28. isStartVideoMuted() - 检测是否加入时打开视频

30. setSubject(subject) - 改变会议主题
    - subject - string 新的主题

    注意：仅moderator用户可用

31. sendEndpointMessage(to, payload) - 通过data channel发送终端消息
    - to - 接收消息的终端ID，如果设置为 "" 消息将发送到所有成员。
    - payload - JSON 对象 - 消息内容

如果操作失败抛出 NetworkError 或 InvalidStateError 或 Error。

32. broadcastEndpointMessage(payload) - 通过datachannels发送广播消息。
    - payload - JSON对象，消息内容.

如果操作失败抛出 NetworkError 或 InvalidStateError 或 Error。

33. pinParticipant(participantId) - 总是接收当前成员ID的视频（即使lastN是打开状态）。
    - participantId - 成员ID

如果操作失败抛出 NetworkError 或 InvalidStateError 或 Error。

34. setReceiverVideoConstraint(resolution) - 设置期望从视频服务器获取的分辨率（180, 360, 720, 1080）。

35. isHidden - 检测本地用户是否是作为隐藏用户加入会议。

JitsiTrack
======
此对象代表单个音频或视频流。其可以是远程流（来自其他参会成员）或者本地流（来自本地用户的设备）。对象方法如下：

1. getType() - 返回track类型字符串（"video"代表视频流，"audio"代表音频流）

2. mute() - 关闭流，返回Promise。

   注意：该方法只有本地流可用。

3. unmute() - 返回流，返回Promise。

   注意：该方法只有本地流可用。

4. isMuted() - 检测流是否关闭

5. attach(container) - 将流关联到指定dom容器。

6. detach(container) - 将流从指定dom容器中移除。

7. dispose() - 销毁流，如果流已加入会议，则从会议中移除，返回Promise。

   注意：该方法只有本地流可用。

8. getId() - 返回流id。

9. getParticipantId() - 返回流所属成员ID

   注意：该方法只有远程流可用。

10. setAudioOutput(audioOutputDeviceId) - 设置流的音频输出设备，视频流将忽略。

11. getDeviceId() - 返回流所属的设备ID

   注意：该方法只有本地流可用。

12. isEnded() - 返回流是否已结束

JitsiTrackError
======
此对象继承自```Error```对象代表JitsiTrack错误。
因此拥有```"name"```, ```"message"``` 和 ```"stack"``` 属性。 对getUserMedia相关的错误，将暴露附加属性```"gum"```, 其属性有:
 - error - 原始的getUserMedia错误
 - constraints - 使用的getUserMedia constraints对象
 - devices - getUserMedia请求的设备数组 (可能的值有 - "audio", "video", "screen", "desktop", "audiooutput")

开始使用
==============

1. 首先必须初始化 ```JitsiMeetJS``` 对象:

```javascript
JitsiMeetJS.init();
```

2. 然后创建连接对象:


```javascript
var connection = new JitsiMeetJS.JitsiConnection(null, null, options);
```


3. 添加连接事件，打开连接:

```javascript
connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionSuccess);
connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, disconnect);

connection.connect();
```

4. 收到```CONNECTION_ESTABLISHED```事件后，创建```JitsiConference```对象
监听会议相关的事件（如成功加入会议，接收到远程流等）：


```javascript

room = connection.initJitsiConference("conference1", confOptions);
room.on(JitsiMeetJS.events.conference.TRACK_ADDED, onRemoteTrack);
room.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, onConferenceJoined);
```

5. （可选）从本地摄像头和麦克风中获取本地音视频流
```javascript
JitsiMeetJS.createLocalTracks().then(onLocalTracks);
```

注意：获取本地音视频流不是必须的。

6. 最后你可以加入会议了：

```javascript
room.join();
```

加入会议后，你可以继续添加代码处理会议事件。
