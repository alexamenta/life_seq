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

// generate 0/1 valued grid, probability p of full life
function randomCells(gridSize, p) {
    let cells = [];
    for (let x=0; x < gridSize; x++) {
        cells.push([]);
        for (let y=0; y < gridSize; y++) {
            if (p == 0) {
                cells[x].push(0);
            } else {
                cells[x].push(Number(Math.random() < p));
            }
        }
    }
    return cells;
}

function gliderCells(gridSize) {
    let cells = randomCells(gridSize, 0);
    cells[0][1] = cells[1][0] = cells[2][0] = cells[2][1] = cells[2][2] = 1;
    return cells;
}

// board constructor: random board with probability p of life.
// set p=0 (default) for empty board
class Board {
    constructor(gridSize=16, p=0) {
        this.gridSize = gridSize;
        this.cells = randomCells(gridSize, p);
    }

    // apply given rule to the new board
    step(rule) {

        // create array to construct the new state (w/o constructing a new board)
        let new_state = [];

        // compute new state
        for (let x=0; x<this.gridSize; x++) {
            new_state.push([]);
            for (let y=0; y<this.gridSize; y++) {
                // count number of live neighbours
                let nbr_vitality = 0;
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx != 0 || dy != 0) {
                            nbr_vitality += this.cells[(x + dx).mod(this.gridSize)][(y + dy).mod(this.gridSize)];
                        }
                    }
                }

                let cell_vitality = this.cells[x][y];
                new_state[x].push(rule(nbr_vitality, cell_vitality));
            }
        }

        this.cells = new_state;

    }
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



class HtmlInterface {

    constructor(document, gridSize) {
        this.on = false;
        this.document = document;
        this.gridSize = gridSize;
        this.gridArea = document.getElementById('grid-area');

        this.powerControl = document.getElementById('power');
        this.startButton = document.getElementById("start");
        this.stopButton = document.getElementById("stop");
        this.pauseButton = document.getElementById("pause");
        this.clearButton = document.getElementById("clear");
        this.randomButton = document.getElementById("random");
        this.gliderButton = document.getElementById("glider");

        this.presetButtons = [
            document.getElementById("preset0")
        ];

        this.volumeControl = document.getElementById('volume');
        this.rootNoteControl = document.getElementById('rootNote');
        this.multiplierControl = document.getElementById('multiplier');
        this.dampingControl = document.getElementById('damping');
        this.speedControl = document.getElementById('speed')
        this.livelinessControl = document.getElementById('liveliness');
        this.heatControl = document.getElementById('heat');
        this.powerLight = document.getElementById('powerLight');
        this.ticker = document.getElementById('ticker');

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
    }

    clickPowerControl() {
        let synth = this.connectedSynthInstance;
        if (synth) {
            synth.on ? synth.switchOff() : synth.switchOn();
        }
    }

    clickStartButton() {
        let synth = this.connectedSynthInstance;
        if (synth) {
            synth.run();
            this.pauseButton.classList.remove("toggled");
        }
    }

    clickStopButton() {
        let synth = this.connectedSynthInstance;
        if (synth) {
            synth.stop();
            this.pauseButton.classList.remove("toggled");
        }
    }

    clickPauseButton() {
        let synth = this.connectedSynthInstance;
        if (synth) {
            // do nothing if the synth is already paused
            if (!synth.paused) {
                synth.pause();
                this.pauseButton.classList.add("toggled");
            }
        }
    }

    clickClearButton() {
        let synth = this.connectedSynthInstance;
        if (synth) {
            if (synth.on) {
                synth.randomiseCells(0);
                this.draw();
            }
        }
    }

    clickRandomButton() {
        let synth = this.connectedSynthInstance;
        if (synth) {
            if (synth.on) {
                synth.randomiseCells();
                this.draw();
            }
        }
    }

    clickGliderButton() {
        let synth = this.connectedSynthInstance;
        if (synth) {
            if (synth.on) {
                synth.resetToGlider();
                this.draw();
            }
        }
    }

    clickPresetButton(n) {
        let synth = this.connectedSynthInstance;
        if (synth) {
            if (synth.on) {
                // modify this later to allow for more presents
                synth.loadPreset(presets.chatter);
            }
        }
    }

    leftClickCell(x,y) {
        let synth = this.connectedSynthInstance;
        if (synth) {
            synth.setCellValue(x, y, 1);
        }
    }

    rightClickCell(x,y) {
        let synth = this.connectedSynthInstance;
        if (synth) {
            
        }
    }

    connectSynthInstance(synth) {

        if (synth.gridSize != this.gridSize) {
            console.log("synth and interface have mismatched gridsizes");
        } else {

            this.connectedSynthInstance = synth;

            // add event listeners for buttons
            // arrow functions are used to avoid scope issues
            // (so 'this' refers to the object, not the button)
            // see https://stackoverflow.com/questions/43727516/javascript-how-adding-event-handler-inside-a-class-with-a-class-method-as-the-c
            this.powerControl.addEventListener('click', () => this.clickPowerControl());
            this.startButton.addEventListener('click', () => this.clickStartButton());
            this.stopButton.addEventListener('click', () => this.clickStopButton());
            this.pauseButton.addEventListener('click', () => this.clickPauseButton());
            this.clearButton.addEventListener('click', () => this.clickClearButton());
            this.randomButton.addEventListener('click', () => this.clickRandomButton());
            this.gliderButton.addEventListener('click', () => this.clickGliderButton());
            // modify this to have more than one preset later
            this.presetButtons[0].addEventListener('click', () => this.clickPresetButton(0));
            

            // add event listeners for left and right click on cell
            for (let x=0; x < this.gridSize; x++) {
                for (let y=0; y < this.gridSize; y++) {
                    let cell = this.document.getElementById(cellId(x,y)); 
                    cell.addEventListener('click', () => this.leftClickCell(x,y));
                    cell.addEventListener('contextmenu', (ev) => {
                        ev.preventDefault();
                        this.rightClickCell(x,y);
                        return false; // prevent context menu from appearing
                    }, false);
                }
            }
        }
    }

    // draw a connected synth's board on the HTML interface
    // should have matching grid sizes
    draw() {

        if (!this.connectedSynthInstance) {
            console.log("no connected synth instance");
        } else {
            let brd = this.connectedSynthInstance.state.brd;
            for (let x=0; x < brd.gridSize; x++) {
                for (let y=0; y < brd.gridSize; y++) {
                    let cellElement = document.getElementById(cellId(x,y));
                    cellElement.style.backgroundColor = LIVE_COLOUR;
                    cellElement.style.opacity = brd.cells[x][y];
                }
            }
        }
    }

    switchOn() {
        if (!this.on) {
            if (!this.connectedSynthInstance) {
                console.log("no connected synth instance");
            } else {
                this.on = true;
                this.draw();
                this.powerLight.classList.add("on");
                this.gridArea.classList.add("on");
            }
        }
    }

    switchOff() {
        if (this.on) {
            if (!this.connectedSynthInstance) {
                console.log("no connected synth instance");
            } else {
                this.on = false;
                this.powerLight.classList.remove("on");
                this.gridArea.classList.remove("on");
                this.ticker.classList.remove("on");
            }
        }
    }

    // what to do when tick from clock is received
    receiveTick() {
        this.ticker.classList.toggle("on");
        this.draw();
    }

    // set interface values to those stored in synth state
    // used when loading presents
    setToSynthParameters() {
        if (!this.connectedSynthInstance) {
            console.log("no connected synth instance");
        } else {
            // board state has possibly changed, so redraw the board
            this.draw();

            // set the controls
            let state = this.connectedSynthInstance.state;
            this.rootNoteControl.value = state.rootNote;
            this.multiplierControl.value = state.multiplierControl;
            this.dampingControl.value = state.damping;
            this.livelinessControl.value = state.liveliness;
            this.heatControl.value = state.heat;
            this.speedControl.value = 1/state.delay;
        }
    }
}

// delay: clock delay time in ms
function Clock(delay, listeners=[]) {
    let clock = this;
    this.delay = delay;
    this.listeners = listeners;

    this.running = false;

    this.addListener = function(listener) {
        clock.listeners.push(listener);
    }

    // broadcast tick message to all listeners
    this.tick = function() {
        for (i = 0; i < listeners.length; i++) {
            listeners[i].receiveTick();
        }
    }

    // start clock
    this.start = async function() {
        clock.running = true;
        while (true) {
            clock.tick();
            if (!clock.running) {break;}
            await new Promise(r => setTimeout(r, clock.delay));
            if (!clock.running) {break;}
        }
    }

    // stop clock
    this.stop = function() {
        clock.running = false;
    }

    this.toggle = function() {
        clock.running ? clock.stop() : clock.start();
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
        liveliness: undefined,
        heat: undefined,
        delay: undefined
        }

    this.interface = interface;
    this.interface.connectSynthInstance(this);

    this.clock = undefined; 

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
            this.getParameters();
            // initialise clock
            synth.clock = new Clock(state.delay);
            synth.clock.addListener(synth);
            synth.clock.addListener(iface);
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

    this.pause = function () {
        if (!synth.paused) {
            synth.paused = true;
            if (synth.clock) {synth.clock.stop();}
        }
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

    this.getParameters = function() {
        if (synth.audioCtx) {
            synth.gainNode.gain.setValueAtTime(synth.gainNode.gain.value, synth.audioCtx.currentTime);
            synth.gainNode.gain.linearRampToValueAtTime(iface.volumeControl.value/1, synth.audioCtx.currentTime + VOL_RAMP_TIME);
    
            // get initial parameters
            state.rootNote = iface.rootNoteControl.value/1;
            state.multiplier = iface.multiplierControl.value/1;
            state.liveliness = iface.livelinessControl.value/1;
            state.damping = iface.dampingControl.value/1;
            state.heat = iface.heatControl.value/1;
            state.delay = 1/iface.speedControl.value;
    
            // form frequency matrix
            freqs = synth._generateFreqMatrix();
            // set oscillator initial frequencies
            synth._setAllFrequencies(freqs);
        }
    }

    this.receiveTick = function() {
        // update and play board
        // interface handles the drawing
        synth.state.brd.step(soft_conway(state.liveliness, state.heat));
        synth.getParameters();
        synth.clock.delay = state.delay;
        synth.play();
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
    this.run = function() {
        synth.paused = false;
        if (synth.on) {
            synth.running = true;
            if (!synth.clock.running) {
                synth.clock.start();
            }
        }
    }

    this.stop = function() {
        synth.paused = false;
        if (synth.running) {
            synth.running = false;
            synth.clock.stop();
            synth.gainNode.gain.setValueAtTime(synth.gainNode.gain.value, synth.audioCtx.currentTime);
            synth.gainNode.gain.linearRampToValueAtTime(0, synth.audioCtx.currentTime + VOL_RAMP_TIME);
        }
    }

    this.loadPreset = function(preset) {
        // copy over properties from preset
        synth.state = Object.assign(synth.state, preset);
        interface.setToSynthParameters(); 
    }

    this.randomiseCells = function(p=0.5) {
        synth.state.brd.cells = randomCells(synth.gridSize, p);
    }

    this.resetToGlider = function() {
        synth.state.brd.cells = gliderCells(synth.gridSize);
    }
}



presets = {
    chatter: {
        damping: 10,
        delay: 80,
        heat: 0.17,
        liveliness: 2.87,
        multiplier: 6.75,
        rootNote: 66
    },
}



iface = new HtmlInterface(document, GRIDSIZE);
synth = new SynthInstance(iface, GRIDSIZE);