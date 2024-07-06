/* ---------------------------------------------------------- 
      Firebase MultiPlayer Library v. 1.30
   ----------------------------------------------------------
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-auth.js"; // "./firebase/firebase-auth.js"; 
import {
    getDatabase, ref, onValue, get, set, update, off,
    push, onChildAdded, onChildChanged,
    onChildRemoved, remove, serverTimestamp,
    query, orderByChild, equalTo, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js"; //"./firebase/firebase-database.js";  //;

export let hasControl = false; // variable exposed to the client code 

// Initialize the session information that the client will see
let si = {
    status: '',
    numPlayers: 0, 
    playerId: null,
    playerIds: [], 
    sessionId: null, 
    sessionIndex: null, 
    arrivalIndex: null, 
    arrivalIndices: [],
    waitingRoomStartedAt: null, 
    countdown: null,
    sessionStartedAt: null,
    sessionErrorCode: 0,
    sessionErrorMsg: '',
    sessionInitiated: false,
    sessionStarted: false
};

let sessionConfig;
let studyId;
let verbosity;
let stateRef;
let presenceRef, connectedRef;
let sessionsRef, recordEventsRef, recordPlayerRef;
let offsetRef;
let serverTimeOffset = 0; // default
let numPlayersBefore = 0;
let focusStatus = 'focus';
let playerControlBefore = '';
let intervalId; // interval timer for the waiting room countdown;

let callback_sessionChange;
let callback_receiveStateChange;
let callback_evaluateUpdate;

// Initialize App
const firebaseApp = initializeApp(firebasempConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);


//------------------------------------------------------
// Define some new functions we can use in other code
//------------------------------------------------------

// Initialize the session parameters, name of the study, and list of functions that are used for the callbacks
export function initializeMPLIB( sessionConfigNow , studyIdNow , funList, verbosityNow ) {
    sessionConfig = sessionConfigNow; // session parameters
    studyId = studyIdNow; // name of the study that is used as the root node in firebase
    verbosity = verbosityNow; // verbosity = 0: no messages to console; 1: write messages to the console 

    // List of callback functions that MPLIB can use when session or state changes
    callback_sessionChange = funList.sessionChangeFunction;
    callback_receiveStateChange = funList.receiveStateChangeFunction;
    callback_evaluateUpdate = funList.evaluateUpdateFunction;


    // Create a random id for the player; this id is across browser windows on the same client  
    // this facilitates testing of code on the same computer across different browser windows
    si.playerId = generateId();
    myconsolelog("Player id=" + si.playerId);

    initializeFirebaseListeners();
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

    // Remove *other* clients who are disconnecting
    onChildAdded(ref(db, `${studyId}/presence/`), (snapshot) => {
        let thisPlayer = snapshot.key;
        sessionUpdate('remove', thisPlayer).then(result => {
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

function triggerSessionCallback( session , sessionId ) {
    // Process the information in "session" and trigger the appropriate callbacks on the client 

    let currentStatus = session.status; // either 'waiting' or 'active'
    si.numPlayers = Object.keys(session.players).length;
    si.playerIds = Object.keys( session.players );
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
        si.waitingRoomStartedAt = session.waitingRoomStartedAt - serverTimeOffset;
        recordSessionEvent( si );
        // trigger callback 
        callback_sessionChange(si, 'joinedWaitingRoom' );                                   
    } else if ((currentStatus == 'active') & (!si.sessionStarted)) {
        si.sessionInitiated = true;
        si.sessionStarted = true;
        si.sessionId = sessionId;
        si.sessionIndex = session.sessionIndex;
        si.arrivalIndex = session.players[si.playerId].arrivalIndex;
        numPlayersBefore = si.numPlayers;
        si.sessionStartedAt = session.sessionStartedAt - serverTimeOffset;
        

        if (sessionConfig.exitDelayWaitingRoom==0) {
            si.status = 'sessionStarted';
            recordSessionEvent( si );
            startSession(); // Can start the session without delay
        } else {
            // Delay the start of entering the session
            let remainingSeconds = sessionConfig.exitDelayWaitingRoom;

            intervalId = setInterval(() => {
                if (remainingSeconds > 0) {
                    si.status = 'waitingRoomCountdown';
                    si.countdown = remainingSeconds;
                    callback_sessionChange( si , 'updateWaitingRoom' );
                    remainingSeconds--;
                } else {
                    clearInterval(intervalId); 
                    si.status = 'sessionStarted';
                    recordSessionEvent( si );
                    startSession();
                }
            }, 1000);
        }
        
    } else if (si.numPlayers !== numPlayersBefore) {
        numPlayersBefore = si.numPlayers;
        if (currentStatus == 'waiting') {
            si.waitingRoomStartedAt = session.waitingRoomStartedAt - serverTimeOffset;
            recordSessionEvent( si );
            callback_sessionChange( si , 'updateWaitingRoom' );
        }
        if (currentStatus == 'active') {
            si.sessionStartedAt = session.sessionStartedAt - serverTimeOffset;
            if (si.status == 'waitingRoomCountdown') {
                // Case where a waiting room countdown has started on this client but another player has left the session during the countdown
                // ...
            } else {
                recordSessionEvent( si );                                        
                callback_sessionChange( si , 'updateOngoingSession' );

                // Check if the number of players is below the minimum
                if (si.numPlayers < sessionConfig.minPlayersNeeded) {
                    // Leave session immediately
                    si.sessionErrorCode = 3;
                    si.sessionErrorMsg = 'Number of players fell below minimum needed';
                    recordSessionEvent( si );
                    leaveSession();
                    
                }                                         
            }
            
        }
    }

    // Does this player have control?
    hasControl = (session.playerControl == si.playerId);

    if (session.playerControl !== playerControlBefore) {
        if (!hasControl) {
            //mpg.losesControl();
        } else {
            //mpg.gainedControl();
        }
        playerControlBefore = session.playerControl;
    }

}


// Function for player wanting to join a session
export function joinSession() {
    sessionUpdate('join', si.playerId).then(result => {
        if (!result.isSuccess) {
            // Trigger function when session (active or waiting-room) could not be started
            si.sessionErrorCode = 1;
            si.sessionErrorMsg = 'Unable to join session';
            callback_sessionChange( si , 'endSession' );
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
                    si.sessionInitiated = false;
                    si.sessionStarted = false;
                    si.sessionId = undefined;
                    si.sessionIndex = undefined;
                    hasControl = false;

                    si.sessionErrorCode = 2;
                    si.sessionErrorMsg = 'Session Disconnected';
                    callback_sessionChange( si , 'endSession' );
                }
            });
        }
    });
}

// Function for player leaving a session
export async function leaveSession() {
    // Run a transaction to remove this player
    sessionUpdate('remove', si.playerId).then(result => {
        // If this transaction is successful...
        si.sessionStarted = false;
        si.sessionInitiated = false;
        si.sessionId = undefined;
        si.sessionIndex = undefined;
        si.status = 'leaveSession';
        playerControlBefore = '';
        hasControl = false;

        // Remove the disconnect listener....
        off(presenceRef);
        off(connectedRef);

        // remove the listener for game state
        off(stateRef);
    });

    
    callback_sessionChange( si , 'endSession' );
}

// Function to start an active session (e.g. coming out of a waiting room, or when a single player can start a session)
function startSession() {
    // Create a path to store the game state
    stateRef = ref(db, `${studyId}/states/${si.sessionId}/`);

    // Create a path to store all recorded events related to state changes 
    recordEventsRef = ref(db, `${studyId}/recordedData/${si.sessionId}/events/`);

    // Create a path to store all recorded player level information
    recordPlayerRef = ref(db, `${studyId}/recordedData/${si.sessionId}/players/${si.playerId}/`);
    recordPlayerData( 'urlparams', getUrlParameters() );
    recordPlayerData( 'sessionInfo' , si );

    
    // Create a listener for changes in the state 
    onChildChanged(stateRef, (snapshot) => {
        const nodeName = snapshot.key;
        const state = snapshot.val();
        if (state != null) {
            // execute this function in the client game code 
            callback_receiveStateChange(nodeName, state, 'onChildChanged');
        }
    });


    // Create a listener for additions to the gamestate
    onChildAdded(stateRef, (snapshot) => {
        const nodeName = snapshot.key;
        const state = snapshot.val();
        if (state != null) {
            // execute this function in the client game code 
            callback_receiveStateChange(nodeName, state, 'onChildAdded');
        }
    });

    // Create a listener for additions to the gamestate
    onChildRemoved(stateRef, (snapshot) => {
        const nodeName = snapshot.key;
        const state = snapshot.val();
        if (state != null) {
            // execute this function in the client game code 
            callback_receiveStateChange(nodeName, state, 'onChildRemoved');
        }
    });

    // Invoke function at client
    callback_sessionChange( si , 'startSession' );
}

// Handle event of player closing browser window
window.addEventListener('beforeunload', function (event) {
    if (si.sessionInitiated) {
        // Only remove this player when the session started
        sessionUpdate('remove', si.playerId);
        //mpg.removePlayerGameState(si.playerId);
    }
});

// When a client's browser comes into focus, it becomes eligible for object control
window.addEventListener('focus', function () {
    focusStatus = 'focus';
    if (si.sessionInitiated) {
        myconsolelog('Player is in focus');
        sessionUpdate('focus', si.playerId);
    }
});

// When a client's browser is out of focus, it becomes ineligible for object control
window.addEventListener('blur', function () {
    focusStatus = 'blur';
    if (si.sessionInitiated) {
        myconsolelog('Player has lost focus');
        sessionUpdate('blur', si.playerId);
    }
});

// This function allows for direct changes to a gamestate without checking for conflicts
// Use these updates to speed up games with continuous movements where players' movements do
// not conflict with each other
export function updateStateDirect(path, newState, optionalParamSkipRecord = false ) {
    let refNow = ref(db, `${studyId}/states/${si.sessionId}/${path}`);
    if (newState == null) {
        // If the proposed state is null, use that to remove the node (so we can clean up the gamestate for players who leave the game)
        remove(refNow).then( () => { recordEventData( path, newState, optionalParamSkipRecord )});
    } else {
        // Note that with the firebase update function, it only changes the fields indicated in newState and leaves all other fields intact
        if (typeof newState === 'object') {
            update(refNow, newState).then( () => { recordEventData( path, newState, optionalParamSkipRecord )});;
        } else {
            set(refNow, newState).then( () => { recordEventData( path, newState, optionalParamSkipRecord )});;
        }
    }
}

function recordEventData(path, state, skipRecord ) {
    // Are we recording the data?
    if ((sessionConfig.recordData) && (!skipRecord)) {
        let returnResult = {
            s: state,
            t: serverTimestamp(),
            pId: si.playerId,
            p: path,
        };
        
        let newDataRef = push(recordEventsRef);
        set(newDataRef, returnResult);
    } 
}

function recordSessionEvent( si ) {
    // Are we recording the data?
    if (sessionConfig.recordData) {
        // Create a path to store all recorded gamestates   
        let recordSessionRef = ref(db, `${studyId}/recordedData/${si.sessionId}/session/`);

        let returnResult = {
            sessionInfo: si,
            serverTimeStamp: serverTimestamp(),
        };
        
        let newDataRef = push(recordSessionRef);
        set(newDataRef, returnResult);
    } 
}

function recordPlayerData( field, value ) {
    // Are we recording the data?
    if (sessionConfig.recordData) {
        let returnResult = {
            [field]: value,
        };    
        //let newDataRef = push(recordPlayerRef);
        update(recordPlayerRef, returnResult);
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
async function sessionUpdate(action, thisPlayer) {

    let proposedSessionId;
    return runTransaction(sessionsRef, (currentState) => {
        let allowed = false;

        if (action == 'remove') {
            allowed = true;
            if (currentState !== null) {

                // Find the session associated with this player
                let sessionIdThis = getSessionByPlayerId(currentState, thisPlayer);
                if (sessionIdThis === null) {
                    // Player could not be find, so cannot be deleted from state
                    allowed = false;
                } else {
                    delete currentState[sessionIdThis].players[thisPlayer];

                    let session = currentState[sessionIdThis];
                    let estimatedServerTime = Date.now() + serverTimeOffset;
                    let sessionStartTime = (session.sessionStartedAt == 0) ? estimatedServerTime : session.sessionStartedAt;
                    let hoursElapsed = (estimatedServerTime - sessionStartTime) / (1000 * 60 * 60);

                    // If no players left, delete the session
                    let numP = Object.keys(currentState[sessionIdThis].players).length;
                    if (numP == 0) {
                        delete currentState[sessionIdThis];

                        
                        off(stateRef); // remove the listener for game state
                        remove( stateRef ); // delete the state

                    } else if ((sessionConfig.allowReplacements) && ((sessionConfig.maxHoursSession === 0) || (hoursElapsed < sessionConfig.maxHoursSession))) {
                        // If replacemens are allowed for session and there is time remaining to add players ....
                        // Check if we can move a waiting person to move into this session.....
                        let sessions = currentState;
                        let sortedSessionKeys = sortSessions(sessions);

                        for (let i = 0; i < sortedSessionKeys.length; i++) {
                            let sessionIdOther = sortedSessionKeys[i];
                            let sessionOther = sessions[sessionIdOther];
                            let playersOther = Object.keys(sessionOther.players || {});
                            let numPlayersOther = playersOther.length;
                            let statusOther = sessionOther.status;
                            if ((sessionIdOther !== sessionIdThis) && (numPlayersOther > 0) && (statusOther == 'waiting')) {
                                // Pick the first player in this other session that is still waiting
                                //let playerIdOther = playersOther[0];

                                // Pick the player who has been waiting the longest
                                let sortedPlayerIds = sortPlayersTime(sessionOther.players);
                                let playerIdOther = sortedPlayerIds[0];

                                // Copy over the data
                                let playerData1 = { joinedWaitingRoomAt: sessionOther.players[playerIdOther].joinedWaitingRoomAt, joinedGameAt: 0 };

                                // Delete player from the session it is associated with
                                delete sessionOther.players[playerIdOther];

                                numPlayersOther = numPlayersOther - 1;
                                if (numPlayersOther == 0) {
                                    // There are no more players in this session, so delete session
                                    delete currentState[sessionIdOther];
                                }

                                // move player data over                           
                                currentState[sessionIdThis].players[playerIdOther] = playerData1;

                                // What is the new status of the session (where we moved the player to)?
                                numP = numP + 1;
                                if (numP >= sessionConfig.minPlayersNeeded) {
                                    // Does this turn the session into active?
                                    if (currentState[sessionIdThis].status == 'waiting') {
                                        currentState[sessionIdThis].status = "active";

                                        // Assign the start time for each player
                                        let players = currentState[sessionIdThis].players;
                                        Object.keys(players).forEach(function (key) {
                                            players[key].joinedGameAt = serverTimestamp();
                                        });

                                        // Set the start time for the session
                                        currentState[sessionIdThis].sessionStartedAt = serverTimestamp();
                                    } else {
                                        // Just assign the start time for this player
                                        currentState[sessionIdThis].players[playerIdOther].joinedGameAt = serverTimestamp();
                                    }
                                }

                                break;
                            }
                        }

                        // Determine who should have control....
                        //let session = currentState[sessionIdThis];
                        let sortedPlayersIds = sortPlayersStatus(session.players);
                        let playerControl = sortedPlayersIds[0];
                        currentState[sessionIdThis].playerControl = playerControl;
                    }
                }
            }
        }

        if ((action == 'join') & (!si.sessionInitiated)) {
            allowed = true;
            let joined = false; // a local variable (not to be confused with si.sessionInitiated)
            let sessions = currentState;
            let sortedSessionKeys = sortSessions(sessions);

            // Try to join an existing session
            for (let i = 0; i < sortedSessionKeys.length; i++) {
                let session = sessions[sortedSessionKeys[i]];
                let estimatedServerTime = Date.now() + serverTimeOffset;
                let sessionStartTime = (session.sessionStartedAt == 0) ? estimatedServerTime : session.sessionStartedAt;
                let hoursElapsed = (estimatedServerTime - sessionStartTime) / (1000 * 60 * 60);

                // Check if the maximum hours limit has not been exceeded
                if ((sessionConfig.maxHoursSession === 0) || (hoursElapsed < sessionConfig.maxHoursSession)) {
                    let numP = Object.keys(session.players || {}).length;
                    if (numP < sessionConfig.maxPlayersNeeded) {
                        proposedSessionId = sortedSessionKeys[i];

                        // Count total number of players who have ever joined
                        let count = currentState[proposedSessionId].numPlayersEverJoined;
                        count = count + 1;
                        currentState[proposedSessionId].numPlayersEverJoined = count;

                        // Create player status
                        let playerData1 = {
                            joinedWaitingRoomAt: serverTimestamp(), joinedGameAt: 0, status: focusStatus, numBlurred: 0,
                            arrivalIndex: count
                        };
                        currentState[proposedSessionId].players[thisPlayer] = playerData1;
                        joined = true;

                        // Do we have quorum to start the session?
                        numP = numP + 1;
                        if (numP >= sessionConfig.minPlayersNeeded) {
                            // Does this turn the session into active?
                            if (currentState[proposedSessionId].status == 'waiting') {
                                currentState[proposedSessionId].status = "active";

                                // Assign the start time for each player
                                let players = currentState[proposedSessionId].players;
                                Object.keys(players).forEach(function (key) {
                                    players[key].joinedGameAt = serverTimestamp();
                                });

                                // Set the start time for the session
                                currentState[proposedSessionId].sessionStartedAt = serverTimestamp();
                            } else {
                                // Just assign the start time for this player
                                currentState[proposedSessionId].players[thisPlayer].joinedGameAt = serverTimestamp();
                            }
                        }

                        // Determine who should have control....
                        let sortedPlayersIds = sortPlayersStatus(session.players);
                        let playerControl = sortedPlayersIds[0];
                        currentState[proposedSessionId].playerControl = playerControl;

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
                    let playerData1 = {
                        joinedWaitingRoomAt: serverTimestamp(), joinedGameAt: 0, status: focusStatus, numBlurred: 0,
                        arrivalIndex: 1
                    };
                    let playerData2 = { [thisPlayer]: playerData1 };
                    let saveData = {
                        players: playerData2, status: "waiting",
                        waitingRoomStartedAt: serverTimestamp(), sessionStartedAt: 0, sessionIndex: numSessions + 1,
                        numPlayersEverJoined: 1
                    };

                    if (currentState === null) {
                        currentState = { [proposedSessionId]: saveData };
                    } else {
                        currentState[proposedSessionId] = saveData;
                    }

                    // Can we get started with one player?
                    let numP = 1;
                    if (numP >= sessionConfig.minPlayersNeeded) {
                        currentState[proposedSessionId].status = "active";
                        // Assign the start time for each player
                        let players = currentState[proposedSessionId].players;
                        Object.keys(players).forEach(function (key) {
                            players[key].joinedGameAt = serverTimestamp();
                        });

                        // Set the start time for the session
                        currentState[proposedSessionId].sessionStartedAt = serverTimestamp();
                    }

                    // Set control
                    currentState[proposedSessionId].playerControl = thisPlayer;


                } else {
                    allowed = false;
                }
            }
        }

        if (((action == 'focus') || (action == 'blur')) && (currentState !== null)) {
            allowed = true;

            // Find the session associated with this player
            let sessionIdThis = getSessionByPlayerId(currentState, thisPlayer);
            if (sessionIdThis === null) {
                // Player could not be found, so cannot change focus state
                allowed = false;
            } else {
                currentState[sessionIdThis].players[thisPlayer].status = action;

                if (action == 'blur') {
                    currentState[sessionIdThis].players[thisPlayer].numBlurred++;
                }

                // Determine who should have control....
                let session = currentState[sessionIdThis];
                let sortedPlayersIds = sortPlayersStatus(session.players);
                let playerControl = sortedPlayersIds[0];
                currentState[sessionIdThis].playerControl = playerControl;
            }
        }

        if (allowed) {
            return currentState;
        } else {
            return undefined;
        }
    }, {
        // Ensure that event listeners are not triggered for intermediate states
        applyLocally: false
    }).then(result => {
        let newState = result.snapshot.val();
        if (!result.committed) {
            myconsolelog('Transaction failed');
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
        let timeA = players[a].joinedWaitingRoomAt;
        let timeB = players[b].joinedWaitingRoomAt;
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

