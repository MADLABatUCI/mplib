
// --------------------------------------------------------------------------------------
//    Code to demonstrate how MPLIB can be used for a multiplayer virtual world 
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
//       Session configuration
// -------------------------------------
// studyId is the name of the root node we create in the realtime database
export const studyId = 'virtualworld'; 

// Configuration setting for the session
export const sessionConfig = {
    minPlayersNeeded: 1, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 10, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: true, // Allow replacing any players who leave an ongoing session?
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
let cameraHeight = 1.6; // camera height
let angleOffset = 135; // angle needed for character to face in direction camera is looking 
let newScale = { x: 0.75, y: 0.75, z: 0.75 };

let id;

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

// -------------------------------------
//       Graphics handles
// -------------------------------------
let instructionsScreen = document.getElementById('instructionsScreen');
let waitingRoomScreen = document.getElementById('waitingRoomScreen');
let gameScreen = document.getElementById('gameScreen');
let messageWaitingRoom = document.getElementById('messageWaitingRoom');
let messageGame = document.getElementById('messageGame');
let messageFinish = document.getElementById('messageFinish');

let cameraEl = document.querySelector('#camera');
let characterNameEl = document.querySelector('#characterName');
let characterTextBackgroundEl = document.querySelector('#characterTextBackground');

let scene = document.querySelector('a-scene');


if (scene.hasLoaded) {
    showInstructions();
  } else {
    scene.addEventListener('loaded', showInstructions);
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
export function receiveStateChange(nodeName, newState, typeChange ) {
    // typeChange can be the following:
    //  'onChildChanged'
    //  'onChildAdded'
    //  'onChildRemoved'

    if (nodeName.startsWith("Player")) { // do we a player change?
        if (typeChange == 'onChildChanged') {
            if (nodeName != id) {
                updateCharacter( nodeName, newState.position, newState.rotation);
            } else {
                setCamera( newState.position, newState.rotation );
            }
                
        } else if (typeChange == 'onChildAdded') {
            if (nodeName != id) { 
                // we only add characters for other players. The player for this client has a first person perspective 
                // and does see itself
                addCharacter( nodeName, newState.position, newState.rotation );                
            } else {
                setCamera( newState.position, newState.rotation );
            }
        } else if (typeChange == 'onChildRemoved') {
            removeCharacter( nodeName );
        }
    }

    
}

// Function triggered by a call to "updateStateTransaction" to evaluate if the proposed action is valid
// If "updateStateTransaction" is not called, and all updates are done through "updateStateDirect", there is no 
// need for this function
export function evaluateUpdate( path, state, action, actionArgs ) {
    let isAllowed = false;
    let newState = null;

    // .... insert your code to update isAllowed and newState

    let evaluationResult = { isAllowed, newState };
    return evaluationResult;
}


//document.addEventListener('DOMContentLoaded', function () {
    
// --------------------------------------------------------------------------------------
//   Virtual world code using A-frame
// --------------------------------------------------------------------------------------

function addSelf( arrivalIndex ) {
    id = `Player${arrivalIndex}`;

    let position = { x: Math.random()*16-8, y:cameraHeight, z: Math.random()*16-8 };

    // Calculate rotation to face the origin
    let dx = position.x;
    let dz = position.z;
    let rotationY = Math.atan2(dz, dx) * (180 / Math.PI); // Convert to degrees
    let rotation = { x: 0, y: rotationY + 90, z: 0 }; // Adjust rotation to face the origin

    // Send this new player position to firebase
    let newState = { position, rotation };
    updateStateDirect( id, newState);
} 

function updateCharacter(id, position, rotation) {
    let character = document.querySelector(`#${id}`);
    if (character) {
        character.setAttribute('position', `${position.x} ${position.y - cameraHeight} ${position.z}`);
        character.object3D.rotation.x = rotation.x;
        character.object3D.rotation.y = rotation.y - angleOffset;
        character.object3D.rotation.z = rotation.z;
        //character.setAttribute('rotation', `${rotation.x} ${rotation.y + 180} ${rotation.z}`);
    } else {
        console.error(`Character with id ${id} not found`);
    }
}

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
    newCharacter.addEventListener('mouseenter', showCharacterName);
    newCharacter.addEventListener('mouseleave', hideCharacterName);
    scene.appendChild(newCharacter);
}

function removeCharacter(id) {
    let character = document.querySelector(`#${id}`);
    if (character) {
        character.parentNode.removeChild(character);
    } else {
        console.error(`Character with id ${id} not found`);
    }
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



document.addEventListener('keydown', function(event) {
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
});

function moveCamera(direction) {
    let cameraPosition = cameraEl.object3D.position;
    let cameraRotation = cameraEl.object3D.rotation;

    let moveDistance = 0.1;
    let moveVector = new THREE.Vector3();

    if (direction === 'forward') {
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
    let newState = { position: { x:cameraPosition.x,y:cameraPosition.y,z:cameraPosition.z }, rotation: { x:cameraRotation.x,y:cameraRotation.y,z:cameraRotation.z }};
    updateStateDirect( id, newState);
}

function rotateCamera(direction) {
    let cameraPosition = cameraEl.object3D.position;
    let cameraRotation = cameraEl.object3D.rotation;
    let rotationAmount = 0.02; // Adjust the rotation speed as needed

    if (direction === 'left') {
        cameraRotation.y += rotationAmount;
    } else if (direction === 'right') {
        cameraRotation.y -= rotationAmount;
    }

    // Send this new player position to firebase
    let newState = { position: { x:cameraPosition.x,y:cameraPosition.y,z:cameraPosition.z }, rotation: { x:cameraRotation.x,y:cameraRotation.y,z:cameraRotation.z }};
    updateStateDirect( id, newState);
}

function setCamera( cameraPosition, cameraRotation ) {
    cameraEl.setAttribute('position', cameraPosition);
    cameraEl.object3D.rotation.set(cameraRotation.x, cameraRotation.y, cameraRotation.z);
    requestAnimationFrame(tick);
}

function tick() {
    requestAnimationFrame(tick);
}


function showInstructions() {
    instructionsScreen.style.display = 'block';
}
  
// --------------------------------------------------------------------------------------
//   Handle waiting room and session events triggered by MPLIB
//   These callback functions are required, but the contents can be empty and left inconsequential  
//   (note: all timestamps are server-side expressed in milliseconds since the Unix Epoch)
// --------------------------------------------------------------------------------------

// This callback function is triggered when a waiting room starts
export function joinedWaitingRoom(sessionInfo) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'block';

    let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
    let numPlayers = sessionInfo.numPlayers;
    let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;

    messageWaitingRoom.innerText = str2;
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
}

// This callback function is triggered when the session starts (when enough players have gathered, or when only a single player is needed)
export function startSession(sessionInfo) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    scene.style.visibility = 'visible';
    scene.style.display = 'block';

    leaveButton.style.display = 'block';
    
    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    //messageGame.innerHTML = str2;

    // Add this player's avatar 
    addSelf( sessionInfo.arrivalIndex ); 

    tick();
}

// This callback function is triggered when session is active, but number of players changes
export function updateSession(sessionInfo) {    
    let dateString = timeStr(sessionInfo.sessionStartedAt);
    let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
    myconsolelog( str );

    let str2 = `<p>The game has started...</p><p>Number of players: ${ sessionInfo.numPlayers}</p><p>Session ID: ${ sessionInfo.sessionId}$</p>`;
    //messageGame.innerHTML = str2;
}

export function endSession( sessionInfo ) {
    instructionsScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    finishScreen.style.display = 'block';

    scene.style.visibility = 'hidden';
    scene.style.display = 'none';

    leaveButton.style.display = 'none';

    if (sessionInfo.sessionErrorCode != 0) {
        messageFinish.innerHTML = `<p>Session ended abnormally. Reason: ${sessionInfo.sessionErrorMsg}</p>`;
    } else {
        messageFinish.innerHTML = `<p>You have completed the session.</p>`;
    }
    
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