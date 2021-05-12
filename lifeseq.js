Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
    }

// grid options
const NUM_ROWS = 16;
const NUM_COLS = 16;

// display options
const LIVE_COLOUR = 'rgb(200, 200, 200)'
const DEAD_COLOUR = 'rgb(20, 20, 20)'

// audio options
const VOL_RAMP_TIME = 0.005;
const FREQ_RAMP_TIME = 0.005;

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
function Board(rows=4, cols=4, p=0) {
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
    let changed = []; // indices for which the value has changed

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

            // track whether the cell has changed
            if (new_brd.cells[x][y].alive != brd.cells[x][y].alive) {
                changed.push([x,y]);
            } 
        }
    }

    return [new_brd, changed];
}

// draw given board to HTML (assumes all the cell IDs are assigned right)
function draw(brd) {
    for (let x=0; x < brd.rows; x++) {
        for (let y=0; y < brd.cols; y++) {
            brd.cells[x][y].draw();
        }
    }
}


// frequency data
function noteToFreq(note) {
    let a = 110;
    return (a / 32) * (2 ** (note/ 12));
}

// generates oscillator and gain node matrices
// frequencies all set to 440 by default
// gains all set to 0 by default
// these will be changed later in the program
function generateOscsAndGains(rows, cols, globalGainNode, audioCtx) {
    let oscs = [];
    let gains = [];
    for (let x=0; x < rows; x++) {
        oscs.push([]);
        gains.push([]);
        for (let y=0; y < cols; y++) {
            let newOsc = audioCtx.createOscillator();
            oscs[x].push(newOsc);

            let newGainNode = audioCtx.createGain();
            newGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gains[x].push(newGainNode)
            newGainNode.connect(globalGainNode);
            newOsc.connect(newGainNode);
            newOsc.start();
        }
    }
    return [oscs, gains];
}

// given doubly-indexed arrays of oscillators and frequencies (of the same shape)
// ramp the frequencies to the new values
function setAllFrequencies(oscs, freqs, audioCtx) {
    for (x = 0; x < oscs.length; x++) {
        for (y = 0; y < oscs[x].length; y++) {
                    // have to 'set the value to the current value' to prevent clicks
        // see https://stackoverflow.com/questions/34476178/web-audio-click-sound-even-when-using-exponentialramptovalueattime
            oscs[x][y].frequency.setValueAtTime(freqs[x][y], audioCtx.currentTime)
            oscs[x][y].frequency.exponentialRampToValueAtTime(freqs[x][y], audioCtx.currentTime + FREQ_RAMP_TIME);
        }
    }
}

// generate the matrix of frequencies
// this is just an ad-hoc definition, can be changed
function freqMatrixGenerator(num_rows, num_cols, multiplier, rootNote) {
    let freqs = [];
    for (x = 0; x < num_rows; x++) {
        freqs.push([]);
        for (y = 0; y < num_cols; y++) {
            freqs[x].push(noteToFreq(rootNote) + multiplier*(3*x*NUM_ROWS + 2*y));
        }
    }
    return freqs;
}

// 'play' the board
// this just adjusts gains for each step
function play(brd, gains, changed, audioCtx) {
    for (let i = 0; i < changed.length; i++) {
        // index of a cell whose state has changed
        let x = changed[i][0];
        let y = changed[i][1];
        let new_vol = Number(brd.cells[x][y].alive);
        // have to 'set the value to the current value' to prevent clicks
        // see https://stackoverflow.com/questions/34476178/web-audio-click-sound-even-when-using-exponentialramptovalueattime
        gains[x][y].gain.setValueAtTime(gains[x][y].gain.value, audioCtx.currentTime);
        gains[x][y].gain.linearRampToValueAtTime(new_vol, audioCtx.currentTime + VOL_RAMP_TIME);
    }
}

const rootNoteControl = document.querySelector('#rootnote');
const multiplierControl = document.querySelector('#multiplier');
const speedControl = document.querySelector('#speed')

async function run(gainNode, audioCtx) {
    // initialise a board and draw it
    let brd = new Board(NUM_ROWS, NUM_COLS, 0.1);
    draw(brd);
    // set up oscillators and corresponding gains
    let oscsAndGains = generateOscsAndGains(NUM_ROWS, NUM_COLS, gainNode, audioCtx)
    let oscs = oscsAndGains[0];
    let gains = oscsAndGains[1];
    // get initial parameters
    let old_rootnote = rootNoteControl.value/1;
    let old_multiplier = multiplierControl.value/1;
    let delay;
    // form frequency matrix
    freqs = freqMatrixGenerator(NUM_ROWS, NUM_COLS, old_multiplier, old_rootnote);
    // set oscillator initial frequencies
    setAllFrequencies(oscs, freqs, audioCtx);

    // main loop
    while(true) {

        // get delay parameter, and wait
        delay = 1/speedControl.value;
        await new Promise(r => setTimeout(r, Math.floor(delay)));

        // get tonal parameter values
        let new_rootnote = rootNoteControl.value/1;
        let new_multiplier = multiplierControl.value/1;

        // change frequencies only if a tonal parameter has changed
        if (new_rootnote != old_rootnote || new_multiplier != old_multiplier) {
            freqs = freqMatrixGenerator(NUM_ROWS, NUM_COLS, new_multiplier, new_rootnote);
            setAllFrequencies(oscs, freqs, audioCtx);
            // replace old tonal parameters with new ones, if necessary
            old_rootnote = new_rootnote;
            old_multiplier = new_multiplier;
        }

        // update, play, and draw board
        let stepdata = step(brd);
        brd = stepdata[0];
        changed = stepdata[1];
        play(brd, gains, changed, audioCtx);        
        draw(brd);
    }
}

document.getElementById("start").addEventListener("click", function() {
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
    generateCellGrid(NUM_ROWS, NUM_COLS);
    run(gainNode, audioCtx);
}); 
