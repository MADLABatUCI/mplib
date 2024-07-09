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
    hasControl
} from "/mplib/src/mplib.js";

// -------------------------------------
//       Game configuration
// -------------------------------------
// studyId is the name of the root node we create in the database
const studyId = 'groupestimation'; 
// Configuration setting for the session
const sessionConfig = {
    minPlayersNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 2, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: false, // Allow replacing any players who leave an ongoing session?
    exitDelayWaitingRoom: 3, // Number of countdown seconds before leaving waiting room (if zero, player leaves waiting room immediately)
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
    evaluateUpdateFunction: evaluateUpdate,
    removePlayerStateFunction: removePlayerState
};

// Set the session configuration for MPLIB
initializeMPLIB( sessionConfig , studyId , funList, verbosity );

// -------------------------------------
//       Globals
// -------------------------------------
let playerN;
let gameState;
let thisSession;
let playerNEstimate = -1; // save a players no guess as -1, once a player has submitted a guess (> 0) then do something about it
let delayStartNewGame = 3000;
let emptyPlace = ' '; // this character represents the absence of a token and a lack of a winner (it is tempting to use "null" for this state, but firebase does not store any null variables and this can complicate the coding)

let playerMapppings = {
    player2: {
        1: 2,
        3: 3,
        4: 4,
        5: 5
    },
    player3: {
        1: 2,
        2: 3,
        4: 4,
        5: 5 
    },
    player4: {
        1: 2,
        2: 3,
        3: 4,
        5: 5
    },
    player5: {
        1: 2,
        2: 3,
        3: 4,
        4: 5
    }
};

// -------------------------------------
//       Graphics handles
// -------------------------------------
let instructionsScreen = document.getElementById('instructionsScreen');
let waitingRoomScreen = document.getElementById('waitingRoomScreen');
let gameScreen = document.getElementById('gameScreen');
let messageWaitingRoom = document.getElementById('messageWaitingRoom');
let messageGame = document.getElementById('messageGame');
let messageFinish = document.getElementById('messageFinish');
const submitGuess = document.getElementById('estimation-button');
let playerID = document.getElementById('playerID');
let messageToPlayer = document.getElementById('messageToPlayer');
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

submitGuess.addEventListener('click', function () {
    /*
        Event listener for what happens when the client submits their estimate.
    */
    //  Ensure that the estimate value is valid
    if (_ensureClientEstimateIsValid()){
        //  Update the display of the client guess (remove input box and place text of estimate)
        _updateClientEstimateView();
        //  Update the client player avater to be green
        _updatePlayerAvatar(1);
        //  Update the message to the client player
        messageToPlayer.innerText = 'estimate received...waiting for other estimates'
        //  Update the database to now include the client's estimate
        updateStateDirect(
            'state/player' + playerN,
            {
                estimate: Number(playerNEstimate)
            }
        );
        //_updatePlayerAvatar(4);
    } else {
        console.log("still listening...");
    };
    
    /*const placeIndex = cell.getAttribute('data-index');      
    updateStateTransaction('state', 'placeToken', placeIndex ).then(success => {  
        if (!success) {
            console.log( 'You cannot make this move');
        }
    });*/
});

// -------------------------------------
//      Game logic and UI
// -------------------------------------
function _ensureClientEstimateIsValid() {
    /*
        Ensure that the current client has submitted an estimate > 0.
    */

    // Get the estimate element
    let clientEstimate = document.getElementById('player1-guess');
    console.log("Client Estimate", clientEstimate);
    // Ensure the estimate is valid
    //  If the estimate is valid return true
    //  If the estimate is invalid show a message to the client
    //      stating that it is invalid
    if (clientEstimate.value > 0) {
        console.log("valid estimate");
        playerNEstimate = clientEstimate.value;
        return true;
    } else {
        console.log("invalid estimate");
        return false;
    };
};

function _ensureOtherPlayerEstimateIsValid(n) {
    /*
        Ensure that the estimate from another player has submitted and estimate > 0.
    */

    console.log("Game State", gameState);
    // Get the estimate of playerN
    let playerEstimate = gameState['player' + n].estimate;

    console.log("Player " + n + " Estimate", playerEstimate);
    // Ensure the estimate is valid
    //  If the estimate is valid return true
    //  If the estimate is invalid show a message to the client
    //      stating that it is invalid
    if (playerEstimate > 0) {
        console.log("valid estimate for player " + n);
        return true;
    } else {
        console.log("invalid estimate for player " + n);
        return false;
    };
};

function _updateClientEstimateView() {
    /*
        Update the estimate view for the current client once they have submitted
        their own estimate.
    */

    // Get the estimate element
    let clientEstimateInput = document.getElementById('player1-guess');
    let clientEstimateText  = document.getElementById('player1-guess-text');

    // Hide the [input] element
    clientEstimateInput.style.display = "none";
    clientEstimateText.innerText = clientEstimateInput.value;
};

function _updatePlayerEstimateView(n) {
    /*
        Update the estimate view for the another player once they have submitted
        their own estimate.
    */
    let playerToUpdate;
    let playerEstimate = gameState['player' + n].estimate;

    // Get the estimate element
    if (playerN === 1) {
        playerToUpdate = n;
    } else {
        let thisMapping = playerMapppings['player' + playerN];
        console.log(thisMapping);
        playerToUpdate = thisMapping[n];
        console.log(playerToUpdate);
    }
    let playerNudgeButton = document.getElementById('player' + playerToUpdate + '-nudge-button');
    let playerEstimateText  = document.getElementById('player' + playerToUpdate + '-guess-text');
    

    // Hide the [input] element
    playerNudgeButton.style.display = "none";
    playerEstimateText.innerText = playerEstimate;

    _updatePlayerAvatar(playerToUpdate);
};

function _updatePlayerAvatar(n) {
    /*
        Update Player N's avatar if they have made an estimate
    */

    // Get element responsible for player avatar colors
    let root = document.querySelector(":root");

    // Update the color
    root.style.setProperty("--player" + n + "avatar-backgroundcolor", 'green');


};

function newGame() {
    // Initialize a game
    //let whoStarts;
    let newState;

    // If we have an existing game, we go to the next round
    if (gameState) {
        //whoStarts = gameState.playerStarted === 'O' ? 'X' : 'O'; // the player who didn't start last game now starts
        newState = {
            numberOfObjects: 100,
            player1: {
                estimate: playerNEstimate,
            },
            player2: {
                estimate: playerNEstimate,
            },
            //currentPlayer: whoStarts, // who is starting this turn?
            //playerStarted: whoStarts, // who started this game?
            //firstArrival: gameState.firstArrival, // keep the assignments of first-arrived player
            //winner: emptyPlace,
            round: gameState.round + 1
        };
    } else {  // Otherwise, we start from scratch
        //whoStarts = Math.random() < 0.5 ? 'X' : 'O'; // randomly assign whether "X" or "O" starts
        newState = {
            numberOfObjects: 100,
            player1: {
                estimate: playerNEstimate,
            },
            player2: {
                estimate: playerNEstimate,
            },
            //currentPlayer: whoStarts, // who is starting this turn?
            //playerStarted: whoStarts, // who started this game?
            //firstArrival: Math.random() < 0.5 ? 'X' : 'O', // The assignment of the player who arrived first in the session
            //winner: emptyPlace,
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
    /*
        Update the UI whenever the gameState has been updated.

        Updates occur when:
            - A player makes an estimate
            - A player nudges another player
    */
    for (let i = 1; i <= 5; i++) {
        console.log("updating ", i);
        if (i === playerN) {
            console.log("this is the current player number", i);
        } else {
            //  Ensure that the estimate value is valid
            if (_ensureOtherPlayerEstimateIsValid(i)){
                //  Update the display of the client guess (remove input box and place text of estimate)
                _updatePlayerEstimateView(i);
                //  Update the client player avater to be green
                //_updatePlayerAvatar(1);
            }
        }
    }
    /*
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
    */
}


// --------------------------------------------------------------------------------------
//   Handle Events triggered by MPLIB
//   These callback functions are required, but the contents can be empty and left inconsequential  
//   (note: all timestamps are server-side expressed in milliseconds since the Unix Epoch)
// --------------------------------------------------------------------------------------
// Function to receive state changes from Firebase
function receiveStateChange(nodeName, newState, typeChange ) {
    if (nodeName === 'state') {
        gameState = newState;
        updateUI();

        /*
        if (gameState.winner !== emptyPlace) {
            setTimeout(function() {
                // Propose a new game
                newGame();
            }, delayStartNewGame );
        }*/
    }
}


function evaluateUpdate( path, state, action, actionArgs ) {
    let isAllowed = false;
    let newState = null;

    if ((action === 'initialize') && ((state === null) || state.winner !== emptyPlace)) {
        isAllowed = true;
        newState = actionArgs;
    }
    /*
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
    */
    let actionResult = { isAllowed, newState };
    return actionResult;
}

// Function triggered when this client closes the window and the player needs to be removed from the state 
function removePlayerState( playerId ) {

}

// --------------------------------------------------------------------------------------
//   Handle any session change relating to the waiting room or ongoing session 
// --------------------------------------------------------------------------------------

function sessionChange(sessionInfo, typeChange) {
    // typeChange can be the following
    // 'joinedWaitingRoom'
    // 'updateWaitingRoom'
    // 'startSession'
    // 'updateOngoingSession'
    // 'endSession'
    thisSession = sessionInfo;

    let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
    let numPlayers = sessionInfo.numPlayers;
    let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
    messageWaitingRoom.innerText = str2;

    if (typeChange === 'joinedWaitingRoom') {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'block';
    
        let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
        let numPlayers = sessionInfo.numPlayers;
        let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
    
        messageWaitingRoom.innerText = str2;
        thisSession = sessionInfo;
    }

    if (typeChange === 'updateWaitingRoom') {
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

    if (typeChange === 'startSession') {
        playerN = sessionInfo.arrivalIndex;
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'none';
        gameScreen.style.display = 'block';
        
        let dateString = timeStr(sessionInfo.sessionStartedAt);
        let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
        myconsolelog( str );
        playerID.innerText = playerN;

        let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
        //messageGame.innerHTML = str2;

        thisSession = sessionInfo;
        newGame();
    }

    if (typeChange === 'updateOngoingSession') {

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
        thisSession = sessionInfo;
    }
}


// This callback function is triggered when a waiting room starts
/*export function joinedWaitingRoom(sessionInfo) {
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
    // Assign playerUniqueID
    // sessinoInfo.playerID
    playerN = sessionInfo.arrivalIndex;
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    
    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );
    playerID.innerText = playerN;

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
        leaveSession();
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
}*/

/*
// This callback function is triggered when this client gains control over dynamic objects
export function gainedControl() {
    myconsolelog('Client gained control');
}

// This  callback function is triggered when this client loses control over dynamic objects
// e.g., when client's browser loses focus
export function losesControl() {
    myconsolelog('Client loses control');
}
*/

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