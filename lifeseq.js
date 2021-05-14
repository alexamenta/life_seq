let AudioContext = window.AudioContext || window.webkitAudioContext;

// options
const GRIDSIZE = 16;
const LIVE_COLOUR = 'rgb(200, 200, 200)'
const VOL_RAMP_TIME = 0.005;
const FREQ_RAMP_TIME = 0.005;

// auxiliary functions
Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
    }




function cellId(x,y) {
        return "cell:" + x + "," + y;
    }

function index(x, y, gridSize) {
    return (x*gridSize + y)/(gridSize**2);
}

function noteToFreq(note) {
    let a = 110;
    return (a / 32) * (2 ** (note/ 12));
}

function freqMultiplier(x, y, gridSize, multiplier) {
    return 1 + (2**(multiplier))*index(x, y, gridSize);
}

// frequency dampening curve
// harmonic >= 1 (output of freqMultiplier)
function dampCurve(x, y, gridSize, factor) {
    return (1 - index(x, y, gridSize))**factor;
}

// a kind of linear/polynomial interpolation determined by the 
// 'boolean' conway function, along with
// soft_conway(2, 0) = soft_conway(4, 0) = 0
// soft_conway(1, 1) = soft_conway(4, 0) = 0
// i have a graph of this which should be in documentation somewhere 
function soft_conway(liveliness, heat) {
    return function(nbr_vitality, cell_vitality) {

        let noise = 0;
        if (heat) {
            noise += heat*Math.random();
        }

        if (nbr_vitality >= 3) { 
            return Math.max(0, 4-nbr_vitality)**liveliness + noise; 
        } else if (nbr_vitality < 3) { 
            return Math.min(1, Math.max(0, nbr_vitality + cell_vitality - 2))**liveliness + noise;
        }

    }
}

// board constructor: random board with probability p of life.
// set p=0 (default) for empty board
function Board(gridSize=16, p=0) {
    let brd = this;
    this.gridSize = gridSize;
    this.cells = [];
    for (let x=0; x<gridSize; x++) {
        this.cells.push([]); 
        for (let y=0; y<gridSize; y++) {
            this.cells[x].push(Number(Math.random() < p));
        }
    }

    // apply given rule to the new board
    // heat controls random fluctuations
    this.step = function(rule) {

        // create array to construct the new state (w/o constructing a new board)
        let new_state = [];

        // compute new state
        for (let x=0; x<brd.gridSize; x++) {
            new_state.push([]);
            for (let y=0; y<brd.gridSize; y++) {
                // count number of live neighbours
                let nbr_vitality = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx != 0 || dy != 0) {
                            nbr_vitality += brd.cells[(x + dx).mod(brd.gridSize)][(y + dy).mod(brd.gridSize)];
                        }
                    }
                }

                let cell_vitality = brd.cells[x][y];
                new_state[x].push(rule(nbr_vitality, cell_vitality));
            }
        }

        brd.cells = new_state;

    }
}

// initialise a glider
// defaults to 16x16 board
// should have gridsize >= 3
function createGliderBoard(gridSize=16) {
    let board = new Board(rows, cols);
    board.cells[0][1] = 1;
    board.cells[1][0] = 1;
    board.cells[2][0] = 1;
    board.cells[2][1] = 1;
    board.cells[2][2] = 1;
    return board;
}


// generates oscillator and gain node matrices
// frequencies all set to 440 by default
// gains all set to 0 by default
// these will be changed later in the program
function generateOscsAndGains(gridSize, globalGainNode, audioCtx) {
    let oscs = [];
    let gains = [];
    for (let x=0; x < gridSize; x++) {
        oscs.push([]);
        gains.push([]);
        for (let y=0; y < gridSize; y++) {
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



function HtmlInterface(document, gridSize) {
    let iface = this;
    this.on = false;
    this.document = document;
    this.gridSize = gridSize;
    this.gridArea = document.getElementById('grid-area')
    this.powerControl = document.getElementById('power');
    this.startButton = document.getElementById("start");
    this.stopButton = document.getElementById("stop");
    this.pauseButton = document.getElementById("pause");
    this.volumeControl = document.getElementById('volume');
    this.rootNoteControl = document.getElementById('rootNote');
    this.multiplierControl = document.getElementById('multiplier');
    this.dampingControl = document.getElementById('damping');
    this.speedControl = document.getElementById('speed')
    this.livelinessControl = document.getElementById('liveliness');
    this.heatControl = document.getElementById('heat');
    this.powerLight = document.getElementById('powerlight')

    this.connectedBoard = undefined;
    this.connectedSynthInstance = undefined;

    // generate cell grid
    for (let x=0; x < gridSize; x++) {
        for (let y=0; y < gridSize; y++) {
            // place cell element in sequencer area
            let cell = document.createElement("div");
            cell.className = "cell";
            cell.id = cellId(x,y);
            this.gridArea.appendChild(cell);
        }
    }

    this.connectSynthInstance = function(synth) {

        if (synth.gridSize != iface.gridSize) {
            console.log("synth and interface have mismatched gridsizes");
        } else {

            iface.connectedSynthInstance = synth;

            // add event listeners for power, start, stop, pause buttons
            iface.powerControl.addEventListener('click', function() {
                synth.on ? synth.switchOff() : synth.switchOn();
            });

            iface.startButton.addEventListener('click', function() {
                !synth.on ? console.log("Synth is not turned on")
                    : synth.run();
            })

            iface.stopButton.addEventListener('click', function() {
                !synth.on ? console.log("Synth is not turned on")
                    : synth.stop();
            })

            iface.pauseButton.addEventListener('click', function() {
                synth.togglePause();

                if (iface.pauseButton.className !== 'toggled') {
                    iface.pauseButton.className = 'toggled';
                } else {
                    iface.pauseButton.className = '';   
                }
            });

            // add event listeners for left and right click on cell
            for (let x=0; x < this.gridSize; x++) {
                for (let y=0; y < this.gridSize; y++) {
                    cell = iface.document.getElementById(cellId(x,y)); 
                    cell.addEventListener('click', function() {
                        synth.setCellValue(x, y, 1);
                    });
                    cell.addEventListener('contextmenu', function(ev) {
                        ev.preventDefault();
                        synth.setCellValue(x, y, 0);
                        return false; // prevent context menu from appearing
                    }, false);
                }
            }
        }
    }

    // draw a connected synth's board on the HTML interface
    // should have matching grid sizes
    this.draw = function() {

        if (!iface.connectedSynthInstance) {
            console.log("no connected synth instance");
        } else {
            brd = iface.connectedSynthInstance.state.brd;
            for (let x=0; x < brd.gridSize; x++) {
                for (let y=0; y < brd.gridSize; y++) {
                    let cellElement = document.getElementById(cellId(x,y));
                    cellElement.style.backgroundColor = LIVE_COLOUR;
                    cellElement.style.opacity = brd.cells[x][y];
                }
            }
        }
    }

    this.switchOn = function() {
        // add erorr message
        if (!iface.on) {
            if (!iface.connectedSynthInstance) {
                console.log("no connected synth instance");
            } else {
                iface.on = true;
                iface.draw();
                iface.powerLight.style.opacity = 1.0;
                iface.gridArea.style.opacity = 1.0;
            }
        }
    }

    this.switchOff = function() {
        // add error message
        if (iface.on) {
            if (!iface.connectedSynthInstance) {
                console.log("no connected synth instance");
            } else {
                iface.on = false;
                iface.powerLight.style.opacity = 0.2;
                iface.gridArea.style.opacity = 0.2;
            }
        }
    }

}


// an instance of life_syn
function SynthInstance(interface, gridSize) {

    this.gridSize = gridSize;

    this.state = {
        brd: new Board(this.gridSize, 0),
        rootNote: undefined,
        multiplier: undefined,
        damping: undefined,
        delay: undefined,
        liveliness: undefined
        }

    this.interface = interface;
    this.interface.connectSynthInstance(this);


    // use when there are scope issues
    let synth = this;
    let state = this.state;
    let iface = this.interface;


    this.audioCtx = undefined;

    // keeps track of whether the audio context is being accessed
    // when this is true, don't allow power to be switched off
    // until it becomes false
    this.accessingAudio = false;
    this._freeAudio = function(fnc) {
        synth.accessingAudio = true;
        fnc();
        synth.accessingAudio = false;
    }

    this.gainNode = undefined;
    this.oscs = undefined;
    this.gains = undefined;
    this.on = false;
    this.running = false;
    this.paused = false;

    this.setCellValue = function(x, y, value) {
        if (!synth.on) {
            console.log("Synth is switched off");
        } else {
            synth.state.brd.cells[x][y] = value;
            iface.draw();
        }
    }

    // generate matrix of frequencies
    // this is just an ad-hoc definition, can be changed
    this._generateFreqMatrix = function() {
        let freqs = [];
        for (x = 0; x < synth.gridSize; x++) {
            freqs.push([]);
            for (y = 0; y < synth.gridSize; y++) {
                // truncate at max frequency allowed, 22050
                freqs[x].push(Math.min(noteToFreq(synth.state.rootNote)*freqMultiplier(x, y, synth.gridSize, synth.state.multiplier), 22050));
            }
        }
        return freqs;
    }

    // given doubly-indexed arrays of oscillators and frequencies (of the same shape)
    // ramp the frequencies to the new values
    this._setAllFrequencies = function(freqs) {
        // how could this pattern be abstracted?
        synth._freeAudio(
            function() {
                for (x = 0; x < synth.gridSize; x++) {
                    for (y = 0; y < synth.gridSize; y++) {
                        // see https://stackoverflow.com/questions/34476178/web-audio-click-sound-even-when-using-exponentialramptovalueattime
                        synth.oscs[x][y].frequency.setValueAtTime(synth.oscs[x][y].frequency.value, synth.audioCtx.currentTime)
                        synth.oscs[x][y].frequency.exponentialRampToValueAtTime(freqs[x][y], synth.audioCtx.currentTime + FREQ_RAMP_TIME);
                    }
                }
            }
        );
    }

    this._readyToPlay = function() {
        if (!synth.audioCtx) {
            console.log("audio context not found");
            return false;
        } else if (!synth.gainNode) {
            console.log("gain node not found");
            return false;
        } else if (!synth.on) {
            console.log("synth is not turned on");
            return false;
        } else {
            return true;
        }
    }
    
    this.switchOn = function() {
        if (!this.on) {
            this.on = true;
            iface.switchOn();
            this.initialiseAudio();
        } else {
            console.log("Synth is already on");
        }
    }

    this.switchOff = function() {
        if (this.on) {
            
            synth.stop();

            while (synth.accessingAudio) {
            // wait until audio context isn't being accessed before switching it off
            }

            this.audioCtx.close().then(function() {
                synth.audioCtx = undefined;
                synth.on = false;
                iface.switchOff();
            })

        } else {
            console.log("Synth is already off");
        }
    }

    this.togglePause = function () {
        synth.paused = !synth.paused;
    }

    this.initialiseAudio = function() {
        // initialise audio context
        let audioCtx = new AudioContext();

        synth._freeAudio(
            function() {
                // global gain node, to adjust volume
                let gainNode = audioCtx.createGain();
                gainNode.gain.value = synth.interface.volumeControl.value;
                synth.interface.volumeControl.addEventListener('input', function() {
                    gainNode.gain.value = this.value;
                }, false);
                gainNode.connect(audioCtx.destination);

                synth.audioCtx = audioCtx;
                synth.gainNode = gainNode;

                // set up oscillators and corresponding gains
                let oscsAndGains = generateOscsAndGains(synth.gridSize, gainNode, audioCtx)
                synth.oscs = oscsAndGains[0];
                synth.gains = oscsAndGains[1];
            }
        )
    }

    // play the current board
    this.play = function() {

        if (synth._readyToPlay()) {

            for (let x = 0; x < synth.gridSize; x++) {
                for (let y = 0; y < synth.gridSize; y++) {
                    synth._freeAudio(function() 
                    {
                        let new_vol = dampCurve(x, y, synth.gridSize, synth.state.damping)*synth.state.brd.cells[x][y];
                        // have to 'set the value to the current value' to prevent clicks
                        // see https://stackoverflow.com/questions/34476178/web-audio-click-sound-even-when-using-exponentialramptovalueattime
                        synth.gains[x][y].gain.setValueAtTime(synth.gains[x][y].gain.value, synth.audioCtx.currentTime);
                        synth.gains[x][y].gain.linearRampToValueAtTime(new_vol, synth.audioCtx.currentTime + VOL_RAMP_TIME);
                    });
                }   
            }
        }
    }


    // run the synth!
    this.run = async function() {
        if (synth.running) {
            console.log("synth is already running");
        } else {
            if (synth._readyToPlay) {
                state = synth.state;
                iface = synth.interface;

                synth.running = true;

                // set initial gain (useful when the synth has been previously stopped)
                synth.gainNode.gain.setValueAtTime(synth.gainNode.gain.value, synth.audioCtx.currentTime);
                synth.gainNode.gain.linearRampToValueAtTime(iface.volumeControl.value/1, synth.audioCtx.currentTime + VOL_RAMP_TIME);

                // get initial parameters
                state.rootNote = iface.rootNoteControl.value/1;
                state.multiplier = iface.multiplierControl.value/1;
                state.liveliness = iface.livelinessControl.value/1;

                // form frequency matrix
                freqs = synth._generateFreqMatrix();
                // set oscillator initial frequencies
                synth._setAllFrequencies(freqs);
            
                // main loop
                while(synth.running) {
                    
                    // exit main loop if the synth has been turned off
                    if (!synth.on) {break;}

                    // loop here until unpaused
                    while (synth.paused) {
                        await new Promise(r => setTimeout(r, 100));
                    }
            
                    // get delay parameter, and wait
                    state.delay = 1/iface.speedControl.value;
                    await new Promise(r => setTimeout(r, Math.floor(state.delay)));
            
                    // get tonal parameter values
                    // we check whether the root note or multiplier has changed
                    // so we can avoid generating new freq matrix unless we need it
                    let new_rootNote = iface.rootNoteControl.value/1;
                    let new_multiplier = iface.multiplierControl.value/1;
                    state.damping = iface.dampingControl.value/1;
            
                    // get rule control variables
                    state.liveliness = iface.livelinessControl.value/1;
                    state.heat = iface.heatControl.value/1;
            
                    // change frequencies only if a tonal parameter has changed
                    if (new_rootNote != state.rootNote || new_multiplier != state.multiplier) {
                        state.rootNote = new_rootNote;
                        state.multiplier = new_multiplier;
                        freqs = synth._generateFreqMatrix();
                        synth._setAllFrequencies(freqs);
                        // replace old tonal parameters with new ones, if necessary

                    }

                    // exit main loop if the synth has been turned off
                    // this appears twice and seems really hacky
                    // what's the best practice?
                    if (!synth.on) {break;}
            
                    // update, play, and draw board
                    synth.state.brd.step(soft_conway(state.liveliness, state.heat));
                    synth.play(); 
                    iface.draw();
                }
            }
        }
    }

    this.stop = function() {
        if (!synth.running) {
            console.log("synth is not running");
        } else {
            synth.running = false;
            synth.gainNode.gain.setValueAtTime(synth.gainNode.gain.value, synth.audioCtx.currentTime);
            synth.gainNode.gain.linearRampToValueAtTime(0, synth.audioCtx.currentTime + VOL_RAMP_TIME);
        }
    }
}

iface = new HtmlInterface(document, GRIDSIZE);
synth = new SynthInstance(iface, GRIDSIZE);