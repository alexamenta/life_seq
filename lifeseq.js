Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
    }

// grid options
const NUM_ROWS = 16;
const NUM_COLS = 16;

// display setup 
const canvas = document.querySelector('.myCanvas');
const ctx = canvas.getContext('2d');

// display options
const width = canvas.width = 640;
const height = canvas.height = 640;
const CELL_MARGIN = 1; // cell margin
const CELL_LEN = height/NUM_ROWS;  // cell sidelength, breaks if canvas is not square
const LIVE_COLOUR = 'rgb(200, 200, 200)'
const DEAD_COLOUR = 'rgb(20, 20, 20)'

// create background
ctx.fillStyle = 'rgba(255,255,255,0.05)';
ctx.fillRect(0, 0, width, height);

// cell constructor
function Cell(div_id=undefined, alive=false) {
    this.alive = alive;
    this.div_id = div_id; // id of div used to display cell
}

// cell id generator for HTML elements
function cellId(x,y) {
    return "cell:" + x + "," + y;
}

// board constructor: random board with probability p of life.
// set p=0 (default) for empty board
// defaults to 16x16
function Board(rows=16, cols=16, p=0) {
    this.rows = rows;
    this.cols = cols;
    this.cells = [];
    for (let x=0; x<rows; x++) {
        this.cells.push([]); // create row
        for (let y=0; y<cols; y++) {
            if (p==0) {
                let cell = new Cell(cellId(x,y), false)
                this.cells[x].push(cell);
            } else {
                let cell = new Cell(cellId(x,y), Math.random() < p)
                this.cells[x].push(cell);
            }
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

// draw a board
function draw(brd) {
    for (let r=0; r < brd.rows; r++) {
        for (let c=0; c < brd.cols; c++) {
            let topleft = [c*CELL_LEN + CELL_MARGIN, r*CELL_LEN + CELL_MARGIN];
            let widthheight = [CELL_LEN-2*CELL_MARGIN, CELL_LEN-2*CELL_MARGIN];
    
            if (brd.cells[r][c].alive) {
                ctx.fillStyle = LIVE_COLOUR;
            } else {
                ctx.fillStyle = DEAD_COLOUR;
            }

            ctx.fillRect(...topleft, ...widthheight);
        }
    }
}


// audio stuff
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// gain node, to adjust volume
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.05;
gainNode.connect(audioCtx.destination);
const volumeControl = document.querySelector('#volume');
volumeControl.addEventListener('input', function() {
    gainNode.gain.value = this.value;
}, false);

// create an oscillator node for each cell
let osc_nodes = [];
for (let x = 0; x < NUM_ROWS; x++) {
    osc_nodes.push([]);
    for (let y = 0; y < NUM_COLS; y++) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(10 + 100*x + 100*y, audioCtx.currentTime);
        osc.connect(gainNode);
        osc_nodes[x].push(osc);
    }
}

// frequency data
function noteToFreq(note) {
    let a = 440;
    return (a / 32) * (2 ** ((note - 9) / 12));
}

// create an oscillator with given frequency
// and return it (for later closing)
function playosc(note) {
    let osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(noteToFreq(note), audioCtx.currentTime);
    osc.connect(gainNode);
    osc.start()
    return osc;
}

// 'play' the board
// return list of running oscillators
function play(brd, running_oscs=[]) {
    // stop all running oscillators and empty the list
    if (running_oscs) {
        for (let i = 0; i < running_oscs.length; i++) {
            running_oscs[i].stop();
        }
        running_oscs = [];
    }
    for (let r=0; r < brd.rows; r++) {
        for (let c=0; c < brd.cols; c++) {
    
            if (brd.cells[r][c].alive) {
                let newosc = playosc(60+c-r);
                running_oscs.push(newosc);
            }
        }
    }
    return running_oscs;
}


async function run() {
    // initialise a board and draw it
    //let brd = new Board(NUM_ROWS, NUM_COLS, p=0.08);
    let brd = gliderBoard(NUM_ROWS, NUM_COLS);
    let running_oscs = [];
    draw(brd);
    running_oscs = play(brd);
    while(true) {
        await new Promise(r => setTimeout(r, 125));
        brd = step(brd);
        draw(brd);
        running_oscs = play(brd, running_oscs);
    }
}

run();