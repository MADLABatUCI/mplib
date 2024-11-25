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
    hasControl,
    getCurrentPlayerId, getCurrentPlayerIds, getAllPlayerIds, getPlayerInfo,getNumberCurrentPlayers,getNumberAllPlayers,
    getCurrentPlayerArrivalIndex,getSessionId,anyPlayerTerminatedAbnormally,getSessionError,getWaitRoomInfo
} from "/mplib/src/mplib.js";

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
//       Session configuration
// -------------------------------------
// studyId is the name of the root node created in the realtime database
const studyId = 'skeleton'; 

// Configuration setting for the session
let sessionConfig = {
    minPlayersNeeded: 1, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 3, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: false, // Allow replacing any players who leave an ongoing session?
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

// List the node names where we place listeners for any changes to the children of these nodes; set to '' if listening to changes for children of the root
let listenerPaths = [ '' ];

// Set the session parameters and callback functions for MPLIB
initializeMPLIB( sessionConfig , studyId , funList, listenerPaths, verbosity );


// -------------------------------------
//       Globals
// -------------------------------------




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
function receiveStateChange(pathNow, nodeName, newState, typeChange ) {
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
function removePlayerState() {

}

// --------------------------------------------------------------------------------------
//   Handle any session change relating to the waiting room or ongoing session 
// --------------------------------------------------------------------------------------

function joinWaitingRoom() {
    /*
        Functionality to invoke when joining a waiting room.

        This function does the following:
            - Get the current player's playerId
            - Determines the number of players needed for the game
            - Creates an appropriate message based on players needed and players in waiting room
            - Displays the waiting room screen
    */

    let playerId = getCurrentPlayerId(); // the playerId for this client
    let numPlayers = getNumberCurrentPlayers(); // the current number of players
    let numNeeded = sessionConfig.minPlayersNeeded - numPlayers; // Number of players still needed (in case the player is currently in a waiting room)
    
    let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
    messageWaitingRoom.innerText = str2;
    
    // switch screens from instruction to waiting room
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';
}

function updateWaitingRoom() {
    /*
        Functionality to invoke when updating the waiting room.

        This function does the following:
            - Displays the waiting room screen
            - Checks the status of the waiting room through the getWaitRoomInfo() function
                - If the flag doCountDown is true, then the game will start after a countdown
                - otherwise continue waiting
            - Displays a 'game will start' message if appropriate
    */
   
    // switch screens from instruction to waiting room
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';

    // Waiting Room is full and we can start game
    let [ doCountDown , secondsLeft ] = getWaitRoomInfo();
    if (doCountDown) {
        let str2 = `Game will start in ${ secondsLeft } seconds...`;
        messageWaitingRoom.innerText = str2;
    } else { // Still waiting for more players, update wait count
        let numPlayers = getNumberCurrentPlayers(); // the current number of players
        let numNeeded = sessionConfig.minPlayersNeeded - numPlayers; // Number of players still needed (in case the player is currently in a waiting room)
        
        let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
        messageWaitingRoom.innerText = str2;
    }
}

function startSession() {
    /*
        Funtionality to invoke when starting a session.

        This function does the following:
            - Displays the game screen
            - Logs the start of the game with the session ID and timestamp
            - Displays additional "game started" messages
    */
    let playerId = getCurrentPlayerId(); // the playerId for this client
    let playerIds = getCurrentPlayerIds(); // the list of current players
    let numPlayers = getNumberCurrentPlayers(); // the current number of players
            
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    let dateString = timeStr( getPlayerInfo( playerId ).sessionStartedAt);
    let str = `Started game with session id ${getSessionId()} with ${numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>Session ID: ${getSessionId()}$</p>`;
    str2 += `<p>Player ID: ${playerId}$</p>`;

    str2 += `<p>Current number of players (${numPlayers} total):`;
    for (let i=0; i<numPlayers; i++) {
        let playerNow = playerIds[i];
        let playerInfo = getPlayerInfo( playerNow );
        str2 += `<br>`;
        if (playerId===playerNow) str2 += `<b>`;
        str2 += `Rank among active #${playerInfo.arrivalIndexActivePlayers}, Stable Index  #${playerInfo.arrivalIndexActivePlayersStable}, ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
        if (playerId===playerNow) str2 += `</b>`;
    }
    str2 += `</p>`;

    let allPlayersEver = getAllPlayerIds();
    let numPlayersEver = getNumberAllPlayers();
    str2 += `<p>History of players that ever joined this session or waiting room (${numPlayersEver} total):`;
    for (let i=0; i<numPlayersEver; i++) {
        let playerNow = allPlayersEver[i];
        let playerInfo = getPlayerInfo( playerNow );
        str2 += `<br>Arrival #${playerInfo.arrivalIndex}, ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
        str2 += ` Arrival time: ${timeStr(playerInfo.sessionStartedAt)}`;
        if (playerInfo.leftGameAt != 0) {
            str2 += ` Finish time: ${timeStr(playerInfo.leftGameAt)}`;
        }
        if (playerInfo.finishStatus) {
            str2 += ` Finish status: ${playerInfo.finishStatus}`;
        }
    }
    str2 += `</p>`;

    messageGame.innerHTML = str2;
}

function updateOngoingSession() {
    /*
        Functionality to invoke when updating an ongoing session.

        This function does the following:
            - Currently the same code as startSession
            - Does not include the logging aspect of startSession
    */
    let playerId = getCurrentPlayerId(); // the playerId for this client
    let playerIds = getCurrentPlayerIds(); // the list of current players
    let numPlayers = getNumberCurrentPlayers(); // the current number of players
            
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    let dateString = timeStr( getPlayerInfo( playerId ).sessionStartedAt);
    let str = `Started game with session id ${getSessionId()} with ${numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>Session ID: ${getSessionId()}$</p>`;
    str2 += `<p>Player ID: ${playerId}$</p>`;

    str2 += `<p>Current number of players (${numPlayers} total):`;
    for (let i=0; i<numPlayers; i++) {
        let playerNow = playerIds[i];
        let playerInfo = getPlayerInfo( playerNow );
        str2 += `<br>`;
        if (playerId===playerNow) str2 += `<b>`;
        str2 += `Rank among active #${playerInfo.arrivalIndexActivePlayers}, Stable Index  #${playerInfo.arrivalIndexActivePlayersStable}, ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
        if (playerId===playerNow) str2 += `</b>`;
    }
    str2 += `</p>`;

    let allPlayersEver = getAllPlayerIds();
    let numPlayersEver = getNumberAllPlayers();
    str2 += `<p>History of players that ever joined this session or waiting room (${numPlayersEver} total):`;
    for (let i=0; i<numPlayersEver; i++) {
        let playerNow = allPlayersEver[i];
        let playerInfo = getPlayerInfo( playerNow );
        str2 += `<br>Arrival #${playerInfo.arrivalIndex}, ID: ${playerNow} ${ playerId===playerNow ? '(you)' : '' }`;
        str2 += ` Arrival time: ${timeStr(playerInfo.sessionStartedAt)}`;
        if (playerInfo.leftGameAt != 0) {
            str2 += ` Finish time: ${timeStr(playerInfo.leftGameAt)}`;
        }
        if (playerInfo.finishStatus) {
            str2 += ` Finish status: ${playerInfo.finishStatus}`;
        }
    }
    str2 += `</p>`;

    messageGame.innerHTML = str2;
}

function endSession() {
    /*
        Function invoked by MPLIB when ending a session. Do *not* invoke this function yourself (use leaveSession for this purpose)

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

    let err = getSessionError();

    if ( anyPlayerTerminatedAbnormally()) {
        // Another player closed their window or were disconnected prematurely
        messageFinish.innerHTML = `<p>Session ended abnormally because the other player closed their window or was disconnected</p>`;
    } else if (err.errorCode == 1) {
        // No sessions available
        messageFinish.innerHTML = `<p>Session ended abnormally because there are no available sessions to join</p>`;
    } else if (err.errorCode==2) {
        // This client was disconnected (e.g. internet connectivity issues) 
        messageFinish.innerHTML = `<p>Session ended abnormally because you are experiencing internet connectivity issues</p>`;
    } else if (err.errorCode==3) {
        // This client is using an incompatible browser
        messageFinish.innerHTML = `<p>Session ended abnormally because you are using the Edge browser which is incompatible with this experiment. Please use Chrome or Firefox</p>`;
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