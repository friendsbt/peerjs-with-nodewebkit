var fs = require('fs');
var raf = require('random-access-file');
var xxhash = require('xxhashjs');

var BLOCK_SIZE = 1024;

function toArrayBuffer(buffer) {
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);  // 只有创建了view才能给每个byte赋值
    for (var i = 0; i < buffer.length; ++i) {
        view[i] = buffer[i];
    }
    return ab;
}

function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        buffer[i] = view[i];
    }
    return buffer;
}

(function (){
	var express = require("express");
	var app = express();
	var http = require('http');
	var server = http.createServer(app);
	var io = require('socket.io').listen(server);

	app.use(express.static(__dirname + '/static'));
	app.set("views", __dirname+"/views/");
	app.set("view engine", "jade");
	app.set("view options", {layout:false});
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	//app.use(express.session());
	app.use(express.logger());
	app.get("/", function(req,res){
		res.render("index");
	});
    var file = raf('Advice.mp3');
	io.sockets.on('connection', function(socket){
		global.socket = socket;
		socket.on('send', function(){
            var filesize = fs.statSync('Advice.mp3').size;
            var totalFullBlocks = parseInt((filesize - BLOCK_SIZE + 1) / BLOCK_SIZE);
            var last_block_size = filesize - BLOCK_SIZE * totalFullBlocks;
            var index = 0;
            var start = 0;
            var intervalObj = setInterval(function(){
                if (index > totalFullBlocks - 1) {
                    clearInterval(intervalObj);
                    file.read(start, last_block_size, function(err, data){
                        socket.emit('send', {index: index, data:toArrayBuffer(data)});
                        console.log("last block sent");
                        file.close();
                        setTimeout(function(){
                            socket.emit('control', {type: "disconnect"});
                        }, 100);
                    })
                } else {
                    file.read(start, BLOCK_SIZE, function (err, data) {
                        socket.emit('send', {index: index, data: toArrayBuffer(data)});
                        start += BLOCK_SIZE;
                        index++;
                    })
                }
            }, 30);
		});
		socket.on('receive', function(info){
            file.write(info.start * BLOCK_SIZE, info.data, function(err){
                if(err) {
                    console.log(err);
                }
                if (info.data.length < BLOCK_SIZE) {
                    console.log("receive complete, ", Date);
                    file.close();
                    var hash = parseInt(xxhash(0).update(fs.readFileSync('Advice.mp3')).digest());
                    var result;
                    if (hash === 473225162) {
                        result = "hash equal";
                    } else {
                        result = "hash not equal";
                    }
                    setTimeout(function(){
                        socket.emit('control', {type: 'result', result: result});
                    }, 100);
                }
            });
		});
	});
	server.listen(12345);
})();

