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
    initializeMPLIB,
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
const studyId = 'skeleton'; 

// Configuration setting for the session
const sessionConfig = {
    minPlayersNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 3, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: true, // Allow replacing any players who leave an ongoing session?
    exitDelayWaitingRoom: 0, // Number of countdown seconds before leaving waiting room (if zero, player leaves waiting room immediately)
    maxDurationBelowMinPlayersNeeded: 10, // Number of seconds to continue an active session even though there are fewer than the minimum number of players (if set to zero, session terminates immediately)
    maxHoursSession: 0, // Maximum hours where additional players are still allowed to be added to session (if zero, there is no time limit)
    recordData: false // Record all data?  
};
const verbosity = 2;

// Allow URL parameters to update these default parameters
updateConfigFromUrl( sessionConfig );

// List names of the callback functions that are used in this code (so MPLIB knows which functions to trigger)
let funList = { 
    sessionChangeFunction: sessionChange,
    receiveStateChangeFunction: receiveStateChange,
    evaluateUpdateFunction: evaluateUpdate
  };

// Set the session parameters for MPLIB
initializeMPLIB( sessionConfig , studyId , funList, verbosity );


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
function receiveStateChange(nodeName, newState, typeChange ) {
    // typeChange can be the following:
    //  'onChildChanged'
    //  'onChildAdded'
    //  'onChildRemoved'

}

// Function triggered by a call to "updateStateTransaction" to evaluate if the proposed action is valid
// If "updateStateTransaction" is not called, and all updates are done through "updateStateDirect", there is no 
// need for this function
function evaluateUpdate( path, state, action, actionArgs ) {
    let isAllowed = false;
    let newState = null;

    // .... insert your code to update isAllowed and newState

    let evaluationResult = { isAllowed, newState };
    return evaluationResult;
}

// --------------------------------------------------------------------------------------
//   Handle any change in session relating to the waiting room or ongoing session 
//   (note: all timestamps are server-side expressed in milliseconds since the Unix Epoch)
// --------------------------------------------------------------------------------------

// This callback function is triggered when a waiting room starts
function sessionChange(sessionInfo, typeChange) {
   // typeChange can be the following
   // 'joinedWaitingRoom'
   // 'updateWaitingRoom'
   // 'startSession'
   // 'updateOngoingSession'
   // 'endSession'

   let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
   let numPlayers = sessionInfo.numPlayers;
   let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
   messageWaitingRoom.innerText = str2;

   if (typeChange === 'joinedWaitingRoom') {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'block';
   }

   if (typeChange === 'updateWaitingRoom') {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'block';
        if (sessionInfo.status === 'waitingRoomCountdown') {
            str2 = `Game will start in ${ sessionInfo.countdown } seconds...`;
            messageWaitingRoom.innerText = str2;
        }
   }

   if (typeChange === 'startSession') {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'none';
        gameScreen.style.display = 'block';

        let dateString = timeStr(sessionInfo.sessionStartedAt);
        let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
        myconsolelog( str );

        let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
        messageGame.innerHTML = str2;
   }

   if (typeChange === 'updateOngoingSession') {
        let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
        messageGame.innerHTML = str2;
   }

   if (typeChange === 'endSession') {
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
}


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