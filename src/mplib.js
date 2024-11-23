/* ---------------------------------------------------------- 
      Firebase MultiPlayer Library v. 1.30
   ----------------------------------------------------------
*/

/* To do
   Resolve inconsistency between setting allowReplacements to true and setting minimum and maximum number of players to the same number. The behavior for this setting is not well defined 
   Maybe only allow replacements if the minimum and maximum number of players is not the same?

   Add a waiting room time out callback
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js"; // "./firebase/firebase-auth.js"; 
import {
    getDatabase, ref, onValue, get, set, update, off,
    push, onChildAdded, onChildChanged,
    onChildRemoved, remove, serverTimestamp, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js"; //"./firebase/firebase-database.js";  //;

// si contains the session information that the client will see
let si = {
    playerId: generateId(), // Create a random id for the player; this id is different across browser windows on the same client 
};
//initSessionInfo();

let playerHasControl;
let sessionConfig;
let studyId;
let verbosity;
let stateRef = [];
let presenceRef, connectedRef, otherPresenceRef;
let sessionsRef, recordEventsRef;
let offsetRef;
let serverTimeOffset = 0; // default
let numPlayersBefore = 0;
let focusStatus = 'focus';
let playerControlBefore = '';
let intervalId; // interval timer for the waiting room countdown;
let startTime;
let listenerPaths;

let callback_sessionChange;
let callback_receiveStateChange;
let callback_evaluateUpdate;
let callback_removePlayerState; 

// Initialize App
const firebaseApp = initializeApp(firebasempConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);


//------------------------------------------------------
// Define some new functions we can use in other code
//------------------------------------------------------
// Takes the URL parameters to update the session configuration
export function updateConfigFromUrl( sessionConfig ) {
    const url = window.location.href;
    const urlParams = new URL(url).searchParams;

    for (let key in sessionConfig) {
        if (urlParams.has(key)) {
            const value = urlParams.get(key);

            let newValue;
            if (!isNaN(value)) {
                newValue = Number(value);
            }
            else if (value === 'true' || value === 'false') {
                newValue = (value === 'true');
            }
            // if not a number or boolean, treat it as a string
            else {
                newValue = value;              
            }
            sessionConfig[key] = newValue;
            myconsolelog( `URL parameters update session parameter ${key} to value ${newValue}`);
        }
    }
}

export function getCurrentPlayerId() {
    return si.playerId;
}

export function getCurrentPlayerIds() {
    return si.playerIds;
}

export function getAllPlayerIds() {
    return Object.keys( si.allPlayersEver );
}

export function getPlayerInfo( playerId ) {
    return si.allPlayersEver[ playerId ];
}

export function getNumberCurrentPlayers() {
    return si.playerIds.length;
}

export function getNumberAllPlayers() {
    return Object.keys( si.allPlayersEver ).length;
}

export function getCurrentPlayerArrivalIndex() {
    return si.allPlayersEver[ si.playerId ].arrivalIndex;
}

export function getSessionId() {
    return si.sessionId;
}

export function anyPlayerTerminatedAbnormally() {
    if (si.allPlayersEver) {
        let players = si.allPlayersEver; 
        const hasAbnormalStatus = Object.values(players).some(player => player.finishStatus === 'abnormal');
        return hasAbnormalStatus;
    } else {
        return false;
    }
}

export function getSessionError() {
    let obj = { errorCode: si.sessionErrorCode, errorMsg: si.sessionErrorMsg };
    return obj;
}

export function getWaitRoomInfo() {
    let doCountDown = ( si.status === 'waitingRoomCountdown');
    let secondsLeft = si.countdown;
    return [ doCountDown, secondsLeft ];
}

export function hasControl() {
    return playerHasControl;
}

export function isBrowserCompatible() {
    let isok = true;
    //if (isEdgeBrowser) isok = false;
    return isok;
}

// Initialize the session parameters, name of the study, and list of functions that are used for the callbacks
export function initializeMPLIB( sessionConfigNow , studyIdNow , funList, listenerPathsNow, verbosityNow ) {
    

    sessionConfig = sessionConfigNow; // session parameters
    studyId = studyIdNow; // name of the study that is used as the root node in firebase
    verbosity = verbosityNow; // verbosity = 0: no messages to console; 1: write messages to the console 

    // List of callback functions that MPLIB can use when session or state changes
    callback_sessionChange = funList.sessionChangeFunction;
    callback_receiveStateChange = funList.receiveStateChangeFunction;
    callback_evaluateUpdate = funList.evaluateUpdateFunction;
    callback_removePlayerState = funList.removePlayerStateFunction;

    if (!isBrowserCompatible()) {
        si.sessionErrorCode = 3;
        si.sessionErrorMsg = 'Browser incompatibility';
        si.status = 'endSession';
        callback_sessionChange.endSession();
    } else {
        // 
        listenerPaths = [...listenerPathsNow ]; // create a copy of the array
        if (!listenerPaths) {
            listenerPaths = [ '' ];
        }

        // Do some house cleaning of the database by removing states that are no longer associated with active sessions (e.g. user closed browser)
        removeOrphanedStatePaths();

        // Reset the session info information
        startTime = new Date(); // record the time at which the library was started (typically start of reading instructions)
        initSessionInfo();
        myconsolelog("Player id=" + si.playerId);

        initializeFirebaseListeners();
    }
}

async function removeOrphanedStatePaths() {
     
    // Read out the states data for this study
    let statesData = await readData( `${studyId}/states` );

    if (statesData != null) {
        // If there is state data, create an array of all session IDs associated with state data
        let listSessionsinStates = Object.keys( statesData );

        // Now create a list of all active sessions (IDs)
        let sessionsData = await readData( `${studyId}/sessions` ); 
        let listSessions = [];
        if (sessionsData != null) {
            listSessions = Object.keys( sessionsData );
        }

        // Find the session IDs that are associated with states but are not associated with active sessions
        let difference = listSessionsinStates.filter(x => !listSessions.includes(x));

        difference.forEach(sessionidnow => {
            myconsolelog(`State path with no active session: ${sessionidnow}`);
            try {
                remove(ref(db, `${studyId}/states/${sessionidnow}`));
                myconsolelog(".... Data removed successfully.");
            } catch (error) {
                myconsolelog("Error removing data: ", error);
            }

        });
    }
}

// Experimental feature: 
// reading the state at a given path
async function readData(path) {
    const dbRef = ref(db, path );
    try {
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
            return snapshot.val();
        } else {
            myconsolelog("No data available");
            return null;
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

function initializeFirebaseListeners() {
    // Set up the listeners used to monitor changes to the session state

    // Database reference to all sessions (not just the current session on this client)  
    sessionsRef = ref(db, `${studyId}/sessions`);

    // This listener will detect all session changes (e.g. joining/leaving)
    onValue(sessionsRef, (snapshot) => {
        const whNode = snapshot.key;
        const sessions = snapshot.val();
        if (sessions !== null) {
            var keys = Object.keys(sessions);
            for (var i = 0; i < keys.length; i++) {
                var sessionId = keys[i];
                let session = sessions[sessionId];
                if (session !== null) {
                    // Does this session involve this player?
                    if (si.playerId in session.players) {
                        triggerSessionCallback( session , sessionId );
                        break;
                    }
                }
            };
        }
    });

    // Set up a listener that removes *other* clients who are disconnecting
    otherPresenceRef = ref(db, `${studyId}/presence/`);
    onChildAdded( otherPresenceRef, (snapshot) => {
        let thisPlayer = snapshot.key;
        sessionUpdate('remove', thisPlayer, 'abnormal').then(result => {
            remove(ref(db, `${studyId}/presence/${thisPlayer}`));
        });
    });

    // Get the server time offset relative to the client time
    offsetRef = ref(db, ".info/serverTimeOffset");
    serverTimeOffset = 0;
    onValue(offsetRef, (snap) => {
        serverTimeOffset = snap.val();
        myconsolelog(`Server offset time: ${serverTimeOffset}`);
    });
}

function initSessionInfo() {
    // Initialize the session information but keep the playerId that was set 
    let playerId = si.playerId; 
    si = {
        status: '',
        numPlayers: 0, 
        playerId,
        playerIds: [], 
        sessionId: null, 
        sessionIndex: null, 
        arrivalIndex: null, 
        arrivalIndices: [],
        countdown: null,
        sessionErrorCode: 0,
        sessionErrorMsg: '',
        sessionInitiated: false,
        sessionStarted: false
    };    
}

function triggerSessionCallback( session , sessionId ) {
    // Process the information in "session" and trigger the appropriate callbacks on the client 
    let currentStatus = session.status; // either 'waiting' or 'active'
    si.numPlayers = Object.keys(session.players).length;
    si.playerIds = Object.keys( session.players );
    si.allPlayersEver = session.allPlayersEver; 
    si.arrivalIndices = Object.values(session.players).map(player => player.arrivalIndex);
    si.countdown = null;
    
    if ((currentStatus == 'waiting') & (!si.sessionInitiated)) {
        si.sessionInitiated = true;
        si.sessionStarted = false;
        si.sessionId = sessionId;
        si.sessionIndex = session.sessionIndex;
        si.arrivalIndex = session.players[si.playerId].arrivalIndex;
        numPlayersBefore = si.numPlayers;
        si.status = 'waitingRoomStarted';
        callback_sessionChange.joinedWaitingRoom(); // trigger callback 
    } else if ((currentStatus == 'active') & (!si.sessionStarted)) {
        si.sessionInitiated = true;
        si.sessionStarted = true;
        si.sessionId = sessionId;
        si.sessionIndex = session.sessionIndex;
        si.arrivalIndex = session.players[si.playerId].arrivalIndex;
        numPlayersBefore = si.numPlayers;
        
        if (sessionConfig.exitDelayWaitingRoom==0) {
            si.status = 'sessionStarted';
            startSession(); // Can start the session without delay
        } else {
            // Delay the start of entering the session
            let remainingSeconds = sessionConfig.exitDelayWaitingRoom;

            si.status = 'waitingRoomCountdown';
            si.countdown = remainingSeconds;
            callback_sessionChange.updateWaitingRoom();

            intervalId = setInterval(() => {
                if (remainingSeconds > 0) {
                    si.status = 'waitingRoomCountdown';
                    si.countdown = remainingSeconds;
                    callback_sessionChange.updateWaitingRoom();
                    remainingSeconds--;
                } else {
                    clearInterval(intervalId); 
                    si.status = 'sessionStarted';
                    startSession();
                }
            }, 1000);
        }
        
    } else if (si.numPlayers !== numPlayersBefore) {
        numPlayersBefore = si.numPlayers;
        if (currentStatus == 'waiting') {
            callback_sessionChange.updateWaitingRoom();
        }
        if (currentStatus == 'active') {
            if (si.status == 'waitingRoomCountdown') {
                // Case where a waiting room countdown has started on this client but another player has left the session during the countdown
                // ...
            } else {
                callback_sessionChange.updateOngoingSession();                                        
                
                // Check if the number of players is below the minimum
                if (si.numPlayers < sessionConfig.minPlayersNeeded) {
                    // Leave session immediately
                    //si.sessionErrorCode = 3;
                    //si.sessionErrorMsg = 'Number of players fell below minimum needed';
                    si.status = 'endSession'; // This should produce an error when minplayer 
                    leaveSession();
                    
                }                                         
            }
            
        }
    }

    // Does this player have control?
    playerHasControl = (session.playerControl == si.playerId);
}





// Function for player wanting to join a session
export function joinSession() {
    sessionUpdate('join', si.playerId).then(result => {
        if (!result.isSuccess) { 
        //if (!result) {
            // Trigger function when session (active or waiting-room) could not be started
            si.sessionErrorCode = 1;
            si.sessionErrorMsg = 'Unable to join session';
            si.status = 'endSession';
            callback_sessionChange.endSession();
        } else {
            // Now that we are in a session (active or waiting room), keep track of presence
            presenceRef = ref(db, `${studyId}/presence/${si.playerId}`);

            // Write a string to the presence state when this client loses connection
            onDisconnect(presenceRef).set("I disconnected!");

            // Set up a listener to handle disconnects
            connectedRef = ref(db, ".info/connected");
            onValue(connectedRef, (snap) => {
                if (snap.val() === true) {
                    myconsolelog("Connected to firebase");
                } else {
                    myconsolelog("Disconnected from firebase");
                    si.status = 'endSession';
                    si.sessionErrorCode = 2;
                    si.sessionErrorMsg = 'Session Disconnected';
                    callback_sessionChange.endSession();
                }
            });
        }
    });
    
}

// Function for player leaving a session
export async function leaveSession() {
    // Run a transaction to remove this player
    sessionUpdate('remove', si.playerId, 'normal').then(result => {
        if (sessionConfig.recordData) {                         
            let recordPlayerRef = ref(db, `${studyId}/recordedData/${si.sessionId}/players/${si.playerId}/`);
            // Get the object that stores all information about this player
            let playerInfo = {}; 
            // Add the time that the player left
            playerInfo.finishStatus = 'normal';
            playerInfo.leftGameAt = serverTimestamp(); 
            update(recordPlayerRef, playerInfo);
        } 

        // remove this player from the game state
        callback_removePlayerState();

        // Remove the disconnect listener....
        off(presenceRef);
        off(connectedRef);
        off(otherPresenceRef);

        // remove the listener for game state
        for (let i=0; i<listenerPaths.length; i++) {
            off(stateRef[i]);
            if (result.sessionsState===null) {
                // the state can be removed as there are no more players left in this session
                remove(stateRef[i]);
            }
        }

        // remove the listener for session changes
        off(sessionsRef);

        // If this transaction is successful...
        si.status = 'endSession';

        callback_sessionChange.endSession();
    });  
}

// Function to start an active session (e.g. coming out of a waiting room, or when a single player can start a session)
function startSession() {
    
    // Create a path to store all recorded events related to state changes 
    recordEventsRef = ref(db, `${studyId}/recordedData/${si.sessionId}/events/`);

    for (let i=0; i<listenerPaths.length; i++) {
        // What is the root node for this set of listeners? 
        let pathNow = listenerPaths[ i ];

        // Create a path to store the game state
        stateRef[ i ]= ref(db, `${studyId}/states/${si.sessionId}/${pathNow}`);

        // Create a listener for changes in the state 
        onChildChanged(stateRef[ i ], (snapshot) => {
            const nodeName = snapshot.key;
            const state = snapshot.val();
            if (state != null) {
                // execute this function in the client game code 
                callback_receiveStateChange(pathNow,nodeName, state, 'onChildChanged');
            }
        });


        // Create a listener for additions to the state
        onChildAdded(stateRef[ i ], (snapshot) => {
            const nodeName = snapshot.key;
            const state = snapshot.val();
            if (state != null) {
                // execute this function in the client game code 
                callback_receiveStateChange(pathNow,nodeName, state, 'onChildAdded');
            }
        });

        // Create a listener for additions to the state
        onChildRemoved(stateRef[ i ], (snapshot) => {
            const nodeName = snapshot.key;
            const state = snapshot.val();
            if (state != null) {
                // execute this function in the client game code 
                callback_receiveStateChange(pathNow,nodeName, state, 'onChildRemoved');
            }
        });

        //console.log(entry);
    };
    
    // Invoke function at client
    callback_sessionChange.startSession();
}

// Handle event of player closing browser window
window.addEventListener('beforeunload', function (event) {
    if ((si.sessionInitiated) && (si.status !== 'endSession')) {
        // Only remove this player when the session started      
        if (sessionConfig.recordData) {              
            // Update the database here because the browser apparently will not wait until the transaction is finished and therefore 
            // will not execute the updating of the players data   
            let recordPlayerRef = ref(db, `${studyId}/recordedData/${si.sessionId}/players/${si.playerId}/`);

            // Get the object that stores all information about this player
            let playerInfo = {}; 

            // Add the time that the player left
            playerInfo.finishStatus = 'abnormal';
            playerInfo.leftGameAt = serverTimestamp(); 
            update(recordPlayerRef, playerInfo);
        } 

        sessionUpdate('remove', si.playerId, 'abnormal');
        callback_removePlayerState();
    }
});

// When a client's browser comes into focus, it becomes eligible for object control
window.addEventListener('focus', function () {
    focusStatus = 'focus';
    if ((si.sessionInitiated) && (si.status !== 'endSession')) {
        myconsolelog('Player is in focus');
        sessionUpdate('focus', si.playerId);
    }
});

// When a client's browser is out of focus, it becomes ineligible for object control
window.addEventListener('blur', function () {
    focusStatus = 'blur';
    if ((si.sessionInitiated) && (si.status !== 'endSession')) {
        myconsolelog('Player has lost focus');
        sessionUpdate('blur', si.playerId);
    }
});

// Experimental feature: 
// reading the state at a given path
export async function readState(path) {
    const dbRef = ref(db, `${studyId}/states/${si.sessionId}/${path}`);
    try {
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
            return snapshot.val();
        } else {
            myconsolelog("No data available");
            return null;
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

// This function allows for direct changes to a gamestate without checking for conflicts
// Use these updates to speed up games with continuous movements where players' movements do
// not conflict with each other
export function updateStateDirect(path, newState, optionalDescription = '' ) {
    let refNow = ref(db, `${studyId}/states/${si.sessionId}/${path}`);
    if (newState == null) {
        // If the proposed state is null, use that to remove the node (so we can clean up the gamestate for players who leave the game)
        remove(refNow).then( () => { recordEventData( path, newState, optionalDescription )});
    } else {
        // Note that with the firebase update function, it only changes the fields indicated in newState and leaves all other fields intact
        if (typeof newState === 'object') {
            update(refNow, newState).then( () => { recordEventData( path, newState, optionalDescription )});;
        } else {
            set(refNow, newState).then( () => { recordEventData( path, newState, optionalDescription )});;
        }
    }
}

function recordEventData(path, state, optionalDescription ) {
    // Are we recording the data?
    if (sessionConfig.recordData) {
        let returnResult = {
            s: state,
            t: serverTimestamp(),
            pId: si.playerId,
            p: path,
            d: optionalDescription
        };
        
        let newDataRef = push(recordEventsRef);
        set(newDataRef, returnResult);
    } 
}


// The updateStateTransaction function uses a transaction to address concurrency issues (i.e., multiple players all making moves at the same time).
export async function updateStateTransaction(path, action, actionArgs) {
    let refNow = ref(db, `${studyId}/states/${si.sessionId}/${path}`);

    /* The code below uses the runTranaction function fromthe realtime database SDK that has some unexpected behavior. For example,
   when it first run, the currentState will either be "NULL" or some previous cached value that is unrelated to the current proposedMove.

   As a result, the runTransaction function is often run twice. The first time with a "guess" about the currentState (often NULL or a cached value). 
   If there is a mismatch, the function is run again but now with the actual state that was retrieved.

   This behavior is documented here:
   https://stackoverflow.com/questions/57130534/firebase-realtime-database-transaction-handler-gets-called-twice-most-of-the-tim/57134276#57134276
   https://stackoverflow.com/questions/69714542/valueeventlistener-returning-a-snapshot-with-null-value-for-a-brief-second-after

   Note that the applyLocally flag is set to false: this prevents any intermediate states during the transaction from
   triggering any event listeners
*/
    return runTransaction(refNow, (state) => {
        // Check whether the action is allowed given the current game state
        const actionResult = callback_evaluateUpdate(path, state, action, actionArgs);
        let isAllowed = actionResult.isAllowed;
        let newState = actionResult.newState;
        if (isAllowed) {
            //myconsolelog('Game state updated successfully');
            return newState;
        } else {
            //myconsolelog('Game state could not be updated');
            return undefined;
        }
    }, {
        // Ensure that event listeners are not triggered for intermediate states
        applyLocally: false
    }).then(result => {
        let isSuccess = result.committed;

        if (!isSuccess) {
            myconsolelog(`Transaction failed: ${action} ${actionArgs}`);
        } else {
            myconsolelog(`Transaction successful: ${action} ${actionArgs}`);

            // Are we recording the data?
            if (sessionConfig.recordData) {
                let newState = result.snapshot.val();
                let returnResult = {
                    s: newState,
                    t: serverTimestamp(),
                    pId: si.playerId,
                    p: path,
                    a: action,
                    args: actionArgs
                };

                let newDataRef = push(recordEventsRef);
                set(newDataRef, returnResult);
            }
        }

        return isSuccess;

    }).catch(error => {
        console.error("Transaction failed with error: ", error);
    });
}

// Coordinate session updates (players leaving/adding)
async function sessionUpdate(action, thisPlayer, extraArg ) {
    return runTransaction(sessionsRef, (allSessions) => {
        let allowed = false;

        // ------------------------------------------------------
        //    Attempt to remove player from session
        // ------------------------------------------------------
        if (action == 'remove') {
            [ allowed , allSessions ] = removePlayerSession( allSessions , thisPlayer, extraArg );     
        }

        // ------------------------------------------------------
        //    Attempt to join the session
        // ------------------------------------------------------
        if ((action == 'join') & (!si.sessionInitiated)) {
            [ allowed, allSessions ] = joinPlayerSession( allSessions , thisPlayer ); 
        }

        // ------------------------------------------------------
        //    Attempt to change the focus
        // ------------------------------------------------------
        if (((action == 'focus') || (action == 'blur')) && (allSessions !== null)) {
            [ allowed , allSessions ] = determineControlSession( allSessions, thisPlayer, action );    
        }

        if (allowed) {
            return allSessions;
        } else {
            return undefined;
        }
    }, {
        // Ensure that event listeners are not triggered for intermediate states
        applyLocally: false
    }).then(result => {
        let newState = result.snapshot.val();
        if (!result.committed) {
            myconsolelog(`Transaction failed for action=${action} and player=${thisPlayer}`);
        } else {
            if ((sessionConfig.recordData) && (action == 'join') ) {
                // Recording data for player joining
                  
                // Get a database reference to the player we are updating  
                let recordPlayerRef = ref(db, `${studyId}/recordedData/${si.sessionId}/players/${thisPlayer}/`);        
                let playerInfo = newState[si.sessionId].allPlayersEver[thisPlayer];              
                update(recordPlayerRef, playerInfo);
            } 
        }

        let returnResult = {
            isSuccess: result.committed, action: action, sessionsState: newState,
            player: thisPlayer, initiatingPlayer: si.playerId, timestamp: serverTimestamp()
        };

        return returnResult;

    }).catch(error => {
        myconsolelog("Transaction failed with error: ", error);
    });
}


function removePlayerSession( allSessions , thisPlayer, finishStatus ) {
    let allowed = true;
    if (allSessions !== null) {
        // Find the session associated with this player
        let sessionIdThis = getSessionByPlayerId(allSessions, thisPlayer);
        if (sessionIdThis === null) {
            // Player could not be find, so cannot be deleted from state
            allowed = false;
        } else {
            // Delete this player from the session
            delete allSessions[sessionIdThis].players[thisPlayer];

            // Add time-stamp when player left
            allSessions[sessionIdThis].allPlayersEver[thisPlayer].leftGameAt = serverTimestamp();

            // Add information on how the player was removed. There are three ways:
            // 1) 'normal': the client called the "leaveSession()" function 
            // 2) 'abnormal': the client closed a window (or refreshed the window)
            // 3) 'abnormal': this client removed a player associated with ANOTHER client because they were disconnected
            allSessions[sessionIdThis].allPlayersEver[thisPlayer].finishStatus = finishStatus;

            let session = allSessions[sessionIdThis];
            let estimatedServerTime = Date.now() + serverTimeOffset;
            let sessionStartTime = (session.sessionStartedAt == 0) ? estimatedServerTime : session.sessionStartedAt;
            let hoursElapsed = (estimatedServerTime - sessionStartTime) / (1000 * 60 * 60);

            // If no players left, delete the session
            let numP = Object.keys(allSessions[sessionIdThis].players).length;
            if (numP == 0) {
                // this will produce a null outcome for this session which then be deleted if transaction is successful
                delete allSessions[sessionIdThis];

            } else if ((sessionConfig.allowReplacements) && ((sessionConfig.maxHoursSession === 0) || (hoursElapsed < sessionConfig.maxHoursSession))) {
                // If replacemens are allowed for session and there is time remaining to add players ....
                // Check if we can move a waiting person to move into a session where other players are waiting
                //let sessions = allSessions;
                let sortedSessionKeys = sortSessions(allSessions);

                for (let i = 0; i < sortedSessionKeys.length; i++) {
                    let sessionIdOther = sortedSessionKeys[i];
                    let sessionOther = allSessions[sessionIdOther];
                    let playersOther = Object.keys(sessionOther.players || {});
                    let numPlayersOther = playersOther.length;
                    let statusOther = sessionOther.status;
                    if ((sessionIdOther !== sessionIdThis) && (numPlayersOther > 0) && (statusOther == 'waiting')) {
                        // Pick the first player in this other session that is still waiting
                        //let playerIdOther = playersOther[0];

                        // Pick the player who has been waiting the longest
                        let sortedPlayerIds = sortPlayersTime(sessionOther.players);
                        let playerIdOther = sortedPlayerIds[0];

                        // Copy over the data (FIX THIS !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!)
                        //let playerData1 = { waitingRoomStartedAt: sessionOther.players[playerIdOther].waitingRoomStartedAt, sessionStartedAt: 0 };
                        let playerData1 = { ...sessionOther.players[playerIdOther] };
                        
                        // Delete player from the session it is associated with
                        delete sessionOther.players[playerIdOther];
                        delete sessionOther.allPlayersEver[playerIdOther];

                        numPlayersOther = numPlayersOther - 1;
                        if (numPlayersOther == 0) {
                            // There are no more players in this session, so delete session
                            delete allSessions[sessionIdOther];
                        }

                        // move player data over 
                        let getTimeNow = serverTimestamp();
                        allSessions[sessionIdThis].numPlayersEverJoined += 1;
                        playerData1.arrivalIndex = allSessions[sessionIdThis].numPlayersEverJoined;
                        playerData1.sessionStartedAt = getTimeNow;
                        
                        allSessions[sessionIdThis].players[playerIdOther] = playerData1;
                        allSessions[sessionIdThis].allPlayersEver[playerIdOther] = playerData1;

                        // What is the new status of the session (where we moved the player to)?
                        numP = numP + 1;
                        if (numP >= sessionConfig.minPlayersNeeded) {
                            // Does this turn the session into active?
                            if (allSessions[sessionIdThis].status == 'waiting') {
                                allSessions[sessionIdThis].status = "active";

                                // Assign the start time for each player
                                let players = allSessions[sessionIdThis].players;
                                Object.keys(players).forEach(function (key) {
                                    let getTimeNow = serverTimestamp();
                                    players[key].sessionStartedAt = getTimeNow;
                                    allSessions[sessionIdThis].allPlayersEver[key].sessionStartedAt = getTimeNow;
                                });

                                // Set the start time for the session
                                allSessions[sessionIdThis].sessionStartedAt = serverTimestamp();
                            } 
                        }

                        break;
                    }
                }

                // Determine who should have control....
                //let session = allSessions[sessionIdThis];
                let sortedPlayersIds = sortPlayersStatus(session.players);
                let playerControl = sortedPlayersIds[0];
                allSessions[sessionIdThis].playerControl = playerControl;
            }
        }
    }

    return [ allowed , allSessions ];
}

function joinPlayerSession(  allSessions , thisPlayer ) {
    let allowed = true;
    let proposedSessionId;
    let joined = false; // a local variable (not to be confused with si.sessionInitiated)
    //let sessions = allSessions;
    //let sortedSessionKeys = sortSessions(sessions);
    let sortedSessionKeys = sortSessions(allSessions);

    // Try to join an existing session
    for (let i = 0; i < sortedSessionKeys.length; i++) {
        //let session = sessions[sortedSessionKeys[i]];
        let session = allSessions[sortedSessionKeys[i]];
        let estimatedServerTime = Date.now() + serverTimeOffset;
        let sessionStartTime = (session.sessionStartedAt == 0) ? estimatedServerTime : session.sessionStartedAt;
        let hoursElapsed = (estimatedServerTime - sessionStartTime) / (1000 * 60 * 60);

        // Check if the maximum hours limit has not been exceeded
        if ((sessionConfig.maxHoursSession === 0) || (hoursElapsed < sessionConfig.maxHoursSession)) {
            let numP = Object.keys(session.players || {}).length;
            if (numP < sessionConfig.maxPlayersNeeded) {
                proposedSessionId = sortedSessionKeys[i];
                //let thisSession = allSessions[proposedSessionId];

                // Count total number of players who have ever joined
                let count = allSessions[proposedSessionId].numPlayersEverJoined;
                count = count + 1;
                allSessions[proposedSessionId].numPlayersEverJoined = count;

                // Create player status
                let playerData1 = {
                    waitingRoomStartedAt: serverTimestamp(), 
                    timeElapsedToWaitingRoom: new Date() - startTime,
                    sessionStartedAt: 0, 
                    status: focusStatus, 
                    numBlurred: 0,
                    arrivalIndex: count,
                    leftGameAt: 0,
                    finishStatus: 'na',
                    urlparams: getUrlParameters()
                };
                allSessions[proposedSessionId].players[thisPlayer] = playerData1;
                allSessions[proposedSessionId].allPlayersEver[thisPlayer] = playerData1;
                joined = true;

                // Do we have quorum to start the session?
                numP = numP + 1;
                if (numP >= sessionConfig.minPlayersNeeded) {
                    // Does this turn the session into active?
                    if (allSessions[proposedSessionId].status == 'waiting') {
                        allSessions[proposedSessionId].status = "active";

                        // Assign the start time for each player in the current session
                        let players = allSessions[proposedSessionId].players;
                        Object.keys(players).forEach(function (key) {
                            let getTimeNow = serverTimestamp();
                            players[key].sessionStartedAt = getTimeNow;
                            allSessions[proposedSessionId].allPlayersEver[key].sessionStartedAt = getTimeNow;
                        });

                        // Set the start time for the session
                        allSessions[proposedSessionId].sessionStartedAt = serverTimestamp();
                    } else {
                        // Just assign the start time for this player
                        let getTimeNow = serverTimestamp();
                        allSessions[proposedSessionId].players[thisPlayer].sessionStartedAt = getTimeNow;
                        allSessions[proposedSessionId].allPlayersEver[thisPlayer].sessionStartedAt = getTimeNow;
                    }
                }

                // Determine who should have control....
                let sortedPlayersIds = sortPlayersStatus(session.players);
                let playerControl = sortedPlayersIds[0];
                allSessions[proposedSessionId].playerControl = playerControl;

                break;
            }
        }
    }

    // Create a new session if there was no room in existing sessions and we haven't reached the maximum parallel sessions
    if (!joined) {
        let numSessions = sortedSessionKeys.length;
        if ((sessionConfig.maxParallelSessions == 0) || (numSessions < sessionConfig.maxParallelSessions)) {
            let newSessionRef = push(sessionsRef);
            proposedSessionId = newSessionRef.key;
            //let thisSession = allSessions[proposedSessionId];
            
            let timeElapsedToWaitingRoom = new Date() - startTime;

            let playerData1 = {
                waitingRoomStartedAt: serverTimestamp(),
                timeElapsedToWaitingRoom, 
                sessionStartedAt: 0, 
                status: focusStatus, 
                numBlurred: 0,
                arrivalIndex: 1,
                leftGameAt: 0,
                finishStatus: 'na',
                urlparams: getUrlParameters()
            };
            let playerData2 = { [thisPlayer]: playerData1 };
            let saveData = {
                players: playerData2, 
                allPlayersEver: playerData2, 
                status: "waiting",
                waitingRoomStartedAt: serverTimestamp(),
                timeElapsedToWaitingRoom,  
                sessionStartedAt: 0, 
                sessionIndex: numSessions + 1,
                numPlayersEverJoined: 1
            };

            if (allSessions === null) {
                allSessions = { [proposedSessionId]: saveData };
            } else {
                allSessions[proposedSessionId] = saveData;
            }

            // Can we get started with one player?
            let numP = 1;
            if (numP >= sessionConfig.minPlayersNeeded) {
                allSessions[proposedSessionId].status = "active";
                // Assign the start time for each player
                let players = allSessions[proposedSessionId].players;
                Object.keys(players).forEach(function (key) {
                    let getTimeNow = serverTimestamp();
                    players[key].sessionStartedAt = getTimeNow;
                    allSessions[proposedSessionId].allPlayersEver[key].sessionStartedAt = getTimeNow;
                });

                // Set the start time for the session
                allSessions[proposedSessionId].sessionStartedAt = serverTimestamp();
            }

            // Set control
            allSessions[proposedSessionId].playerControl = thisPlayer;


        } else {
            allowed = false;
        }
    }

    return [ allowed, allSessions ];
}

function determineControlSession(  allSessions , thisPlayer, action ) {
    let allowed = true;

    // Find the session associated with this player
    let sessionIdThis = getSessionByPlayerId(allSessions, thisPlayer);
    if (sessionIdThis === null) {
        // Player could not be found, so cannot change focus state
        allowed = false;
    } else {
        allSessions[sessionIdThis].players[thisPlayer].status = action;

        if (action == 'blur') {
            allSessions[sessionIdThis].players[thisPlayer].numBlurred++;
        }

        // Determine who should have control....
        let session = allSessions[sessionIdThis];
        let sortedPlayersIds = sortPlayersStatus(session.players);
        let playerControl = sortedPlayersIds[0];
        allSessions[sessionIdThis].playerControl = playerControl;
    }

    return [ allowed , allSessions ];
}

// Sort sessions by session index such that sessions with lower indices are always given preference
function sortSessions(sessions) {
    let sessionKeys = Object.keys(sessions || {});
    sessionKeys.sort((a, b) => {
        let indexA = sessions[a].sessionIndex;
        let indexB = sessions[b].sessionIndex;
        return indexA - indexB;
    });
    return sessionKeys;
}

// Sort players in descending order of waiting time
function sortPlayersTime(players) {
    let playerKeys = Object.keys(players || {});
    playerKeys.sort((a, b) => {
        let timeA = players[a].waitingRoomStartedAt;
        let timeB = players[b].waitingRoomStartedAt;
        return timeA - timeB;
    });
    return playerKeys;
}

// Sort players by status
function sortPlayersStatus(players) {
    let playerKeys = Object.keys(players || {});
    playerKeys.sort((a, b) => {
        let statusA = players[a].status;
        let statusB = players[b].status;
        if (statusA == statusB) {
            // If status is the same, prefer the player who has lost focus less
            return players[a].numBlurred - players[b].numBlurred;
        } else if (statusA == 'focus' && statusB == 'blur') {
            return -1;
        } else if (statusA == 'blur' && statusB == 'focus') {
            return +1;
        }
    });
    return playerKeys;
}

function getSessionByPlayerId(sessions, playerId) {
    // Iterate over all session keys
    for (let sessionKey in sessions) {
        // Check if the player id exists in the players of this session
        if (sessions[sessionKey].players.hasOwnProperty(playerId)) {
            return sessionKey;
        }
    }

    // If no match is found, return null
    return null;
}

function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

function getUrlParameters() {
    const searchParams = new URLSearchParams(window.location.search);
    const params = {};

    for (const [key, value] of searchParams.entries()) {
        params[key] = value;
    }

    return params;
}

function myconsolelog(message) {
    if (verbosity >= 1) {
        console.log(message);
    }
}

function isEdgeBrowser() {
    const userAgent = window.navigator.userAgent;
    return /Edge\/\d+|Edg\/\d+/.test(userAgent);
}