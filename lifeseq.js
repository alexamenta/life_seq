Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
    }

const NUM_ROWS = 32;
const NUM_COLS = 32;

const canvas = document.querySelector('.myCanvas');
const width = canvas.width = 320;
const height = canvas.height = 320;
const ctx = canvas.getContext('2d');

ctx.fillStyle = 'rgba(255,255,255,0.05)';
ctx.fillRect(0, 0, width, height);

const eps = 1;

const len = height/NUM_ROWS;  // breaks if not square!

const LIVE_COLOUR = 'rgb(200, 200, 200)'
const DEAD_COLOUR = 'rgb(20, 20, 20)'


function Board(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.cells = [];
    for (let x=0; x<rows; x++) {
        this.cells.push([]); // create row
        for (let y=0; y<cols; y++) {
            this.cells[x].push(undefined);
        }
    }
}

function step(board) {
    let r = board.rows;
    let c = board.cols;
    let new_brd = emptyBoard(r,c);

    console.log("trying to step")

    for (let x=0; x<r; x++) {
        for (let y=0; y<c; y++) {
            console.log("checking the point with coords [" + x + ", " + y + "]");
            // count number of live neighbours
            let live_neighbours = 0;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx != 0 || dy != 0) {
                        // console.log([x+dx, y+dy]);
                        // console.log([(x + dx).mod(r), (y + dy).mod(c)]);
                        nbr_status = board.cells[(x + dx).mod(r)][(y + dy).mod(c)];
                        live_neighbours += Number(nbr_status);
                    }
                }
            }

            // live cells need 2 or 3 live neighbours to live
            if (board.cells[x][y]) {
                new_brd.cells[x][y] = (live_neighbours == 2 || live_neighbours == 3);
            } else {
                new_brd.cells[x][y] = (live_neighbours == 3);
            }
        }
    }

    return new_brd;
}

function emptyBoard(rows, cols) {
    let board = new Board(rows, cols);
    for (let x=0; x<rows; x++) {
        for (let y=0; y<cols; y++) {
            board.cells[x][y] = false;
        }
    }
    return board;
}

function randomBoard(rows, cols) {
    let board = new Board(rows, cols);
    for (let x=0; x<rows; x++) {
        for (let y=0; y<cols; y++) {
            board.cells[x][y] = (Math.random() < 0.5);
        }
    }
    return board;
}

function gliderBoard(rows, cols) {
    let board = new emptyBoard(rows, cols);
    board.cells[0][1] = true;
    board.cells[1][0] = true;
    board.cells[2][0] = true;
    board.cells[2][1] = true;
    board.cells[2][2] = true;
    return board;
}


function draw(board) {
    for (let r=0; r < board.rows; r++) {
        for (let c=0; c < board.cols; c++) {
            let topleft = [c*len + eps, r*len + eps];
            let widthheight = [len-2*eps, len-2*eps];
    
            if (board.cells[r][c]) {
                ctx.fillStyle = LIVE_COLOUR;
            } else {
                ctx.fillStyle = DEAD_COLOUR;
            }

            ctx.fillRect(...topleft, ...widthheight);
        }
    }
}

function globalStep() {
    brd = step(brd);
    draw(brd);
}

var brd = randomBoard(NUM_ROWS, NUM_COLS);
draw(brd);


canvas.addEventListener('click', globalStep);
