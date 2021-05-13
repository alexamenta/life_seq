Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
    }

// grid options
const NUM_ROWS = 16;
const NUM_COLS = 16;

// display options
const LIVE_COLOUR = 'rgb(200, 200, 200)'

// audio options
const VOL_RAMP_TIME = 0.005;
const FREQ_RAMP_TIME = 0.005;

/* 
    --TODO--
    change cell.toggle behaviour (left click for 1, right click for 0)
*/

// cell constructor
function Cell(id=undefined, vitality=0) {
    this.vitality = vitality;
    this.id = id; // id of div used to display cell

    this.draw = function() {
        if (this.id) {
            document.getElementById(this.id).style.backgroundColor = LIVE_COLOUR;
            document.getElementById(this.id).style.opacity = this.vitality;
        } else {
            console.log("Tried to draw cell with undefined id");
        }
    }

    this.element = document.getElementById(this.id);

    // scope issues prevent that.draw() from working
    var that = this;

    // set vitality = 1 on left click
    // and = 0 on 'right click'
    this.element.addEventListener('click', function() {
        that.vitality = 1;
        that.draw();
    });
    this.element.addEventListener('contextmenu', function(ev) {
        ev.preventDefault();
        that.vitality = 0;
        that.draw();
        return false; // prevent context menu from appearing
    }, false);

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
            let cell = new Cell(cellId(x,y), Number(Math.random() < p));
            this.cells[x].push(cell);
        }
    }
}

// initialise a glider
// defaults to 16x16 board
// should have rows, cols >= 2
function gliderBoard(rows=16, cols=16) {
    let board = new Board(rows, cols);
    board.cells[0][1].vitality = 1;
    board.cells[1][0].vitality = 1;
    board.cells[2][0].vitality = 1;
    board.cells[2][1].vitality = 1;
    board.cells[2][2].vitality = 1;
    return board;
}

function uniformRandom(rows, cols=16) {
    let board = new Board(rows, cols);
    for (let x=0; x < rows; x++) {
        for (let y=0; y<cols; y++) {
            board.cells[x][y].vitality = Math.random();
        }
    }
    return board;
}

// only use this on (0,1)-valued cells
function conway(nbr_vitality, cell_vitality) {
    // live cells need 2 or 3 live neighbours to live
    if (cell_vitality == 1 && (nbr_vitality >= 2 && nbr_vitality <= 3)) {
        return 1;
    } else if (cell_vitality == 0 && nbr_vitality == 3) {
        return 1;
    }
    return 0;
}

// a kind of linear/polynomial interpolation determined by the 
// 'boolean' conway function, along with
// soft_conway(2, 0) = soft_conway(4, 0) = 0
// soft_conway(1, 1) = soft_conway(4, 0) = 0
// i have a graph of this which should be in documentation somewhere 
function soft_conway(liveliness) {
    return function(nbr_vitality, cell_vitality) {
        if (nbr_vitality >= 3) { 
            return Math.max(0, 4-nbr_vitality)**liveliness; 
        } else if (nbr_vitality < 3) { 
            return Math.min(1, Math.max(0, nbr_vitality + cell_vitality - 2))**liveliness;
        }
    }
}

// apply given rule to the new board
// heat controls random fluctuations
function step(brd, heat, rule=conway) {
    let r = brd.rows;
    let c = brd.cols;

    // create array to construct the new state (w/o constructing a new board)
    let new_state = [];

    for (let x=0; x<r; x++) {
        new_state.push([]);
        for (let y=0; y<c; y++) {
            // count number of live neighbours
            let nbr_vitality = 0;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx != 0 || dy != 0) {
                        nbr_vitality += brd.cells[(x + dx).mod(r)][(y + dy).mod(c)].vitality;
                    }
                }
            }

            let cell_vitality = brd.cells[x][y].vitality;
            let noise = 0;
            if (heat) {
                noise += heat*Math.random();
            }
            new_state[x].push(rule(nbr_vitality, cell_vitality) + noise);
        }
    }

    // update board to the new state
    for (let x=0; x<r; x++) {
        for (let y=0; y<c; y++) {
            brd.cells[x][y].vitality = new_state[x][y];
        }
    }
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

function index(x, y, num_rows) {
    return (x*num_rows + y)/(num_rows**2);
}

// generate the matrix of frequencies
// this is just an ad-hoc definition, can be changed
function freqMatrixGenerator(num_rows, num_cols, multiplier, rootNote) {
    let freqs = [];
    for (x = 0; x < num_rows; x++) {
        freqs.push([]);
        for (y = 0; y < num_cols; y++) {
            // truncate at max frequency allowed, 22050
            freqs[x].push(Math.min(noteToFreq(rootNote)*(1 + (multiplier**2)*index(x,y, num_rows)/2), 22050));
        }
    }
    return freqs;
}


function dampCurve(x, y, num_rows, factor) {
    return (1 - index(x, y, num_rows))**factor;
}

// 'play' the board
// this just adjusts gains for each step
function play(brd, gains, audioCtx, damping) {
    for (let x = 0; x < brd.rows; x++) {
        for (let y = 0; y < brd.cols; y++) {
            let new_vol = dampCurve(x,y, brd.rows, damping)*brd.cells[x][y].vitality;
            // have to 'set the value to the current value' to prevent clicks
            // see https://stackoverflow.com/questions/34476178/web-audio-click-sound-even-when-using-exponentialramptovalueattime
            gains[x][y].gain.setValueAtTime(gains[x][y].gain.value, audioCtx.currentTime);
            gains[x][y].gain.linearRampToValueAtTime(new_vol, audioCtx.currentTime + VOL_RAMP_TIME);
        }
    }
}

const rootNoteControl = document.querySelector('#rootnote');
const multiplierControl = document.querySelector('#multiplier');
const dampingControl = document.querySelector('#damping');
const speedControl = document.querySelector('#speed')
const livelinessControl = document.querySelector('#liveliness');
const heatControl = document.querySelector('#heat');

async function run(rule, gainNode, audioCtx) {
    // initialise a board and draw it
    let brd = uniformRandom(NUM_ROWS, NUM_COLS, 0.1);
    draw(brd);
    // set up oscillators and corresponding gains
    let oscsAndGains = generateOscsAndGains(NUM_ROWS, NUM_COLS, gainNode, audioCtx)
    let oscs = oscsAndGains[0];
    let gains = oscsAndGains[1];
    // get initial parameters
    let old_rootnote = rootNoteControl.value/1;
    let old_multiplier = multiplierControl.value/1;
    let delay;
    let liveliness = livelinessControl.value/1;
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
        let damping = dampingControl.value/1;

        // get rule control variables
        let liveliness = livelinessControl.value/1;
        let heat = heatControl.value/1;

        // change frequencies only if a tonal parameter has changed
        if (new_rootnote != old_rootnote || new_multiplier != old_multiplier) {
            freqs = freqMatrixGenerator(NUM_ROWS, NUM_COLS, new_multiplier, new_rootnote);
            setAllFrequencies(oscs, freqs, audioCtx);
            // replace old tonal parameters with new ones, if necessary
            old_rootnote = new_rootnote;
            old_multiplier = new_multiplier;
        }

        // update, play, and draw board
        step(brd, heat, soft_conway(liveliness));
        play(brd, gains, audioCtx, damping);        
        draw(brd);
    }
}

document.getElementById("start").addEventListener("click", function() {
    let rule = soft_conway;
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
    run(rule, gainNode, audioCtx);
}); 
