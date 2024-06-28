// --------------------------------------------------------------------------------------
//    Skeleton code to demonstrate how MPLIB can be used to program a waiting room
//    and a game room (without any game). Both the waiting and game room display
//    the number of players currently waiting or playing 
// --------------------------------------------------------------------------------------


// -------------------------------------
// Importing functions and variables from 
// the Firebase MultiPlayer library
// -------------------------------------
import {
    joinSession,
    leaveSession,
    updateStateDirect,
    updateStateTransaction,  
    hasControl
} from "/mplib/src/mplib.js";


// -------------------------------------
//       Session configuration
// -------------------------------------
// studyId is the name of the root node we create in the realtime database
export const studyId = 'testmplib'; 

// Configuration setting for the session
export const sessionConfig = {
    minPlayersNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 3, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: true, // Allow replacing any players who leave an ongoing session?
    exitDelayWaitingRoom: 0, // Number of countdown seconds before leaving waiting room (if zero, player leaves waiting room immediately)
    maxDurationBelowMinPlayersNeeded: 10, // Number of seconds to continue an active session even though there are fewer than the minimum number of players (if set to zero, session terminates immediately)
    maxHoursSession: 0, // Maximum hours where additional players are still allowed to be added to session (if zero, there is no time limit)
    recordData: false // Record all data?  
};
export const verbosity = 2;

// Allow URL parameters to update these default parameters
updateConfigFromUrl( sessionConfig );

// -------------------------------------
//       Globals
// -------------------------------------


// -------------------------------------
//       Graphics handles
// -------------------------------------
let instructionsScreen = document.getElementById('instructionsScreen');
let waitingRoomScreen = document.getElementById('waitingRoomScreen');
let gameScreen = document.getElementById('gameScreen');
let messageWaitingRoom = document.getElementById('messageWaitingRoom');
let messageGame = document.getElementById('messageGame');
let messageFinish = document.getElementById('messageFinish');

// -------------------------------------
//       Event Listeners
// -------------------------------------
// Buttons
let joinButton = document.getElementById('joinBtn');
let leaveButton = document.getElementById('leaveBtn');

// Add event listeners to the buttons
joinButton.addEventListener('click', function () {
    joinSession(); // call the library function to attempt to join a session, this results either in starting a session directly or starting a waiting room
});

leaveButton.addEventListener('click', function () {
    leaveSession(); // call the library function to leave a session. This then triggers the local function endSession
});

// --------------------------------------------------------------------------------------
//   Handle state change events triggered by MPLIB
// --------------------------------------------------------------------------------------

// Function to receive state changes from Firebase (broadcast by other players)
export function receiveStateChange(nodeName, newState, typeChange ) {
    // typeChange can be the following:
    //  'onChildChanged'
    //  'onChildAdded'
    //  'onChildRemoved'

}

// Function triggered by a call to "updateStateTransaction" to evaluate if the proposed action is valid
// If "updateStateTransaction" is not called, and all updates are done through "updateStateDirect", there is no 
// need for this function
export function evaluateUpdate( path, state, action, actionArgs ) {
    let isAllowed = false;
    let newState = null;

    // .... insert your code to update isAllowed and newState

    let evaluationResult = { isAllowed, newState };
    return evaluationResult;
}

// --------------------------------------------------------------------------------------
//   Handle waiting room and session events triggered by MPLIB
//   These callback functions are required, but the contents can be empty and left inconsequential  
//   (note: all timestamps are server-side expressed in milliseconds since the Unix Epoch)
// --------------------------------------------------------------------------------------

// This callback function is triggered when a waiting room starts
export function joinedWaitingRoom(sessionInfo) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';

    let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
    let numPlayers = sessionInfo.numPlayers;
    let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;

    messageWaitingRoom.innerText = str2;
}

// This callback function is triggered when waiting room is still ongoing, but number of players waiting changes
export function updateWaitingRoom(sessionInfo) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';
    let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
    let numPlayers = sessionInfo.numPlayers;
    let str2;
    if (sessionInfo.status == 'waitingRoomCountdown') {
        str2 = `Game will start in ${ sessionInfo.countdown } seconds...`;
    }  else {       
        str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
    } 
    messageWaitingRoom.innerText = str2;
}

// This callback function is triggered when the session starts (when enough players have gathered, or when only a single player is needed)
export function startSession(sessionInfo) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    
    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    messageGame.innerHTML = str2;
}

// This callback function is triggered when session is active, but number of players changes
export function updateSession(sessionInfo) {    
    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    messageGame.innerHTML = str2;
}

export function endSession( sessionInfo ) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    finishScreen.style.display = 'block';

    if (sessionInfo.sessionErrorCode != 0) {
        messageFinish.innerHTML = `<p>Session ended abnormally. Reason: ${sessionInfo.sessionErrorMsg}</p>`;
    } else {
        messageFinish.innerHTML = `<p>You have completed the session.</p>`;
    }
    
}

// This callback function is triggered when this client gains control over dynamic objects
export function gainedControl() {
    myconsolelog('Client gained control');
}

// This  callback function is triggered when this client loses control over dynamic objects
// e.g., when client's browser loses focus
export function losesControl() {
    myconsolelog('Client loses control');
}

// -------------------------------------------------------------------------------------
//       Handle events triggered by MPLIB related to changes in the game state
// -------------------------------------------------------------------------------------


// -------------------------------------
//       Display Information
// -------------------------------------
function myconsolelog(message) {
    if (verbosity > 0) {
        console.log(message);
    }
}


// Converts the server-side timestamp expressed in milliseconds since the Unix Epoch to a string in local time
function timeStr(timestamp) {
    let date = new Date(timestamp);  // JavaScript uses milliseconds

    // Add leading zero to hours, minutes, and seconds if they are less than 10
    let hours = ("0" + date.getHours()).slice(-2);
    let minutes = ("0" + date.getMinutes()).slice(-2);
    let seconds = ("0" + date.getSeconds()).slice(-2);

    let timeString = `${hours}:${minutes}:${seconds}`;
    return timeString;
}

// Takes the URL parameters to update the session configuration
function updateConfigFromUrl( sessionConfig ) {
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