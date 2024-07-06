// --------------------------------------------------------------------------------------
//    Two-player pong
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
const studyId = 'pong'; 
// Configuration setting for the session
const sessionConfig = {
    minPlayersNeeded: 2, // Minimum number of players needed; if set to 1, there is no waiting room (unless a countdown has been setup)
    maxPlayersNeeded: 2, // Maximum number of players allowed in a session
    maxParallelSessions: 0, // Maximum number of sessions in parallel (if zero, there are no limit)
    allowReplacements: true, // Allow replacing any players who leave an ongoing session?
    exitDelayWaitingRoom: 0, // Number of countdown seconds before leaving waiting room (if zero, player leaves waiting room immediately)
    maxDurationBelowMinPlayersNeeded: 10, // Number of seconds to continue an active session even though there are fewer than the minimum number of players (if set to zero, session terminates immediately)
    maxHoursSession: 0, // Maximum hours where additional players are still allowed to be added to session (if zero, there is no time limit)
    recordData: false // Record all data?  
};
const verbosity = 2;

// Allow URL parameters to update these default parameters
//updateConfigFromUrl( sessionConfig );

// List names of the callback functions that are used in this code (so MPLIB knows which functions to trigger)
let funList = { 
    sessionChangeFunction: sessionChange,
    receiveStateChangeFunction: receiveStateChange,
};

// Set the session configuration for MPLIB
initializeMPLIB( sessionConfig , studyId , funList, verbosity );

// -------------------------------------
//       Globals
// -------------------------------------
let arrivalIndex;

let fps = 30; // Set the desired framerate here

// Allow updating of some game settings by URL parameters
let value = getURLParameterByName('fps');
if (value !== null) fps = value;
console.log(`FPS = ${fps}`);

let timerId;
let useCursorKeys = false;

const playerWidth = 20;
const playerHeight = 70;
const ballSize = 15;
const maxHorizontalMovement = 300;
const paddleSpeed = 20; // Constant for paddle movement speed

let canvasWidth  = 700;
let canvasHeight = 400;
let animations = [];

let player1Y = canvasHeight / 2 - playerHeight / 2;
let player1X = 0;
let player2Y = canvasHeight / 2 - playerHeight / 2;
let player2X = canvasWidth - playerWidth;
let player1Score = 0;
let player2Score = 0;
let player1XSpeed = 0;
let player2XSpeed = 0;
let oldPlayer1X = player1X;
let oldPlayer1Y = player1Y;
let oldPlayer2X = player2X;
let oldPlayer2Y = player2Y;

let ballX = canvasWidth / 2;
let ballY = Math.random() * canvasHeight; // Random vertical starting point
let minBallSpeedInit = 200.0 / fps;
let maxBallSpeedInit = 300 / fps;
let maxBallSpeedTot  = 400 / fps;

let ballSpeedX = minBallSpeedInit;
let ballSpeedY = minBallSpeedInit;
let oldBallX = ballX;
let oldBallY = ballY;

let delayResetBall = 1000;
let doResetBall = false;

// -------------------------------------
//       Graphics handles
// -------------------------------------
let instructionsScreen = document.getElementById('instructionsScreen');
let waitingRoomScreen = document.getElementById('waitingRoomScreen');
let gameScreen = document.getElementById('gameScreen');
let messageWaitingRoom = document.getElementById('messageWaitingRoom');
let messageGame = document.getElementById('messageGame');
let messageFinish = document.getElementById('messageFinish');
let instructionsText = document.getElementById('instructionText');

const canvas = document.getElementById("pongCanvas");
const ctx = canvas.getContext("2d");

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



if (useCursorKeys) {
    document.addEventListener("keydown", movePlayerCursorKeys);
} else {
    // Hide the cursor in the canvas
    canvas.style.cursor = "none";

    // Add event listener for mouse move on the canvas
    canvas.addEventListener('mousemove', movePlayerMouse);
}



// -------------------------------------
//       Pong Code
// -------------------------------------

// Set up correct instructions
instructionsText.innerHTML = `<p>This game demonstrates how to use the MPLIB library for a two-player pong game. Use the ${ useCursorKeys ? 'cursor keys' : 'mouse'} 
to move your paddle up and down as well as sideways.</p><p>Open up this link at different browser tabs to simulate different players</p>`;

function gameLoop() {
    // If this client has control, it can update the ball position
    if ((doResetBall==false)) {
        updateBallPosition();
    }

    // Update animations
    animations.forEach((frame, index) => {
        frame.radius += 2;
        frame.alpha -= 0.05;
        if (frame.alpha <= 0) {
            animations.splice(index, 1); // Remove completed animations
        }
    });
    
    draw();
}

// Function that is triggered by a mouse move event on the canvas
function movePlayerMouse(e) {
    const rect = canvas.getBoundingClientRect(); // Get the canvas position relative to the viewport
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
 
    let maxX;
    let minX;
    let path;
    let currentX;
    let currentY;

    // if this Client arrived first in the session, this will be player 1, and player 2 otherwise
    if (arrivalIndex == 2) { 
        currentY = player1Y;
        currentX = player1X;
        minX = 0;
        maxX = maxHorizontalMovement - playerWidth;
        path = 'p1';
    } else {        
        currentY = player2Y;
        currentX = player2X;
        minX = canvasWidth - maxHorizontalMovement;
        maxX = canvasWidth - playerWidth;
        path = 'p2';
    }

    // Damping factor (between 0 and 1), lower values slow down the movement
    const dampingFactor = 1.0;

    // Interpolate between the current position and the mouse position
    let newPlayerX = currentX + (mouseX - currentX) * dampingFactor;
    let newPlayerY = currentY + (mouseY - currentY) * dampingFactor;

    // Constrain the new position to the player movement bounds
    newPlayerX = Math.max(minX, Math.min(maxX, newPlayerX));
    newPlayerY = Math.max(0, Math.min(canvasHeight - playerHeight, newPlayerY));

    // Round the player location up to first decimal to lower data storage
    newPlayerX = roundDecimal( newPlayerX , 1 );
    newPlayerY = roundDecimal( newPlayerY , 1 );

    // Send this new player position to firebase
    let newState = { x: newPlayerX, y: newPlayerY };
    updateStateDirect(path, newState);
}


// function that is triggered by a button press on client
function movePlayerCursorKeys(e) {
    const key = e.key;
 
    let newPlayerX;
    let newPlayerY;
    let maxX;
    let minX;
    let path;
    // if this Client arrived first in the session, this will be player 1, and player 2 otherwise
    if (arrivalIndex == 2) { 
        newPlayerY = player1Y;
        newPlayerX = player1X;
        minX = 0;
        maxX = maxHorizontalMovement - playerWidth;
        path = 'p1';
    } else {        
        newPlayerY = player2Y;
        newPlayerX = player2X;
        minX = canvasWidth - maxHorizontalMovement;
        maxX = canvasWidth - playerWidth;
        path = 'p2';
    }

    if (key === "ArrowUp" && newPlayerY > 0) newPlayerY -= paddleSpeed;
    if (key === "ArrowDown" && newPlayerY < canvasHeight - playerHeight) newPlayerY += paddleSpeed;
    if (key === "ArrowLeft" && newPlayerX > minX) newPlayerX -= paddleSpeed;
    if (key === "ArrowRight" && newPlayerX < maxX) newPlayerX += paddleSpeed;
  
    // Round the player location up to first decimal to lower data storage
    newPlayerX = roundDecimal( newPlayerX , 1 );
    newPlayerY = roundDecimal( newPlayerY , 1 );

    // Send this new player position to firebase
    let newState = { x: newPlayerX, y: newPlayerY };
    updateStateDirect(path, newState);
}


function updateBallPosition() {
    // In this function, the client that has control will calculate a new ball position, and then send this 
    // new position to all connected players (including the client who sent the position)
    let newBallX = ballX;
    let newBallY = ballY;

    let newBallSpeedX = ballSpeedX;
    let newBallSpeedY = ballSpeedY;

    newBallX += newBallSpeedX;
    newBallY += newBallSpeedY;

    // Round the ball location up to first decimal to lower data storage
    newBallX = roundDecimal( newBallX , 1 );
    newBallY = roundDecimal( newBallY , 1 );
    newBallSpeedX = roundDecimal( newBallSpeedX , 1 );
    newBallSpeedY = roundDecimal( newBallSpeedY , 1 );

    let sameTrajectory = true;

    // Check if it hit the paddle of player 1
    if (checkHit( player1X, player1Y, newBallX, newBallY) || 
        doIntersect( player1X+playerWidth,player1Y,player1X+playerWidth,player1Y+playerHeight,  oldBallX,oldBallY,newBallX,newBallY) ||
        inSquare( oldPlayer1X,oldPlayer1Y, player1X+playerWidth,player1Y+playerHeight,newBallX,newBallY)) {
        // Ball hit player 1 paddle
        newBallX = player1X + playerWidth + 1 + ballSize;
        newBallSpeedX = Math.abs( newBallSpeedX ) + player1XSpeed;
        if (newBallSpeedX > maxBallSpeedTot) newBallSpeedX = maxBallSpeedTot;
        sameTrajectory = false;
    } // Check if it hit the paddle of player 2
       else if (checkHit( player2X, player2Y, newBallX, newBallY) || 
               doIntersect( player2X,player2Y,player2X,player2Y+playerHeight,  oldBallX,oldBallY,newBallX,newBallY) ||
               inSquare( oldPlayer2X,oldPlayer2Y, player2X+playerWidth,player2Y+playerHeight,newBallX,newBallY))  {
        // Ball hit player 2 paddle
        newBallX = player2X - 1 - ballSize;
        newBallSpeedX = -Math.abs( newBallSpeedX ) - player2XSpeed;
        if (newBallSpeedX < -maxBallSpeedTot) newBallSpeedX = -maxBallSpeedTot;
        sameTrajectory = false;
    } else
    {
        // Check if it hit the lower or upper walls
        if (newBallY <= 0 || newBallY >= canvasHeight) {
            newBallY -= newBallSpeedY;
            newBallSpeedY = -newBallSpeedY;
            sameTrajectory = false;
        } else {
            // Check if the ball has passed the left or right side
            if (newBallX < 0) { 
                // Send message that backwall was hit
                updateStateDirect( 'hb' , { x: newBallX, y: newBallY } );

                // Update score of player 2
                let newScore = player2Score + 1;
                let path = 's2';
                let newState = { score: newScore };
                updateStateDirect(path, newState);

                // reset ball
                doResetBall = true;
                sameTrajectory = false;
            }

            if (newBallX > canvasWidth) {
                // Send message that backwall was hit
                updateStateDirect( 'hb' , { x: newBallX, y: newBallY } );

                // Update score of player 1
                let newScore = player1Score + 1;
                let path = 's1';
                let newState = { score: newScore };
                updateStateDirect(path, newState);
          
                doResetBall = true;
                sameTrajectory = false;
            }

            if ((doResetBall) && (hasControl)) {
                // Send this new ball position to all players
                let path = 'b'; let newState = { x: newBallX, y: newBallY, sx: newBallSpeedX, sy: newBallSpeedY, r: doResetBall };
                updateStateDirect(path, newState);
                
                setTimeout(function() {
                    // reset ball
                    let np = resetBall();
                    newBallX = np.newX; newBallY = np.newY; newBallSpeedX = np.newSpeedX; newBallSpeedY = np.newSpeedY;

                    // Send this new ball position to all players
                    doResetBall = false;
                    let path = 'b'; let newState = { x: newBallX, y: newBallY, sx: newBallSpeedX, sy: newBallSpeedY, r: doResetBall };
                    updateStateDirect(path, newState);

                    
                }, delayResetBall );
            }
        }

    }

    if (doResetBall == false) {
        // Send this new ball position to all players
       let path = 'b'; let newState = { x: newBallX, y: newBallY, sx: newBallSpeedX, sy: newBallSpeedY, r: doResetBall };

       // Update the state with the new ball position. The flag "sametrajectory" is used to skip the saving of the ball position to  
       // the saved data if the ball is continuing on a straight path. This saves space in the event stream 
       if (hasControl) updateStateDirect(path, newState, sameTrajectory );
       
    }
    
    
}

function checkHit( x,y, bx, by) {
    let hit = false;
    if (inSquare(x,y,x+playerWidth,y+playerHeight,bx,by) 
     || inSquare(x,y,x+playerWidth,y+playerHeight,bx+ballSize,by) 
     || inSquare(x,y,x+playerWidth,y+playerHeight,bx,by+ballSize) 
     || inSquare(x,y,x+playerWidth,y+playerHeight,bx-ballSize,by) 
     || inSquare(x,y,x+playerWidth,y+playerHeight,bx,by-ballSize)) hit = true;
    return hit;
}

function inSquare(x1,y1,x2,y2,bx,by) {
    let inS = false;

    let temp = x2;
    if (x1 > x2) {
        x2 = x1;
        x1 = temp;
    }
    temp = y2;
    if (y1 > y2) {
        y2 = y1;
        y1 = temp;
    }

    if (( bx >= x1) && ( bx <= x2) && (by >= y1) && (by <= y2)) inS = true;
    return inS;
}

function doIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    // Determine if a line segment (x1,y1,x2,y2) intersects with line segment (x3,y3,x4,y4)

    // Helper function to calculate orientation
    function orientation(xp, yp, xq, yq, xr, yr) {
        const val = (yq - yp) * (xr - xq) - (xq - xp) * (yr - yq);
        if (val === 0) return 0;  // collinear
        return (val > 0) ? 1 : 2; // clock or counterclock wise
    }

    // Helper function to check if point (xq, yq) lies on line segment pr
    function onSegment(xp, yp, xq, yq, xr, yr) {
        if (xq <= Math.max(xp, xr) && xq >= Math.min(xp, xr) &&
            yq <= Math.max(yp, yr) && yq >= Math.min(yp, yr)) {
            return true;
        }
        return false;
    }

    // Find the four orientations needed for general and special cases
    const o1 = orientation(x1, y1, x2, y2, x3, y3);
    const o2 = orientation(x1, y1, x2, y2, x4, y4);
    const o3 = orientation(x3, y3, x4, y4, x1, y1);
    const o4 = orientation(x3, y3, x4, y4, x2, y2);

    // General case
    if (o1 !== o2 && o3 !== o4) {
        return true;
    }

    // Special cases
    // S1 and S2 are collinear and x3 lies on segment S1
    if (o1 === 0 && onSegment(x1, y1, x3, y3, x2, y2)) return true;
    // S1 and S2 are collinear and x4 lies on segment S1
    if (o2 === 0 && onSegment(x1, y1, x4, y4, x2, y2)) return true;
    // S1 and S2 are collinear and x1 lies on segment S2
    if (o3 === 0 && onSegment(x3, y3, x1, y1, x4, y4)) return true;
    // S1 and S2 are collinear and x2 lies on segment S2
    if (o4 === 0 && onSegment(x3, y3, x2, y2, x4, y4)) return true;

    // Doesn't fall in any of the above cases
    return false;
}

function drawAnimations() {
    animations.forEach(frame => {
        ctx.fillStyle = frame.color.replace('1)', `${frame.alpha})`); // Update alpha
        ctx.beginPath();
        ctx.arc(frame.x, frame.y, frame.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    });
}

function draw() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawMidline();
    drawRect(player1X, player1Y, playerWidth, playerHeight);
    drawRect(player2X, player2Y, playerWidth, playerHeight);

    if ((ballX > 0) && (ballX < canvasWidth)) drawBall(ballX, ballY, ballSize);
    drawAnimations(); // Draw animations after other elements
}

function drawRect(x, y, width, height) {
    ctx.fillStyle = '#FFD700'; // Yellowish color
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x, y, width, height);
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
}

function drawBall(x, y, size) {
    ctx.fillStyle = ctx.createRadialGradient(x, y, size / 4, x, y, size);
    ctx.fillStyle.addColorStop(0, '#ff6347');
    ctx.fillStyle.addColorStop(1, '#e55342');
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
}

function drawMidline() {
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([5, 15]);
    ctx.beginPath();
    ctx.moveTo(canvasWidth / 2, 0);
    ctx.lineTo(canvasWidth / 2, canvasHeight);
    ctx.stroke();
    ctx.setLineDash([]);
}


function resetBall() {
    let newX = canvasWidth / 2;
    let newY = Math.random() * canvasHeight; // Random vertical starting point
    let newSpeedX = ( Math.random()*(maxBallSpeedInit-minBallSpeedInit) + minBallSpeedInit) * (Math.random() < 0.5 ? 1 : -1);
    let newSpeedY = ( Math.random()*(maxBallSpeedInit-minBallSpeedInit) + minBallSpeedInit) * (Math.random() < 0.5 ? 1 : -1);

    newX = roundDecimal( newX , 1 );
    newY = roundDecimal( newY , 1 );
    newSpeedX = roundDecimal( newSpeedX , 1 );
    newSpeedY = roundDecimal( newSpeedY , 1 );

    return { newX , newY, newSpeedX, newSpeedY };
}


function createAnimation(x, y, color) {
    animations.push({ x, y, radius: 0, alpha: 1, color });
}

// -------------------------------------------------------------------------------------
//   Handle state-related events triggered by MPLIB 
// -------------------------------------------------------------------------------------

// This callback function is triggered by any change in the game state accepted by MPLIB. 
// Note that the state change can occur in any of the clients connected in the session 
// typeChange can take on the following values:
// 'onChildChanged'  This event is triggered any time a child node is modified. This includes any modifications to descendants of the child node. 
// 'onChildAdded'    This event is triggered for each existing child and then every time a new child is added 
// 'onChildRemoved'  This event is triggered when an immediate child is removed
function receiveStateChange( nodeName, state, typeChange ) {
    //myconsolelog( 'typeChange = ' + typeChange );
    if (nodeName == 'p1') {    
        oldPlayer1X = player1X;
        oldPlayer1Y = player1Y;
        player1X = state.x;
        player1Y = state.y;
        player1XSpeed = Math.abs( oldPlayer1X - player1X );
    } else if (nodeName == 'p2') {
        oldPlayer2X = player2X;
        oldPlayer2Y = player2Y;
        player2X = state.x;
        player2Y = state.y;
        player2XSpeed = Math.abs( oldPlayer2X - player2X );
    } else if (nodeName == 'b') {
        oldBallX = ballX;
        oldBallY = ballY;
        ballX = state.x;
        ballY = state.y;
        ballSpeedX = state.sx;
        ballSpeedY = state.sy;
        if (state.r) {
            oldBallX = ballX;
            oldBallY = ballY;
        }
        doResetBall = state.r;
    } else if (nodeName == 's1') {
        player1Score = state.score;
        document.getElementById("scorePlayer1").textContent = `Player 1: ${player1Score}`;
    } else if (nodeName == 's2') {
        player2Score = state.score;
        document.getElementById("scorePlayer2").textContent = `Player 2: ${player2Score}`;
    } else if (nodeName == 'hb') {
        createAnimation(state.x, state.y, 'rgba(255, 0, 0, 1)'); // Red for back wall hit
    }
}


// --------------------------------------------------------------------------------------
//   Handle any session change relating to the waiting room or ongoing session 
// --------------------------------------------------------------------------------------

// This callback function is triggered when a waiting room starts
function sessionChange(sessionInfo, typeChange) {
    // typeChange can be the following
    // 'joinedWaitingRoom'
    // 'updateWaitingRoom'
    // 'startSession'
    // 'updateOngoingSession'
    // 'endSession'

   let numNeeded = sessionConfig.minPlayersNeeded - sessionInfo.numPlayers;
   let numPlayers = sessionInfo.numPlayers;
   let str2 = `Waiting for ${ numNeeded } additional ${ numPlayers > 1 ? 'players' : 'player' }...`;
   messageWaitingRoom.innerText = str2;

   if (typeChange === 'joinedWaitingRoom') {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'block';
   }

   if (typeChange === 'updateWaitingRoom') {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'block';
        if (sessionInfo.status === 'waitingRoomCountdown') {
            str2 = `Game will start in ${ sessionInfo.countdown } seconds...`;
            messageWaitingRoom.innerText = str2;
        }
   }

   if (typeChange === 'startSession') {
        arrivalIndex = sessionInfo.arrivalIndex;
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'none';
        gameScreen.style.display = 'block';

        let dateString = timeStr(sessionInfo.sessionStartedAt);
        let str = `Started game with session id ${sessionInfo.sessionIndex} with ${sessionInfo.numPlayers} players at ${dateString}.`;
        myconsolelog( str );

        let str2 = `<p>Number of players: ${ sessionInfo.numPlayers} Session ID: ${ sessionInfo.sessionId}$</p>`;
        //messageGame.innerHTML = str2;

        document.getElementById(`labelPlayer${arrivalIndex}`).textContent = `(You)`;

        // Run the game loop at the specified framerate -- this starts the game
        timerId = setInterval(gameLoop, 1000 / fps);
   }

   if (typeChange === 'updateOngoingSession') {
        if (sessionInfo.numPlayers == 1) {
            instructionsScreen.style.display = 'none';
            waitingRoomScreen.style.display = 'none';
            gameScreen.style.display = 'none';
            finishScreen.style.display = 'block';
            messageFinish.innerHTML = `<p>The other player has left the session.</p>`;
            leaveSession();
        }
    }

   if (typeChange === 'endSession') {
        instructionsScreen.style.display = 'none';
        waitingRoomScreen.style.display = 'none';
        gameScreen.style.display = 'none';
        finishScreen.style.display = 'block';

        clearInterval( timerId );

        if (sessionInfo.sessionErrorCode != 0) {
            messageFinish.innerHTML = `<p>Session ended abnormally. Reason: ${sessionInfo.sessionErrorMsg}</p>`;
        } else {
            messageFinish.innerHTML = `<p>You have completed the session.</p>`;
        }
   }

}


// -------------------------------------
//      Utilities
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

// Function to get URL parameter by name
function getURLParameterByName(name) {
    // Create a regular expression to match the parameter name and its value
    let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    // Execute the regex on the URL
    let results = regex.exec(window.location.href);
    if (!results) return null;
    if (!results[2]) return '';
    // Decode the parameter value and return it
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

 
function roundDecimal( num , n ) {
    let factor = Math.pow(10, n);
    return Math.round(num * factor) / factor;
}
