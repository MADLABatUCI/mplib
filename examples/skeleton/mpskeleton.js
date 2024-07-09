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
// studyId is the name of the root node created in the realtime database
const studyId = 'skeleton'; 

// Configuration setting for the session
let sessionConfig = {
    minPlayersNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 3, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: true, // Allow replacing any players who leave an ongoing session?
    exitDelayWaitingRoom: 0, // Number of countdown seconds before leaving waiting room (if zero, player leaves waiting room immediately)
    maxHoursSession: 0, // Maximum hours where additional players are still allowed to be added to session (if zero, there is no time limit)
    recordData: false // Record all data?  
};
const verbosity = 1; // 0: no writing to console; 1: write output to console

// Allow URL parameters to update these default parameters
updateConfigFromUrl( sessionConfig );

// Pass names of the callback functions in this code to MPLIB
let funList = { 
    sessionChangeFunction: {
        joinedWaitingRoom: joinWaitingRoom,
        updateWaitingRoom: updateWaitingRoom,
        startSession: startSession,
        updateOngoingSession: updateOngoingSession,
        endSession: endSession
    },
    receiveStateChangeFunction: receiveStateChange,
    evaluateUpdateFunction: evaluateUpdate,
    removePlayerStateFunction: removePlayerState
  };

// Set the session parameters and callback functions for MPLIB
initializeMPLIB( sessionConfig , studyId , funList, verbosity );


// -------------------------------------
//       Globals
// -------------------------------------
let playerId;

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

// Function triggered when this client closes the window and the player needs to be removed from the state 
function removePlayerState( playerId ) {

}

// --------------------------------------------------------------------------------------
//   Handle any session change relating to the waiting room or ongoing session 
// --------------------------------------------------------------------------------------

function joinWaitingRoom(sessionInfo) {
    /*
        Functionality to invoke when joining a waiting room.

        This function does the following:
            - Get the current player's playerId
            - Determines the number of players needed for the game
            - Creates an appropriate message based on players needed and players in waiting room
            - Displays the waiting room screen
    */
    playerId = sessionInfo.playerId; // the playerId for this client
    let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers; // Number of players still needed (in case the player is currently in a waiting room)
    let numPlayers = sessionInfo.numPlayers; // the current number of players
    
    let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
    messageWaitingRoom.innerText = str2;
    
    // switch screens from instruction to waiting room
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';
}

function updateWaitingRoom(sessionInfo) {
    /*
        Functionality to invoke when updating the waiting room.

        This function does the following:
            - Displays the waiting room screen
            - Checks the status of the current session
                - If the status is 'waitingRoomCountdown' then the game will start
                - otherwise continue waiting
            - Displays a 'game will start' message if appropriate
    */
    // switch screens from instruction to waiting room
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';

    // Waiting Room is full and we can start game
    if (sessionInfo.status === 'waitingRoomCountdown') {
        let str2 = `Game will start in ${ sessionInfo.countdown } seconds...`;
        messageWaitingRoom.innerText = str2;
    } else { // Still waiting for more players, update wait count
        let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers; // Number of players still needed (in case the player is currently in a waiting room)
        let numPlayers = sessionInfo.numPlayers; // the current number of players
        
        let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
        messageWaitingRoom.innerText = str2;
    }
}

function startSession(sessionInfo) {
    /*
        Funtionality to invoke when starting a session.

        This function does the following:
            - Displays the game screen
            - Logs the start of the game with the session ID and timestamp
            - Displays additional "game started" messages
    */
    playerId = sessionInfo.playerId; // the playerId for this client
    let numPlayers = sessionInfo.numPlayers; // the current number of players
            
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    str2 += `<p>Player ID: ${ sessionInfo.playerId}$</p>`;

    str2 += `<p>Current number of players (${ sessionInfo.numPlayers} total):`;
    for (let i=0; i<numPlayers; i++) {
        let playerNow = sessionInfo.playerIds[i];
        str2 += `<br>Arrival #${sessionInfo.arrivalIndices[i]},  ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
    }
    str2 += `</p>`;

    let allPlayersEver = Object.keys( sessionInfo.allPlayersEver );
    let numPlayersEver = allPlayersEver.length;
    str2 += `<p>History of players ever joined this session (${numPlayersEver} total):`;
    for (let i=0; i<numPlayersEver; i++) {
        let playerNow = allPlayersEver[i];
        str2 += `<br>Arrival #${sessionInfo.allPlayersEver[playerNow].arrivalIndex}, ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
        str2 += ` Arrival time: ${timeStr(sessionInfo.allPlayersEver[playerNow].sessionStartedAt)}`;
        if (sessionInfo.allPlayersEver[playerNow].leftGameAt != 0) {
            str2 += ` Finish time: ${timeStr(sessionInfo.allPlayersEver[playerNow].leftGameAt)}`;
        }
        if (sessionInfo.allPlayersEver[playerNow].finishStatus) {
            str2 += ` Finish status: ${sessionInfo.allPlayersEver[playerNow].finishStatus}`;
        }
    }
    str2 += `</p>`;

    messageGame.innerHTML = str2;
}

function updateOngoingSession(sessionInfo) {
    /*
        Functionality to invoke when updating an ongoing session.

        This function does the following:
            - Currently the same code as startSession
                - Does not include the logging aspect of startSession
    */
    playerId = sessionInfo.playerId; // the playerId for this client
    let numPlayers = sessionInfo.numPlayers; // the current number of players
                
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    let str2 = `<p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    str2 += `<p>Player ID: ${ sessionInfo.playerId}$</p>`;

    str2 += `<p>Current number of players (${ sessionInfo.numPlayers} total):`;
    for (let i=0; i<numPlayers; i++) {
        let playerNow = sessionInfo.playerIds[i];
        str2 += `<br>Arrival #${sessionInfo.arrivalIndices[i]},  ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
    }
    str2 += `</p>`;

    let allPlayersEver = Object.keys( sessionInfo.allPlayersEver );
    let numPlayersEver = allPlayersEver.length;
    str2 += `<p>History of players ever joined this session (${numPlayersEver} total):`;
    for (let i=0; i<numPlayersEver; i++) {
        let playerNow = allPlayersEver[i];
        str2 += `<br>Arrival #${sessionInfo.allPlayersEver[playerNow].arrivalIndex}, ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
        str2 += ` Arrival time: ${timeStr(sessionInfo.allPlayersEver[playerNow].sessionStartedAt)}`;
        if (sessionInfo.allPlayersEver[playerNow].leftGameAt != 0) {
            str2 += ` Finish time: ${timeStr(sessionInfo.allPlayersEver[playerNow].leftGameAt)}`;
        }
        if (sessionInfo.allPlayersEver[playerNow].finishStatus) {
            str2 += ` Finish status: ${sessionInfo.allPlayersEver[playerNow].finishStatus}`;
        }
    }
    str2 += `</p>`;

    messageGame.innerHTML = str2;
}

function endSession(sessionInfo) {
    /*
        Functionality to invoke when ending a session.

        This function does the following:
            - Displays the finish screen (hides all other divs)
            - Checks if any players terminated their session abnormally
                - If so, an "abnormal termination" message is created
                - If not, then the session completed normally
            - Displays a message based on the termination status [normal, abnormal]
    */
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    finishScreen.style.display = 'block';

    // Check if any of the players (who ever played) terminated the session abnormally
    let players = sessionInfo.allPlayersEver; 
    const hasAbnormalStatus = Object.values(players).some(player => player.finishStatus === 'abnormal');

    if (hasAbnormalStatus) {
        // Add your own code below for handling case where another player closed their window or were disconnected prematurely
        // Note that this is an issue with games that have a predefined number of players, but might not be an issue with experiments with
        // a flexible number of players 
        // ....
    }

    if (sessionInfo.sessionErrorCode != 0) {
        messageFinish.innerHTML = `<p>Session ended abnormally. Reason: ${sessionInfo.sessionErrorMsg}</p>`;
        
        if (sessionInfo.sessionErrorCode==1) {
            // Add your own code below for handling case of no sessions being available 
            // .... 
        }

        if (sessionInfo.sessionErrorCode==2) {
            // Add your own code below for handling case of this client being disconnected (e.g. internet connectivity issues) 
            // .... 
        }
    } else {
        messageFinish.innerHTML = `<p>You have completed the session.</p>`;
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