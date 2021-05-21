let AudioContext = window.AudioContext || window.webkitAudioContext;

// options
const GRIDSIZE = 16;
const LIVE_COLOUR = 'rgb(200, 200, 200)'

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

    /* TODO:
       abstract the patten appearing in the methods below
       (somehow)
    */
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
            this.draw();
        }
    }

    rightClickCell(x,y) {
        let synth = this.connectedSynthInstance;
        if (synth) {
            synth.setCellValue(x, y, 0);
            this.draw();
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

class Clock {
    constructor(delay, listeners=[]) {
        this.delay = delay;
        this.listeners = listeners;    
        this.running = false;
    }
    
    addListener(listener) {
        this.listeners.push(listener);
    }

    // broadcast tick message to all listeners
    tick() {
        for (let i = 0; i < this.listeners.length; i++) {
            this.listeners[i].receiveTick();
        }
    }

    // start clock
    async start() {
        this.running = true;
        while (true) {
            this.tick();
            if (!this.running) {break;}
            await new Promise(r => setTimeout(r, this.delay));
            if (!this.running) {break;}
        }
    }

    // stop clock
    stop() {
        this.running = false;
    }

    toggle() {
        this.running ? this.stop() : this.start();
    }
}


// an instance of life_syn
class SynthInstance {

    constructor(iface, gridSize) {
        this.gridSize = gridSize;
        this.iface = iface;
        this.iface.connectSynthInstance(this);
        this.clock = undefined;
        this.audioCtx = undefined;
        this.state = {
            brd: new Board(this.gridSize, 0),
            rootNote: undefined,
            multiplier: undefined,
            damping: undefined,
            liveliness: undefined,
            heat: undefined,
            delay: undefined
            }
        this.accessingAudio = false;
        this.gainNode = undefined;
        this.oscs = undefined;
        this.gains = undefined;
        this.on = false;
        this.running = false;
        this.paused = false;
    }

    /* SynthInstance.accessingAudio keeps track of whether the audio context 
       is being accessed. If it is, don't allow power to be switched off.
       This prevents some errors that pop up when the power is turned off
       during a clock cycle.
       When a method needs access to the audio context, wrap it in freeAudio!
    */
    freeAudio(fnc) {
        this.accessingAudio = true;
        fnc();
        this.accessingAudio = false;
    }

    // called by the interface
    setCellValue(x, y, value) {
        if (!synth.on) {
            console.log("Cannot set cell value while synth power is off");
        } else {
            this.state.brd.cells[x][y] = value;
        }
    }


    // generates oscillator and gain node matrices
    // frequencies all set to 440 by default
    // gains all set to 0 by default
    // these will be changed as the synth runs
    generateOscsAndGains() {
        if (!this.audioCtx || !this.gainNode) {
            console.log("Audio context and/or gain node not found")
        } else {
            // first reset oscs and gains to empty state
            this.oscs = [];
            this.gains = [];

            for (let x=0; x < this.gridSize; x++) {
                this.oscs.push([]);
                this.gains.push([]);
                for (let y=0; y < this.gridSize; y++) {
                    let newOsc = this.audioCtx.createOscillator();
                    this.oscs[x].push(newOsc);
    
                    let newGainNode = this.audioCtx.createGain();
                    newGainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
                    this.gains[x].push(newGainNode)
                    newGainNode.connect(this.gainNode);
                    newOsc.connect(newGainNode);
                    newOsc.start();
                }
            }
        }
    }

    // generate matrix of frequencies
    // this contains the logic dictating how cells correspond to frequencies
    // it would be a good idea to define that as a separate function
    generateFreqMatrix() {
        let freqs = [];
        for (let x = 0; x < this.gridSize; x++) {
            freqs.push([]);
            for (let y = 0; y < this.gridSize; y++) {
                // webaudio API only allows frequencies below 22050
                // so truncate to avoid errors
                let computed_freq = noteToFreq(this.state.rootNote)*freqMultiplier(x, y, this.gridSize, this.state.multiplier);
                freqs[x].push(Math.min(computed_freq, 22050));
            }
        }
        return freqs;
    }

    // given frequency matrix (output of SynthInstance.generateFreqMatrix)
    // ramp the current frequencies (in SynthInstance.oscs) to the new values
    setFrequencies(freqs) {
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                // see https://stackoverflow.com/questions/34476178/web-audio-click-sound-even-when-using-exponentialramptovalueattime
                this.oscs[x][y].frequency.setValueAtTime(this.oscs[x][y].frequency.value, this.audioCtx.currentTime)
                this.oscs[x][y].frequency.exponentialRampToValueAtTime(freqs[x][y], this.audioCtx.currentTime + 0.005);
            }
        }
    }

    readyToPlay() {
        if (!this.audioCtx) {
            console.log("audio context not found");
            return false;
        } else if (!this.gainNode) {
            console.log("gain node not found");
            return false;
        } else if (!this.on) {
            console.log("synth is not turned on");
            return false;
        } else {
            return true;
        }
    }
    
    switchOn() {
        if (!this.on) {
            this.on = true;
            this.iface.switchOn();
            this.initialiseAudio();
            this.getParameters();
            // initialise clock
            this.clock = new Clock(this.state.delay);
            this.clock.addListener(this);
            this.clock.addListener(this.iface);
        } else {
            console.log("Synth is already on");
        }
    }

    switchOff() {
        if (this.on) {
            
            this.stop();

            while (this.accessingAudio) {
            // wait until audio context isn't being accessed before switching it off
            }

            this.audioCtx.close().then(() => {
                this.audioCtx = undefined;
                this.on = false;
                this.iface.switchOff();
            })

        } else {
            console.log("Synth is already off");
        }
    }

    pause() {
        if (!this.paused) {
            this.paused = true;
            if (this.clock) {this.clock.stop();}
        }
    }

    initialiseAudio() {
        // initialise audio context
        this.audioCtx = new AudioContext();

        this.freeAudio(
            () => {
                // global gain node, to adjust volume
                this.gainNode = this.audioCtx.createGain();
                this.gainNode.gain.value = this.iface.volumeControl.value;
                this.iface.volumeControl.addEventListener('input', 
                    () => {
                        this.gainNode.gain.value = this.iface.volumeControl.value;
                    }, false);
                this.gainNode.connect(this.audioCtx.destination);

                this.generateOscsAndGains()                
            }
        )
    }

    getParameters() {
        // do nothing and return no error if audio context is undefined
        // if an error were to be returned, we'd always get error messages when the power is switched off
        // even with the freeAudio functionality (which isn't really good enough tbh)
        if (this.audioCtx) {
            this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.audioCtx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(this.iface.volumeControl.value/1, this.audioCtx.currentTime + 0.005);
    
            // get initial parameters
            this.state.rootNote = this.iface.rootNoteControl.value/1;
            this.state.multiplier = this.iface.multiplierControl.value/1;
            this.state.liveliness = this.iface.livelinessControl.value/1;
            this.state.damping = this.iface.dampingControl.value/1;
            this.state.heat = this.iface.heatControl.value/1;
            this.state.delay = 1/this.iface.speedControl.value;
    
            // generate and set frequencies
            this.freeAudio(
                () => this.setFrequencies(this.generateFreqMatrix())
            );
        }
    }

    receiveTick() {
        // update and play board
        // interface handles the drawing
        this.state.brd.step(soft_conway(this.state.liveliness, this.state.heat));
        this.getParameters();
        this.clock.delay = this.state.delay;
        this.play();
    }

    // play the current board (audio)
    play() {
        if (this.readyToPlay()) {
            for (let x = 0; x < this.gridSize; x++) {
                for (let y = 0; y < this.gridSize; y++) {
                    this.freeAudio(
                        () =>  {
                            let new_vol = dampCurve(x, y, this.gridSize, this.state.damping)*this.state.brd.cells[x][y];
                            // see https://stackoverflow.com/questions/34476178/web-audio-click-sound-even-when-using-exponentialramptovalueattime
                            this.gains[x][y].gain.setValueAtTime(this.gains[x][y].gain.value, this.audioCtx.currentTime);
                            this.gains[x][y].gain.linearRampToValueAtTime(new_vol, this.audioCtx.currentTime + 0.005);
                        }
                    );
                }   
            }
        }
    }

    // run the synth (actually just turn on the clock)
    run() {
        this.paused = false;
        if (this.on) {
            this.running = true;
            if (!this.clock.running) {
                this.clock.start();
            }
        }
    }

    stop() {
        this.paused = false;
        if (this.running) {
            this.running = false;
            this.clock.stop();
            this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.audioCtx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.005);
        }
    }

    loadPreset(preset) {
        /* copy over properties from preset
           using Object.assign takes the properties of preset
           without erasing non-present properties
        */
        this.state = Object.assign(this.state, preset);
        this.iface.setToSynthParameters(); 
    }

    randomiseCells(p=0.5) {
        this.state.brd.cells = randomCells(this.gridSize, p);
    }

    resetToGlider() {
        this.state.brd.cells = gliderCells(this.gridSize);
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