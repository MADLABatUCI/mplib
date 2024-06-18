// --------------------------------------------------------------------------------------
//    Demonstrate how MPLIB can be used to program a turn taking game
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
//       Game configuration
// -------------------------------------
// studyId is the name of the root node we create in the database
export const studyId = 'numobjects'; 
// Configuration setting for the session
export const sessionConfig = {
    minPlayersNeeded: 1, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 5, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: false, // Allow replacing any players who leave an ongoing session?
    exitDelayWaitingRoom: 3, // Number of countdown seconds before leaving waiting room (if zero, player leaves waiting room immediately)
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
let gameState;
let thisSession;
let emptyPlace = ' '; // this character represents the absence of a token and a lack of a winner (it is tempting to use "null" for this state, but firebase does not store any null variables and this can complicate the coding)
let delayStartNewGame = 3000;

// -------------------------------------
//       Graphics handles
// -------------------------------------
let instructionsScreen = document.getElementById('instructionsScreen');
let waitingRoomScreen = document.getElementById('waitingRoomScreen');
let gameScreen = document.getElementById('gameScreen');
let messageWaitingRoom = document.getElementById('messageWaitingRoom');
let messageGame = document.getElementById('messageGame');
let messageFinish = document.getElementById('messageFinish');
const cells = document.querySelectorAll('.cell');
let instructionsText = document.getElementById('instructionText');
let turnText = document.getElementById('turnMessage');

// Set up correct instructions
instructionsText.innerHTML = `<p>This game demonstrates how to use the MPLIB library for the two-player turn-taking game of tic-tac-toe. Use the mouse
to place your tokens on the board.</p><p>Open up this link at two different browser tabs (or two different browsers) to simulate the two players</p>`;

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