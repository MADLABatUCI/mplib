/*
groupestimation.js

    |   Author          :   Helio Tejeda
    |   Date            :   July 2024
    |   Organization    :   MADLAB - University of California, Irvine

 ---------------------------
|   MPLib.js Game Example   |
 ---------------------------
Demonstrate how MPLib.js can be used to program a [insert game type] game.

 ---------------------------
|   Group Estimation Game   |
 ---------------------------
This is a group estimation game. Participants are given an image and need to
estimate the number of objects in the image (as an example, estimating the
number of objects in a jar).
*/


/*
    Imports from MPLib.js
    ---------------------

Import all necessary functionality from the library.
*/
import {
    updateConfigFromUrl,
    initializeMPLIB,
    joinSession,
    leaveSession,
    updateStateDirect,
    updateStateTransaction,
    hasControl,
    getCurrentPlayerId,
    getCurrentPlayerIds,
    getAllPlayerIds,
    getPlayerInfo,
    getNumberCurrentPlayers,
    getNumberAllPlayers,
    getCurrentPlayerArrivalIndex,
    getSessionId,
    anyPlayerTerminatedAbnormally,
    getSessionError,
    getWaitRoomInfo
} from "/mplib/src/mplib.js";


/*
    Game Configuration
    ------------------

Configure all of the game settings. This includes:
    - Game Variables
    - Session Configuration
    - Logging Verbosity
    - Finalize Game Config with URL Params
    - Create Function Callback Object
    - Initialize Game Session with Library
*/

//  Conatant Game Variables
let GameName = "groupestimation";
let NumPlayers = 3;
let MinPlayers = NumPlayers;
let MaxPlayers = NumPlayers;
let MaxSessions = 0;
let PlayerReplacement = false;
let LeaveWaitingRoomTime = 3;
let MinPlayerTimeout = 0;
let MaxSessionTime = 0;
let SaveData = true;

//  Configuration Settings for the Session
const studyId = GameName; 
const sessionConfig = {
    minPlayersNeeded: MinPlayers,
    maxPlayersNeeded: MaxPlayers,
    maxParallelSessions: MaxSessions,
    allowReplacements: PlayerReplacement,
    exitDelayWaitingRoom: LeaveWaitingRoomTime,
    maxDurationBelowMinPlayersNeeded: MinPlayerTimeout,
    maxHoursSession: MaxSessionTime,
    recordData: SaveData
};
const verbosity = 2;

//  Update Config Settings based on URL Parameters
updateConfigFromUrl( sessionConfig );

//  Create Function List
//      An object with all necessary callback functions for gameplay
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
let listenerPaths = [ 'players', 'images' ];

//  Initialize the Game Session with all Configs
initializeMPLIB( sessionConfig , studyId , funList, listenerPaths, verbosity );


/*
    Game Variables
    --------------

Initialize all game variables that will be used. This includes:
    - Global Variables
    - Graphic Handles
    - Event Listeners
*/

//  Game Global Variables
let thisPlayerID = getCurrentPlayerId();
let allPlayerIDs;
console.log("Game Starting...", thisPlayerID);
let playerIDsAll;
let playerNumber;
let gameState = {
    images: {},
    players: {
    }
};
let numberOfEstimates = 0;

let playerNEstimate = -1; // save a players no guess as -1, once a player has submitted a guess (> 0) then do something about it
let selectedImageArray;
let trialNumber = 1;
let NumberOfImages = 3;
let imgPath = '/mplib/examples/groupestimation/images/';
let estimationTimeStart;
let estimationTimeEnd;

let estimationImages = {
    image01 : {
        path            : imgPath + 'Sphere2_0JRIF5LHV_view5.png',
        trueEstimate    : 554,
    },
    image02 : {
        path            : imgPath + 'Sphere2_7ILGNRK2D_view5.png',
        trueEstimate    : 249,
    },
    image03 : {
        path            : imgPath + 'Sphere2_80NMDSOCB_view5.png',
        trueEstimate    : 862,
    },
    image04 : {
        path            : imgPath + 'Sphere2_82DFOODCS_view5.png',
        trueEstimate    : 295,
    },
    image05 : {
        path            : imgPath + 'Sphere2_KGONB1PPB_view5.png',
        trueEstimate    : 527,
    },
    image06 : {
        path            : imgPath + 'Sphere2_KPET24YYP_view5.png',
        trueEstimate    : 734,
    },
    image07 : {
        path            : imgPath + 'Sphere2_NIB1FRFXN_view5.png',
        trueEstimate    : 388,
    },
    image08 : {
        path            : imgPath + 'Sphere2_QJ7A2VLZJ_view5.png',
        trueEstimate    : 634,
    },
    image09 : {
        path            : imgPath + 'Sphere2_VL08RVUR5_view5.png',
        trueEstimate    : 369,
    },
    image00 : {
        path            : imgPath + 'Sphere2_VPVRI6MWB_view5.png',
        trueEstimate    : 872,
    },
};


//  Game Graphics Handles

//      Instructions
let instructionsScreen = document.getElementById('instructionsScreen');
let instructionsText = document.getElementById('instructionText');
let joinButton = document.getElementById('joinBtn');

//      Waiting Room
let waitingRoomScreen = document.getElementById('waitingRoomScreen');
let messageWaitingRoom = document.getElementById('messageWaitingRoom');

//      Game Interface
let gameScreen = document.getElementById('gameScreen');
let messageGame = document.getElementById('messageGame');
let submitGuess; // = document.getElementById('estimation-button');
let playerID = document.getElementById('playerID');
let messageToPlayer = document.getElementById('messageToPlayer');
let imageContainer = document.getElementById('image-to-estimate');
let leaveButton = document.getElementById('leaveBtn');

//      Complete Screen
let messageFinish = document.getElementById('messageFinish');


//let turnText = document.getElementById('turnMessage');


//imageContainer.src = images[selectedImages[trialNumber]].path;

// Set up correct instructions
instructionsText.innerHTML = `<p>This game demonstrates how to use the MPLIB library for the two-player turn-taking game of tic-tac-toe. Use the mouse
to place your tokens on the board.</p><p>Open up this link at two different browser tabs (or two different browsers) to simulate the two players</p>`;


//  Game Event Listeners

//      Join Button
joinButton.addEventListener('click', function () {
    /*
    Call the library function to attempt to join a session.
    
    This results in one of the following:
        - starting a session directly
        - starting a waiting room
    */
    joinSession();
});

//      Leave Button (End Session Button)
leaveButton.addEventListener('click', function () {
    /*
    Call the library function to leave a session.
    
    This then triggers the local function endSession.
    */
    leaveSession();
});

/*
    Game Logic and UI
    -----------------

Game logic and functionality. All functions for gameplay. This includes:
    -
    -
    -
*/
function _randomizeImageSelection() {
    /*
    Randomize the images that will be used for the game.

    Note:
        - NumberOfImages is a global game variable

    Params
    ------
    None

    Returns
    -------
    Array
        - Shuffled array of images to select
    */
    let imageArray = Array.from({ length: 10 }, (v, k) => 'image0' + k * 1);
    let shuffledImageArray = imageArray.sort(function(){ return 0.5 - Math.random() });
    let selectedImages = shuffledImageArray.slice(0, NumberOfImages);

    return selectedImages;
};

function selectTrialImage(images, trial) {
    /*
    Select the image to display based on the trial number.

    Params
    ------
    images  :   Array
        - Array of images to select

    trial   :   Number
        - Current trial number

    Return
    ------
    Object
        - Object containing the image path and true estimate for the trial

    */
    return estimationImages[images[trial]]
}
function _ensureClientEstimateIsValid() {
    /*
        Ensure that the current client has submitted an estimate > 0.
    */

    // Get the estimate element
    //let thisPlayerID = getCurrentPlayerId();
    let clientEstimate = document.getElementById(thisPlayerID + '-guess');
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

function _ensureOtherPlayerEstimateIsValid(player) {
    /*
        Ensure that the estimate from another player has submitted and estimate > 0.
    */

    console.log("Game State", gameState);
    // Get the estimate of playerNumber
    let playerEstimate = gameState.players[player].estimate;

    console.log("Player " + player + " Estimate", playerEstimate);
    // Ensure the estimate is valid
    //  If the estimate is valid return true
    //  If the estimate is invalid show a message to the client
    //      stating that it is invalid
    if (playerEstimate > 0) {
        console.log("valid estimate for player " + player);
        return true;
    } else {
        console.log("invalid estimate for player " + player);
        return false;
    };
};

function _updateClientEstimateView(estimateMade) {
    /*
        Update the estimate view for the current client once they have submitted
        their own estimate.
    */
    // Get the estimate element
    let clientEstimateInput = document.getElementById(thisPlayerID + '-guess');
    let clientEstimateText  = document.getElementById(thisPlayerID + '-guess-text');
    let estimationButton = document.getElementById("estimation-button");
    if (estimateMade) {
        console.log("ESTIMATE MADE");
        
        // Hide the [input] element and the "Submit" button
        clientEstimateInput.style.display = "none";
        estimationButton.style.display = "none";
        // Display the Client Estimate as text
        clientEstimateText.style.display = null;
        clientEstimateText.innerText = clientEstimateInput.value;
    } else {
        console.log("RESETTING ESTIMATES");

        // Show the [input] element (and reset value) and the "Submit" button
        clientEstimateInput.value = null;
        clientEstimateInput.style.display = null;
        estimationButton.style.display = null;
        // Hide the Client Estimate text value
        clientEstimateText.innerText = "--";
        clientEstimateText.style.display = "none";
    }
    
};

/*function _updatePlayerEstimateView(n) {
    /*
        Update the estimate view for the another player once they have submitted
        their own estimate.
    * /
    let playerToUpdate;
    let playerEstimate = gameState['player' + n].estimate;

    // Get the estimate element
    if (playerNumber === 1) {
        playerToUpdate = n;
    } else {
        let thisMapping = playerMapppings['player' + playerNumber];
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
};*/

function _updatePlayerEstimateViewV2(player, estimateMade) {
    /*
        Update the estimate view for the another player once they have submitted
        their own estimate.
    */
    console.log("trying to update avatar");
    let playerEstimate = gameState.players[player].estimate;

    //let thisPlayerID = getCurrentPlayerId();
    let playerEstimateText;
    // Get the estimate element
    if (player == thisPlayerID) {console.log("current player");} else {
        console.log("Updating other player");
        console.log("player to update", player);
        let playerNudgeButton = document.getElementById(player + '-nudge-button');
        playerNudgeButton.style.display = "none";
    }

    playerEstimateText = document.getElementById(player + '-guess-text');
    if (estimateMade) {
        console.log("Updating player estimate");
        playerEstimateText.innerText = playerEstimate;
    } else {
        playerEstimateText.innerText = "----";
    }
    

    console.log("updating player avater");
    _updatePlayerAvatarV2()
};

function _setPlayerAvatarCSS() {
    /*
        Update Player N's avatar if they have made an estimate
    */

    console.log("setting CSS");
    // Get element responsible for player avatar colors
    let root = document.querySelector(":root");
    console.log("Root", root);
    let allPlayerIDs = getCurrentPlayerIds();
    allPlayerIDs.forEach((player) => root.style.setProperty(
        "--" + player + "-avatar-backgroundcolor", 'lightgray'
    ));
    console.log("set all players as light gray");
    //let thisPlayerID = getCurrentPlayerId();
    root.style.setProperty(
        "--" + thisPlayerID + "-avatar-backgroundcolor", 'black'
    )
    console.log("set this player as black");

};

function _createThisPlayerAvatar() {
    let thisPlayerContainer = document.getElementById('player1-container');

    //let thisPlayerID = getCurrentPlayerId();
    thisPlayerContainer.innerHTML = `
    <div class="row" id="${thisPlayerID}-container">
        <div class="col-12" id="${thisPlayerID}-content">
            <h3 id="${thisPlayerID}-name">You</h3>
        </div>
    </div>
    <div class="row" id="${thisPlayerID}-avatar-container">
        <div class="col-12" id="${thisPlayerID}-avatar-content">
            <div class="person" id="player1">

            </div>
        </div>
    </div>
    <div class="row" id="${thisPlayerID}-guess-container">
        <div class="col-12" id="${thisPlayerID}-guess-content-input">
            <input class="guess" id="${thisPlayerID}-guess" type="number" value="" required>
        </div>
        <div class="col-12" id="${thisPlayerID}-guess-content-text">
            <h4 id="${thisPlayerID}-guess-text"></h4>
        </div>
    </div>
    <div class="row" id="player1-submit-container">
        <div class="col-12" id="player1-submit-content">
            <button type="button" class="btn btn-dark" id="estimation-button">
                Submit
            </button>
        </div>
    </div>
    `;
    submitGuess = document.getElementById('estimation-button');
    //      Submit Guess Button
    submitGuess.addEventListener('click', function () {
    /*
        Event listener for what happens when the client submits their estimate.
    */
    //  Ensure that the estimate value is valid
    if (_ensureClientEstimateIsValid()){
        estimationTimeEnd = new Date();
        //  Update the display of the client guess (remove input box and place text of estimate)
        _updateClientEstimateView(1);
        //  Update the client player avater to be green
        _updatePlayerAvatar(1, 'green');
        //  Update the message to the client player
        messageToPlayer.innerText = 'estimate received...waiting for other estimates'
        //  Update the database to now include the client's estimate
        //let thisPlayerID = getCurrentPlayerId();
        updateStateDirect(
            `players/${thisPlayerID}`,
            {
                estimate: Number(playerNEstimate),
                timeForEstimate: estimationTimeEnd - estimationTimeStart
            }
        );
    } else {
        console.log("still listening...");
    };

});
};

function _createOtherPlayerAvatar() {
    
    let otherPlayerContainer = document.getElementById('other-player-content');

    let thisPlayerID = getCurrentPlayerId();
    let allPlayerIDs = getCurrentPlayerIds();
    let otherPlayerCountID = 2;
    allPlayerIDs.forEach((player) => {
        if (player == thisPlayerID){} else {
            let columnSize;
            if (allPlayerIDs.length == 5){
                columnSize = 3;
            } else if (allPlayerIDs.length == 4) {
                columnSize = 4;
            } else if (allPlayerIDs.length == 3) {
                columnSize = 6;
            } else {
                columnSize = 12;
            };
            otherPlayerContainer.innerHTML += `
                <div class="col-${columnSize}" id="${player}-container">
                    <div class="row" id="${player}-name-container">
                        <div class="col-12" id="${player}-name-content">
                            <h3 id="${player}-name">Player ${otherPlayerCountID}</h3>
                        </div>
                    </div>
                    <div class="row" id="${player}-avatar-container">
                        <div class="col-12" id="${player}-avatar-content">
                            <div class="person" id="player2">

                            </div>
                        </div>
                    </div>
                    <div class="row" id="${player}-guess-container">
                        <div class="col-12" id="${player}-nudge-content">
                            <button type="button" class="btn btn-danger" id="${player}-nudge-button" disabled hidden>
                                Nudge
                            </button>
                        </div>
                        <div class="col-12" id="${player}-guess-content-text">
                            <h4 id="${player}-guess-text">----</h4>
                        </div>
                    </div>
                </div>
            `;
            otherPlayerCountID++;
        }
    });
    

};

function _updatePlayerAvatar(n, color) {
    /*
        Update Player N's avatar if they have made an estimate
    */

    // Get element responsible for player avatar colors
    let root = document.querySelector(":root");

    // Update the color
    root.style.setProperty("--player" + n + "avatar-backgroundcolor", color);


};

function _updatePlayerAvatarV2(player) {
    /*
        Update Player N's avatar if they have made an estimate
    */

    // Get element responsible for player avatar colors
    let root = document.querySelector(":root");

    // Update the color
    root.style.setProperty("--" + player + "-avatar-backgroundcolor", 'green');


};

function _createNewGameState() {
    /*
    Create a new game state initializing the database game state object.

    */
    let newGameState = {};

    let numPlayers = getNumberCurrentPlayers();
    let thisPlayerID = getCurrentPlayerId();
    let allPlayerIDs = getCurrentPlayerIds();

    // Iterate
    // iterate over selected images
    // create an object of objects
    console.log("Creating game state");
    console.log("Setting random image order");
    selectedImageArray = _randomizeImageSelection();
    console.log("Selected Images:", selectedImageArray);
    let trialCount = 1;
    for (let i = 0; i < selectedImageArray.length; i++) {
        newGameState["trialImage0" + trialCount] = {
            path: estimationImages[selectedImageArray[i]].path,
            trial: trialCount,
            trueEstimate: estimationImages[selectedImageArray[i]].trueEstimate,
            imageKeyName: selectedImageArray[i]
        };
        trialCount++;
    }
    console.log("New Game State");
    /*allPlayerIDs.forEach((player) => newGameState[player] = {
        'estimate': -1,
        'timeForEstimate': -1,
    });*/

    console.log(newGameState);

    return newGameState;
};

function newGame() {
    // Initialize a game
    //let whoStarts;
    _setPlayerAvatarCSS();
    _createThisPlayerAvatar();
    _createOtherPlayerAvatar();

    let newState;
    newState = _createNewGameState();
    
    // Each player will attempt to initialize the game but only the first player (client) to 
    // run this transaction will be able to initialize the state. We place the game state under the node 'state'
    // as this will broadcast the entire gamestate to players (including /board, /currentPlayer, etc) 
    updateStateTransaction( 'images/trialImages' , 'initialize' , newState ).then(success => {
        // path in database would be
        //  images/trialImages/

        // Note that updates to the game state are not done in this conditional statement. If the transaction
        // is successful, the state will be broadcast to all players and the "receiveUpdate" function can be
        // used to update the local game state
        if (!success) {
            console.log( 'The game was already initialized');
        } else {
            console.log( 'The game is initialized by this player');
        }
    });

    //displayTrialImage();
}

// Function to update the UI
function updateUI() {
    /*
        Update the UI whenever the gameState has been updated.

        Updates occur when:
            - A player makes an estimate
            - A player nudges another player
    */
    console.log("update has been made");
    let allPlayerIDs = getCurrentPlayerIds();


    allPlayerIDs.forEach((player) => {
        if (_ensureOtherPlayerEstimateIsValid(player)) {
            _updatePlayerEstimateViewV2(player, 1);
        };
    });
    /*for (let i = 1; i <= 5; i++) {
        console.log("updating ", i);
        if (i === playerNumber) {
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
    }*/
};

function resetTrialParams() {
    /*
    Reset all trial parameters.
    */
    numberOfEstimates = 0;
    allPlayerIDs.forEach((player) => {
        if (player == thisPlayerID) {
            _updateClientEstimateView(0);
            _updatePlayerAvatar(1, 'black');
        } else {
            _updatePlayerEstimateViewV2(player, 0);
        };
    });
    
};

function startInitialTrial() {
    /*
    Start a new estimation trial.
    */
    console.log("Starting the initial trial");
    // Set the Image
    imageContainer.src = gameState.images.trialImages['trialImage0' + trialNumber].path;
    estimationTimeStart = new Date();
};

function startNextTrial() {
    /*
    Start a new estimation trial.
    */
    resetTrialParams();
    console.log("Starting a new trial");
    // Set the Image
    imageContainer.src = gameState.images.trialImages['trialImage0' + trialNumber].path;
    estimationTimeStart = new Date();
};

function trialsComplete() {
    /*
    Show the finish screen.
    */
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    finishScreen.style.display = 'block';
    endSession();
}


// --------------------------------------------------------------------------------------
//   Handle Events triggered by MPLIB
//   These callback functions are required, but the contents can be empty and left inconsequential  
//   (note: all timestamps are server-side expressed in milliseconds since the Unix Epoch)
// --------------------------------------------------------------------------------------
// Function to receive state changes from Firebase
function receiveStateChange(pathNow, nodeName, newState, typeChange ) {
    console.log("State change received");
    console.log("pathNow", pathNow);
    console.log("nodeName", nodeName);
    console.log("New state", newState);
    console.log("type change", typeChange);
    console.log("Number of Estimates", numberOfEstimates);
    console.log("Current Game State");
    console.log(gameState);

    

    if (pathNow == "players") {
        let player = nodeName;
        gameState.players[player] = newState;
        if (_ensureOtherPlayerEstimateIsValid(player)) {
            _updatePlayerEstimateViewV2(player, 1);
            numberOfEstimates++;
        };

        if (numberOfEstimates == getNumberCurrentPlayers()) {
            trialNumber++;
            if (trialNumber > NumberOfImages) {
                setTimeout(trialsComplete, 3000);
            } else {
                setTimeout(startNextTrial, 3000);
                console.log("Timeout waited 5 seconds");
                //sleep 3 seconds
                //get the next image
                //load image
                //start trial
                console.log("all players have submitted an estimate");
            }
        } else {
            console.log("Still waiting for players");
        }
    } else if (pathNow == "images") {
        //console.log()
        gameState.images.trialImages = newState;
        console.log("Current Game State");
        console.log(gameState);
        startInitialTrial();
        //imageContainer.src = gameState.images.trialImages['trialImage01'].path;
        //trialNumber = gameState.image.trial + 1;
    }
}


function evaluateUpdate( path, state, action, actionArgs ) {
    let isAllowed = false;
    let newState = null;

    if ((action === 'initialize') && ((state === null))) {
        isAllowed = true;
        newState = actionArgs;
    }

    console.log("Initial State");
    console.log(state);
    console.log("Initial actionArgs");
    console.log(actionArgs);

    let actionResult = { isAllowed, newState };
    return actionResult;
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

function startSession(sessionInfo) {
    /*
        Funtionality to invoke when starting a session.

        This function does the following:
            - Displays the game screen
            - Logs the start of the game with the session ID and timestamp
            - Displays a "game started" message
            - Starts a new game
    */
    // Assign playerUniqueID
    // sessinoInfo.playerID
    /*playerUniqueID = sessionInfo.playerId;
    playerIDsAll = sessionInfo.playerIds;
    console.log("all player IDs", playerIDsAll);
    playerNumber = sessionInfo.arrivalIndex;*/

    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    
    let playerId = getCurrentPlayerId(); // the playerId for this client
    let dateString = timeStr(getPlayerInfo( playerId ).sessionStartedAt);
    let str = `Started game with session id ${getSessionId()} with ${getNumberCurrentPlayers()} players at ${dateString}.`;
    myconsolelog( str );

    playerID.innerText = 1;
    //let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    //messageGame.innerHTML = str2;

    //thisSession = sessionInfo;
    allPlayerIDs = getCurrentPlayerIds();
    console.log("Session Starts here...", allPlayerIDs);
    newGame();
}

// This callback function is triggered when session is active, but number of players changes
function updateOngoingSession(sessionInfo) {    
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

function endSession( sessionInfo ) {
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
};


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