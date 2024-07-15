
// --------------------------------------------------------------------------------------
//    Code to demonstrate how MPLIB can be used for a multiplayer virtual world 
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
    getCurrentPlayerArrivalIndex,getSessionId,anyPlayerTerminatedAbnormally,getSessionError,getWaitRoomInfo,
    isBrowserCompatible
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
let info = document.getElementById('info');
let cameraEl = document.querySelector('#camera');
let characterNameEl = document.querySelector('#characterName');
let characterTextBackgroundEl = document.querySelector('#characterTextBackground');
let scene = document.querySelector('a-scene');

// -------------------------------------
//       Session configuration
// -------------------------------------
// studyId is the name of the root node we create in the realtime database
const studyId = 'virtualworld'; 

// Configuration setting for the session
let sessionConfig = {
    minPlayersNeeded: 1, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 10, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: true, // Allow replacing any players who leave an ongoing session?
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
    removePlayerStateFunction: removePlayerState
};

// List the node names where we place listeners for any changes to the children of these nodes; set to '' if listening to changes for children of the root
let listenerPaths = [ 'players' ];

// Set the session parameters and callback functions for MPLIB
initializeMPLIB( sessionConfig , studyId , funList, listenerPaths, verbosity );

// -------------------------------------
//       Globals
// -------------------------------------
let moveDistance = 0.04; // step distance
let rotationAmount = 0.02; // Adjust the rotation speed as needed

let cameraHeight = 1.6; // camera height
let angleOffset = 135; // angle needed for character to face in direction camera is looking 
let newScale = { x: 0.75, y: 0.75, z: 0.75 };

let id;
let si;

let climits = {
    minX: -10,
    maxX: 10,
    minY: 1.6,
    maxY: 1.7,
    minZ: -10,
    maxZ: 10
};

//let previousPosition = new AFRAME.THREE.Vector3();
//let previousRotation = new AFRAME.THREE.Euler();


if (isBrowserCompatible()) {
    if (scene.hasLoaded) {
        showInstructions();
    } else {
        scene.addEventListener('loaded', showInstructions);
    }
}

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

    if (pathNow == 'players') { // do we have a player change?
        if (typeChange == 'onChildChanged') {
            if (nodeName != id) {
                updateCharacter( nodeName, newState.position, newState.rotation, newState.direction );
            } else {
                setCamera( newState.position, newState.rotation );
            }
                
        } else if (typeChange == 'onChildAdded') {
            if (nodeName != id) { 
                // we only add characters for other players. The player for this client has a first person perspective 
                // and does see itself
                addCharacter( nodeName, newState.position, newState.rotation, newState.direction );                
            } else {
                setCamera( newState.position, newState.rotation );
            }
        } else if (typeChange == 'onChildRemoved') {
            removeCharacter( nodeName );
        }
    }

    
}

// Function triggered when this client closes the window and the player needs to be removed from the state 
function removePlayerState() {
    // Send a null state to this player in the database, which removes the database entry
    let newState = null;
    let path = `players/${id}`;
    updateStateDirect( path, newState);
}

// --------------------------------------------------------------------------------------
//   Virtual world code using A-frame
// --------------------------------------------------------------------------------------


function addSelf() {
    id = `player${ getCurrentPlayerArrivalIndex() }`;

    let radius = 8;
    let angle = Math.random() * 2 * Math.PI;
    //let angle = 0.25 * Math.PI;

    let position = { x: Math.sin( angle )*radius, y:cameraHeight, z: Math.cos(angle)*radius };

    // Calculate rotation to face the origin
    let rotationY = angle; // +  Math.PI; // Angle should be expressed in radians
    let rotation = { x: 0, y: rotationY , z: 0 }; // Adjust rotation to face the origin

    let direction = 'idle';

    //console.log( `position=${position.x},${position.y},${position.z}` );
    //console.log( `rotation=${rotation.x},${rotation.y},${rotation.z}` );


    // Send this new player position to firebase
    let newState = { position, rotation, direction };
    let path = `players/${id}`;
    updateStateDirect( path, newState);
} 


/*
function addSelf(arrivalIndex) {
    id = `Player${arrivalIndex}`;

    // Generate a random position
    const position = new THREE.Vector3(Math.random() * 16 - 8, cameraHeight, Math.random() * 16 - 8);

    // Calculate the direction vector from the position to the origin
    const origin = new THREE.Vector3(0, cameraHeight, 0);
    const directionVector = origin.clone().sub(position).normalize();

    // Create a quaternion to represent the rotation
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), directionVector);

    // Convert the quaternion to Euler angles
    const rotation = new THREE.Euler().setFromQuaternion(quaternion);

    const direction = 'idle';

    // Send this new player position to Firebase
    const newState = { 
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
        direction 
    };

    updateStateDirect(id, newState);
}
*/

let updateTimeouts = {};

function updateCharacter(id, position, rotation, direction ) {
    let character = document.querySelector(`#${id}`);
    if (character) {
        character.setAttribute('position', `${position.x} ${position.y - cameraHeight} ${position.z}`);
        character.object3D.rotation.x = rotation.x;
        character.object3D.rotation.y = rotation.y - angleOffset;
        character.object3D.rotation.z = rotation.z;

        if (direction=='backward') {
            character.object3D.rotation.y += Math.PI; 
        }

        if ((direction=='forward') || (direction=='backward')) {
            character.setAttribute('animation-mixer', 'clip: Walk');

            // Clear any existing timeout for this character
            if (updateTimeouts[id]) {
                clearTimeout(updateTimeouts[id]);
            }

            // Set a new timeout to change the animation to "Idle" after 0.2 seconds
            updateTimeouts[id] = setTimeout(() => {
                character.setAttribute('animation-mixer', 'clip: Idle');
            }, 200);
        }
        
    } else {
        console.error(`Character with id ${id} not found`);
    }
}

/*
function updateCharacter(id, position, rotation) {
    let character = document.querySelector(`#${id}`);
    if (character) {
        character.setAttribute('position', `${position.x} ${position.y - cameraHeight} ${position.z}`);
        character.object3D.rotation.x = rotation.x;
        character.object3D.rotation.y = rotation.y - angleOffset;
        character.object3D.rotation.z = rotation.z;
        character.setAttribute('animation-mixer', 'clip: Walk');
        //character.setAttribute('rotation', `${rotation.x} ${rotation.y + 180} ${rotation.z}`);
    } else {
        console.error(`Character with id ${id} not found`);
    }
}
*/

function addCharacter(id, newPosition, newRotation  ) {
    newPosition.y -= cameraHeight;

    let newCharacter = document.createElement('a-entity');
    newCharacter.setAttribute('gltf-model', '#characterModel');
    newCharacter.setAttribute('id', id);
    newCharacter.setAttribute('position', newPosition);
    newCharacter.setAttribute('scale', newScale );
    //newCharacter.setAttribute('rotation', newRotation );
    newCharacter.object3D.rotation.x = newRotation.x;
    newCharacter.object3D.rotation.y = newRotation.y - angleOffset;
    newCharacter.object3D.rotation.z = newRotation.z;

    //newCharacter.setAttribute('animation-mixer', 'clip: Walk');
    newCharacter.setAttribute('animation-mixer', 'clip: Idle');

    newCharacter.addEventListener('mouseenter', showCharacterName);
    newCharacter.addEventListener('mouseleave', hideCharacterName);
    scene.appendChild(newCharacter);
}

function removeCharacter(id) {
    let character = document.querySelector(`#${id}`);
    if (character) {
        character.parentNode.removeChild(character);
    };// else {
    //    console.error(`Character with id ${id} not found`);
    //}
}

function showCharacterName(event) {
    let name = event.target.getAttribute('id');
    let position = event.target.getAttribute('position');
    characterNameEl.setAttribute('value', name);
    let textPosition = { x: position.x, y: position.y + 2.5, z: position.z };
    characterNameEl.setAttribute('position', textPosition);
    characterNameEl.setAttribute('visible', 'true');
    characterTextBackgroundEl.setAttribute('position', textPosition);
    characterTextBackgroundEl.setAttribute('visible', 'true');
}

function hideCharacterName() {
    characterNameEl.setAttribute('visible', 'false');
    characterTextBackgroundEl.setAttribute('visible', 'false');
}



// Define the function separately
function handleKeyDown(event) {
    switch(event.code) {
        case 'ArrowUp':
            moveCamera('forward');
            break;
        case 'ArrowDown':
            moveCamera('backward');
            break;
        case 'ArrowLeft':
            rotateCamera('left');
            break;
        case 'ArrowRight':
            rotateCamera('right');
            break;
    }
}

function moveCamera(direction) {
    let cameraPosition = cameraEl.object3D.position;
    let cameraRotation = cameraEl.object3D.rotation;

    let moveVector = new THREE.Vector3();

    if ((direction === 'forward') || (direction == 'idle')) {
        moveVector.setFromMatrixColumn(cameraEl.object3D.matrix, 0);
        moveVector.crossVectors(cameraEl.object3D.up, moveVector);
        cameraPosition.add(moveVector.multiplyScalar(moveDistance));
    } else if (direction === 'backward') {
        moveVector.setFromMatrixColumn(cameraEl.object3D.matrix, 0);
        moveVector.crossVectors(cameraEl.object3D.up, moveVector);
        cameraPosition.add(moveVector.multiplyScalar(-moveDistance));
    }

    
    cameraPosition.x = Math.min(Math.max(cameraPosition.x, climits.minX), climits.maxX);
    cameraPosition.y = Math.min(Math.max(cameraPosition.y, climits.minY), climits.maxY);
    cameraPosition.z = Math.min(Math.max(cameraPosition.z, climits.minZ), climits.maxZ);

    // Send this new player position to firebase
    let newState = { position: { x:cameraPosition.x,y:cameraPosition.y,z:cameraPosition.z }, rotation: { x:cameraRotation.x,y:cameraRotation.y,z:cameraRotation.z },
                     direction };
    let path = `players/${id}`;
    updateStateDirect( path, newState);
}

function rotateCamera(direction) {
    let cameraPosition = cameraEl.object3D.position;
    let cameraRotation = cameraEl.object3D.rotation;
    

    if (direction === 'left') {
        cameraRotation.y += rotationAmount;
    } else if (direction === 'right') {
        cameraRotation.y -= rotationAmount;
    }

    // Send this new player position to firebase
    let newState = { position: { x:cameraPosition.x,y:cameraPosition.y,z:cameraPosition.z }, rotation: { x:cameraRotation.x,y:cameraRotation.y,z:cameraRotation.z },
                     direction };
    let path = `players/${id}`;
    updateStateDirect( path, newState);
}

function setCamera( cameraPosition, cameraRotation ) {
    cameraEl.setAttribute('position', cameraPosition);
    cameraEl.object3D.rotation.set(cameraRotation.x, cameraRotation.y, cameraRotation.z);
    //console.log( `rotation=${cameraRotation.x},${cameraRotation.y},${cameraRotation.z}` );
    requestAnimationFrame(tick);
}

function tick() {
    requestAnimationFrame(tick);
}


function showInstructions() {
    instructionsScreen.style.display = 'block';
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
            - Display the scene
            - Logs the start of the game with the session ID and timestamp
            - Start an event listener for key presses that control the avatar
            - Add client player (this user) avatar
            - Tell the client which player they are
            - Starts a new game
    */

    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    scene.style.visibility = 'visible';
    scene.style.display = 'block';
    info.style.display = 'block';
    
    let playerId = getCurrentPlayerId(); // the playerId for this client
    let dateString = timeStr(getPlayerInfo( playerId ).sessionStartedAt);
    let str = `Started game with session id ${getSessionId()} with ${getNumberCurrentPlayers()} players at ${dateString}.`;
    myconsolelog( str );
    
    // Add the event listener for key presses
    document.addEventListener('keydown', handleKeyDown);

    // Add this player's avatar 
    addSelf(); 

    let str2 = `You are: ${id}`;
    messageGame.innerHTML = str2;

    tick();
}

function updateOngoingSession(sessionInfo) {
    /*
        Functionality to invoke when updating an ongoing session.

        This function is currently empty.
    */
}

function endSession(sessionInfo) {
    /*
        Functionality to invoke when ending a session.

        This function does the following:
            - Displays the finish screen (hides all other divs)
            - Hide and disable the scene
            - Remove the keypress event listener
            - Checks if any players terminated their session abnormally
                - If so, an "abnormal termination" message is created
                - If not, then the session completed normally
            - Displays a message based on the termination status [normal, abnormal]
    */
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    finishScreen.style.display = 'block';
    scene.style.visibility = 'hidden';
    scene.style.display = 'none';
    info.style.display = 'none';

    // Remove the event listener
    document.removeEventListener('keydown', handleKeyDown);

    let err = getSessionError();

    if (err.errorCode == 1) {
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