// --------------------------------------------------------------------------------------
//    Demonstrate how MPLIB can be used to program a turn taking game
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
const cells = document.querySelectorAll('.cell');
let instructionsText = document.getElementById('instructionText');
let turnText = document.getElementById('turnMessage');

// -------------------------------------
//       Game configuration
// -------------------------------------
// studyId is the name of the root node we create in the database
const studyId = 'tictactoe'; 
// Configuration setting for the session
let sessionConfig = {
    minPlayersNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 2, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: false, // Allow replacing any players who leave an ongoing session?
    exitDelayWaitingRoom: 0, // Number of countdown seconds before leaving waiting room (if zero, player leaves waiting room immediately)
    maxHoursSession: 0, // Maximum hours where additional players are still allowed to be added to session (if zero, there is no time limit)
    recordData: false // Record all data?  
};
const verbosity = 2;

// Allow URL parameters to update these default parameters
updateConfigFromUrl( sessionConfig );

// List names of the callback functions that are used in this code (so MPLIB knows which functions to trigger)
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
let gameState;
let emptyPlace = ' '; // this character represents the absence of a token and a lack of a winner (it is tempting to use "null" for this state, but firebase does not store any null variables and this can complicate the coding)
let delayStartNewGame = 3000;

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

// Set up listeners for mouse clicks
cells.forEach(cell => {
    cell.addEventListener('click', () => {   
        const placeIndex = cell.getAttribute('data-index');      
        updateStateTransaction('state', 'placeToken', placeIndex ).then(success => {  
            if (!success) {
                console.log( 'You cannot make this move');
            }
        });
    });
});

// -------------------------------------
//      Game logic and UI
// -------------------------------------
// Set up correct instructions
instructionsText.innerHTML = `<p>This game demonstrates how to use the MPLIB library for the two-player turn-taking game of tic-tac-toe. Use the mouse
to place your tokens on the board.</p><p>Open up this link at two different browser tabs (or two different browsers) to simulate the two players</p>`;

function newGame() {
    // Initialize a game
    let whoStarts;
    let newState;

    // If we have an existing game, we go to the next round
    if (gameState) {
        whoStarts = gameState.playerStarted === 'O' ? 'X' : 'O'; // the player who didn't start last game now starts
        newState = {
            board: Array(9).fill(emptyPlace),
            currentPlayer: whoStarts, // who is starting this turn?
            playerStarted: whoStarts, // who started this game?
            firstArrival: gameState.firstArrival, // keep the assignments of first-arrived player
            winner: emptyPlace,
            round: gameState.round + 1
        };
    } else {  // Otherwise, we start from scratch
        whoStarts = Math.random() < 0.5 ? 'X' : 'O'; // randomly assign whether "X" or "O" starts
        newState = {
            board: Array(9).fill(emptyPlace),
            currentPlayer: whoStarts, // who is starting this turn?
            playerStarted: whoStarts, // who started this game?
            firstArrival: Math.random() < 0.5 ? 'X' : 'O', // The assignment of the player who arrived first in the session
            winner: emptyPlace,
            round: 1
        };
    }
    
    // Each player will attempt to initialize the game but only the first player (client) to 
    // run this transaction will be able to initialize the state. We place the game state under the node 'state'
    // as this will broadcast the entire gamestate to players (including /board, /currentPlayer, etc) 
    updateStateTransaction( 'state' , 'initialize' , newState ).then(success => {
        // Note that updates to the game state are not done in this conditional statement. If the transaction
        // is successful, the state will be broadcast to all players and the "receiveUpdate" function can be
        // used to update the local game state
        if (!success) {
            console.log( 'The game was already initialized');
        } else {
            console.log( 'The game is initialized by this player');
        }
    });
}

// Function to update the UI
function updateUI() {
    gameState.board.forEach((value, placeIndex) => {
        cells[placeIndex].innerText = value;
    });

    let str = '';
    if ((gameState.winner === 'X') || (gameState.winner === 'O')) {
        str = `${gameState.winner} wins!`;
    } else if (gameState.winner === 'XO') {
        str = 'Draw!';
    } else {
        // Is it this player's turn?
        if (((getCurrentPlayerArrivalIndex()===1) && (gameState.currentPlayer === gameState.firstArrival)) ||   
            ((getCurrentPlayerArrivalIndex()===2) && (gameState.currentPlayer !== gameState.firstArrival))) {
            str = `You are player ${gameState.currentPlayer}. It is your turn...`
        } else {
            str = `Waiting for the other player...`
        }
    }

    turnText.innerText = str;
}

// Function to check the winner
function checkWinner( board ) {
    let isWin = false;

    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    winningCombinations.forEach(combination => {
        const [a, b, c] = combination;
        if (board[a] !== emptyPlace && board[a] === board[b] && board[a] === board[c]) {
            isWin = true;
        }
    });

    return isWin;
}



// --------------------------------------------------------------------------------------
//   Handle Events triggered by MPLIB
//   These callback functions are required, but the contents can be empty and left inconsequential  
//   (note: all timestamps are server-side expressed in milliseconds since the Unix Epoch)
// --------------------------------------------------------------------------------------
// Function to receive state changes from Firebase
function receiveStateChange(pathNow,nodeName, newState, typeChange ) {
    if (nodeName === 'state') {
        gameState = newState;
        updateUI();

        if (gameState.winner !== emptyPlace) {
            setTimeout(function() {
                // Propose a new game
                newGame();
            }, delayStartNewGame );
        }
    }
}


function evaluateUpdate( path, state, action, actionArgs ) {
    let isAllowed = false;
    let newState = null;

    if ((action === 'initialize') && ((state === null) || state.winner !== emptyPlace)) {
        isAllowed = true;
        newState = actionArgs;
    }

    if ((action === 'placeToken') && (state.winner === emptyPlace )) {
        // Is it this player's turn?
        if (((getCurrentPlayerArrivalIndex()===1) && (state.currentPlayer === state.firstArrival)) ||   
            ((getCurrentPlayerArrivalIndex()===2) && (state.currentPlayer !== state.firstArrival))) {

            // Can a token be placed here?
            let placeIndex = actionArgs;
            if ((state.board[ placeIndex ] !== 'X') && (state.board[ placeIndex ] !== 'O')) {
                isAllowed = true;
                newState = state;
                newState.board[placeIndex] = newState.currentPlayer;
                
                // Check if all places are filled
                const isBoardFilledWithXorO = newState.board.every(cell => cell === 'X' || cell === 'O');

                // Is this a winning move?
                if (checkWinner( newState.board )) {
                    newState.winner = newState.currentPlayer;
                } else if (isBoardFilledWithXorO) {
                    // A draw                   
                    newState.winner = 'XO';
                } else {
                    // Give the turn to the next player
                    newState.currentPlayer = newState.currentPlayer === 'X' ? 'O' : 'X';
                }
                
            }        
        }
    }

    let actionResult = { isAllowed, newState };
    return actionResult;
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
            - Displays a "game started" message
            - Starts a new game
    */
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    
    let playerId = getCurrentPlayerId(); // the playerId for this client
    let dateString = timeStr(getPlayerInfo( playerId ).sessionStartedAt);
    let str = `Started game with session id ${getSessionId()} with ${getNumberCurrentPlayers()} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>The game has started...</p><p>Number of players: ${ getNumberCurrentPlayers()}</p><p>Session ID: ${getSessionId()}$</p>`;
    //messageGame.innerHTML = str2;

    newGame();
}

function updateOngoingSession() {
    /*
        Functionality to invoke when updating an ongoing session.

        This function is currently empty.
    */
}

function endSession() {
    /*
        Function invoked by MPLIB when ending a session. Do *not* call this function yourself (use leaveSession for this purpose)

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