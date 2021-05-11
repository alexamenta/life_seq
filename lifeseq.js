Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
    }

// grid options
const NUM_ROWS = 32;
const NUM_COLS = 32;

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

// board constructor: random board with probability p of life.
// set p=0 (default) for empty board
function Board(rows, cols, p=0) {
    this.rows = rows;
    this.cols = cols;
    this.cells = [];
    for (let x=0; x<rows; x++) {
        this.cells.push([]); // create row
        for (let y=0; y<cols; y++) {
            if (p==0) {
                this.cells[x].push(false);
            } else {
                this.cells[x].push((Math.random() < p));
            }
        }
    }
}

// initialise a glider
function gliderBoard(rows, cols) {
    let board = new Board(rows, cols);
    board.cells[0][1] = true;
    board.cells[1][0] = true;
    board.cells[2][0] = true;
    board.cells[2][1] = true;
    board.cells[2][2] = true;
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
                        nbr_status = brd.cells[(x + dx).mod(r)][(y + dy).mod(c)];
                        live_nbrs += Number(nbr_status);
                    }
                }
            }

            // live cells need 2 or 3 live neighbours to live
            if (brd.cells[x][y]) {
                new_brd.cells[x][y] = (live_nbrs == 2 || live_nbrs == 3);
            } else {
                new_brd.cells[x][y] = (live_nbrs == 3);
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
    
            if (brd.cells[r][c]) {
                ctx.fillStyle = LIVE_COLOUR;
            } else {
                ctx.fillStyle = DEAD_COLOUR;
            }

            ctx.fillRect(...topleft, ...widthheight);
        }
    }
}

// initialise a board and draw it
let brd = new Board(NUM_ROWS, NUM_COLS, p=0.15);
draw(brd);

// update the drawn board
function updateDisplayedBrd() {
    brd = step(brd);
    draw(brd);
}

// step when user clicks the canvas
canvas.addEventListener('click', updateDisplayedBrd);