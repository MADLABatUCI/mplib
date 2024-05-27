// --------------------------------------------------------------------------------------
//    Demonstration Code
//    This code demonstrates how MPLIB can be used to track how players
//    join and leave sessions. The browser displays the status of a session;
//    when a waiting room is activated and when a player joins a session 
// --------------------------------------------------------------------------------------

// to do:
//  test  failureJoinSession and disconnect


// -------------------------------------
// Importing functions and variables from 
// the Firebase MultiPlayer library
// -------------------------------------
import {
    joinSession,
    leaveSession,
    gameStateTransaction,
    gameStateDirectUpdate,
} from "/src/mplib.js";


// -------------------------------------
//       Game configuration
// -------------------------------------
// studyId is the name of the root node we create in the database
export const studyId = 'testlib'; 
// Configuration setting for the session
export const sessionConfig = {
    minNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room
    maxNeeded: 3, // Maximum number of players allowed in session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there is no limit)
    allowReplacements: true, // Do we allow replacing any players who leave active sessions?
    maxHours: 0, // Maximum hours where additional players are still allowed to be added to session (if zero, there is no time limit)
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
let messageGameRoom = document.getElementById('messageGameRoom');

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
    leaveSession(); // call the library function to leave a session
    displayMessage(`Player ${arrivalIndex} (${playerId}) left the session`, 'orange');
});

// --------------------------------------------------------------------------------------
//   Handle Events triggered by MPLIB
//   These callback functions are required, but the contents can be empty and left inconsequential  
//   (note: all timestamps are server-side expressed in milliseconds since the Unix Epoch)
// --------------------------------------------------------------------------------------

// This callback function is triggered when a waiting room starts
export function joinedWaitingRoom(sessionInfo) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';
    //let dateString = timeStr(sessionInfo.waitingRoomStartedAt);
    //let str = `Player ${sessionInfo.arrivalIndex} (${sessionInfo.playerId}) joined waiting room for session ${sessionInfo.sessionIndex} that started at ${dateString}. There are ${sessionInfo.numPlayers} waiting total.`; 
    //myconsolelog( str );

    let numNeeded = sessionConfig.minNeeded - sessionInfo.numPlayers;
    let str2 = `Waiting for ${ numNeeded } additional players...`;
    messageWaitingRoom.innerText = str2;
}

// This callback function is triggered when waiting room is still ongoing, but number of players waiting changes
export function updateWaitingRoom(sessionInfo) {
    //let dateString = timeStr(sessionInfo.waitingRoomStartedAt);
    //let str = `Player ${sessionInfo.arrivalIndex} (${sessionInfo.playerId}) joined waiting room for session ${sessionInfo.sessionIndex} that started at ${dateString}. There are ${sessionInfo.numPlayers} waiting total.`; 

    let numNeeded = sessionConfig.minNeeded - sessionInfo.numPlayers;
    let str2 = `Waiting for ${ numNeeded } additional players...`;
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

    let str2 = `<p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    messageGameRoom.innerHTML = str2;
}

// This callback function is triggered when session is active, but number of players changes
export function updateSession(sessionInfo) {    
    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    messageGameRoom.innerHTML = str2;
}

// This callback function is triggered when a player is unable to join a session (e.g., because the maximum number of sessions has been reached)
export function failureJoinSession( sessionInfo ) {
    //displayMessage(`Player ${sessionInfo.arrivalIndex} (${sessionInfo.playerId}) was unable to join a session`, 'red');
}

// This callback function is triggered when the client's browser is disconnected from the internet
export function disconnected() {
    //displayMessage(`Disconnected from session. Game is terminated`, 'red');
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

// -------------------------------------
//       Display Information
// -------------------------------------
function myconsolelog(message) {
    if (verbosity > 0) {
        console.log(message);
    }
}

/*
function displayMessage(message, color) {
    // Select the first element with the "rounded-square" class
    var element = document.querySelector('.rounded-square');
    // Change the background color
    //element.style.backgroundColor = color;

    let messageDiv = document.getElementById('messageWaitingRoom');
    messageDiv.innerText = message;

    myconsolelog(message);
}
*/

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