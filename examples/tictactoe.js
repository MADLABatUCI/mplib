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
export const studyId = 'tictactoe'; 
// Configuration setting for the session
export const sessionConfig = {
    minPlayersNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 2, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: false, // Allow replacing any players who leave an ongoing session?
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
        if (((thisSession.arrivalIndex===1) && (gameState.currentPlayer === gameState.firstArrival)) ||   
            ((thisSession.arrivalIndex===2) && (gameState.currentPlayer !== gameState.firstArrival))) {
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
export function receiveStateChange(nodeName, newState, typeChange ) {
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


export function evaluateUpdate( path, state, action, actionArgs ) {
    let isAllowed = false;
    let newState = null;

    if ((action === 'initialize') && ((state === null) || state.winner !== emptyPlace)) {
        isAllowed = true;
        newState = actionArgs;
    }

    if ((action === 'placeToken') && (state.winner === emptyPlace )) {
        // Is it this player's turn?
        if (((thisSession.arrivalIndex===1) && (state.currentPlayer === state.firstArrival)) ||   
            ((thisSession.arrivalIndex===2) && (state.currentPlayer !== state.firstArrival))) {

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


// This callback function is triggered when a waiting room starts
export function joinedWaitingRoom(sessionInfo) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';

    let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
    let numPlayers = sessionInfo.numPlayers;
    let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;

    messageWaitingRoom.innerText = str2;
    thisSession = sessionInfo;
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
    thisSession = sessionInfo;
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
    //messageGame.innerHTML = str2;

    thisSession = sessionInfo;
    newGame();
}

// This callback function is triggered when session is active, but number of players changes
export function updateSession(sessionInfo) {    
    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    //messageGame.innerHTML = str2;
    thisSession = sessionInfo;

    if (sessionInfo.numPlayers == 1) {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'none';
        gameScreen.style.display = 'none';
        finishScreen.style.display = 'block';
        messageFinish.innerHTML = `<p>The other player has left the session.</p>`;
    }
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
    thisSession = sessionInfo;
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