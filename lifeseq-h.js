Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
    }

// grid options
const NUM_ROWS = 32;
const NUM_COLS = 32;

// display options
const LIVE_COLOUR = 'rgb(200, 200, 200)'
const DEAD_COLOUR = 'rgb(20, 20, 20)'

// audio options
const RAMP_TIME = 0.2;

// cell constructor
function Cell(id=undefined, alive=false) {
    this.alive = alive;
    this.id = id; // id of div used to display cell

    this.draw = function() {
        if (this.id) {
            let colour = (this.alive ? LIVE_COLOUR : DEAD_COLOUR);
            document.getElementById(this.id).style.backgroundColor = colour;
        } else {
            console.log("Tried to draw cell with undefined id");
        }
    }

    // scope issues prevent that.draw() from working
    var that = this;

    this.toggle = function() {
        that.alive = !that.alive;
        that.draw();
    }

}

// cell id generator for HTML elements
function cellId(x,y) {
    return "cell:" + x + "," + y;
}

// generate grid of html-element cells
// in the element with given id
function generateCellGrid(rows=16, cols=16, id) {
    for (let x=0; x < rows; x++) {
        for (let y=0; y < cols; y++) {
        let cell = document.createElement("div");
        cell.className = "cell";
        cell.id = cellId(x,y);
        document.getElementById("seq-area").appendChild(cell);
        }
    }
}

// board constructor: random board with probability p of life.
// set p=0 (default) for empty board
// defaults to 16x16
function Board(rows=16, cols=16, p=0) {
    this.rows = rows;
    this.cols = cols;
    this.cells = [];
    for (let x=0; x<rows; x++) {
        this.cells.push([]); 
        for (let y=0; y<cols; y++) {
            let cell = new Cell(cellId(x,y), Math.random() < p);
            this.cells[x].push(cell);
            document.getElementById(cell.id).addEventListener('click', cell.toggle);
        }
    }
}

// initialise a glider
// defaults to 16x16 board
// should have rows, cols >= 2
function gliderBoard(rows=16, cols=16) {
    let board = new Board(rows, cols);
    board.cells[0][1].alive = true;
    board.cells[1][0].alive = true;
    board.cells[2][0].alive = true;
    board.cells[2][1].alive = true;
    board.cells[2][2].alive = true;
    return board;
}

// apply Conway's life rule to the board
// and return the new board
// (does not mutate brd)
function step(brd) {
    let r = brd.rows;
    let c = brd.cols;
    let new_brd = new Board(r,c);

    for (let x=0; x<r; x++) {
        for (let y=0; y<c; y++) {
            // count number of live neighbours
            let live_nbrs = 0;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx != 0 || dy != 0) {
                        nbr_status = brd.cells[(x + dx).mod(r)][(y + dy).mod(c)].alive;
                        live_nbrs += Number(nbr_status);
                    }
                }
            }

            // live cells need 2 or 3 live neighbours to live
            if (brd.cells[x][y].alive) {
                new_brd.cells[x][y].alive = (live_nbrs == 2 || live_nbrs == 3);
            } else {
                new_brd.cells[x][y].alive = (live_nbrs == 3);
            }
        }
    }

    return new_brd;
}

// draw given board to HTML (assumes all the cell IDs are assigned right)
function draw(brd) {
    for (let x=0; x < brd.rows; x++) {
        for (let y=0; y < brd.cols; y++) {
            brd.cells[x][y].draw();
        }
    }
}

// audio stuff
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// global gain node, to adjust volume
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.05;
gainNode.connect(audioCtx.destination);
const volumeControl = document.querySelector('#volume');
volumeControl.addEventListener('input', function() {
    gainNode.gain.value = this.value;
}, false);

// frequency data
function noteToFreq(note) {
    let a = 110;
    return (a / 32) * (2 ** (note/ 12));
}

// create and start playing an oscillator with given frequency
// and return both the osc and its local gain node
function playosc(note, units='note') {
    let osc = audioCtx.createOscillator();
    osc.type = 'sine';
    let freq;
    if (units == 'note') {
        freq = noteToFreq(note);
    } else if (units == 'hz') {
        freq = note;
    }
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    let localGainNode = audioCtx.createGain();
    localGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    localGainNode.connect(gainNode);    
    osc.connect(localGainNode);
    osc.start();
    localGainNode.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + RAMP_TIME);
    return [osc, localGainNode];
}


// 'play' the board
// return list of running oscillators
function play(brd, running_oscs={}, rootnote=44, multiplier=100) {
    for (let r=0; r < brd.rows; r++) {
        for (let c=0; c < brd.cols; c++) {
    
            if (brd.cells[r][c].alive) {
                // turn on oscillator if not already on
                // and add it to running_oscs
                if (!running_oscs.hasOwnProperty(cellId(r,c))) {
                    running_oscs[cellId(r,c)] = playosc(noteToFreq(rootnote) + multiplier*(r*NUM_ROWS + c), 'hz');
                }
            } else if (!brd.cells[r][c].alive) {
                // turn off oscillator if it's already on
                // and remove it from running_oscs
                if (running_oscs.hasOwnProperty(cellId(r,c))) {
                    let osc = running_oscs[cellId(r,c)][0];
                    let localGain =  running_oscs[cellId(r,c)][1]
                    // ramp down the gain
                    localGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + RAMP_TIME);
                    // turn off the oscillator after ramp
                    osc.stop(audioCtx.currentTime + RAMP_TIME);
                    delete running_oscs[cellId(r,c)];
                }
            }

        }
    }

    return running_oscs;
}

const rootNoteControl = document.querySelector('#rootnote');
const multiplierControl = document.querySelector('#multiplier');
const speedControl = document.querySelector('#speed')

async function run() {
    // initialise a board and draw it
    //let brd = new Board(NUM_ROWS, NUM_COLS, p=0.08);
    let brd = new Board(NUM_ROWS, NUM_COLS, 0.1);
    let running_oscs = {};
    // get root frequency
    while(true) {
        rootnote = rootNoteControl.value/1;
        multiplier = multiplierControl.value/1;
        speed = speedControl.value/1;
        delay = 1/speed;
        draw(brd);
        running_oscs = play(brd, running_oscs, rootnote, multiplier);
        await new Promise(r => setTimeout(r, Math.floor(delay)));


        brd = step(brd);

    }
}

generateCellGrid(NUM_ROWS, NUM_COLS);
run();