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

process.on("uncaughtException", function(err){
    fs.appendFileSync('err.txt', err);
});

function main(window){
	var express = require("express");
	var app = express();
	var http = require('http');
	var server = http.createServer(app);
	var io = require('socket.io').listen(server);
    var fileDowloadV4 = require('fileDownloadV4/downloaderV4.js');

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
	io.sockets.on('connection', function(socket) {
        global.socket = socket;
        socket.on('receive', function(info){
            // TODO: update downloader states using global.downloaders[info.hash]

            file.write(info.start * BLOCK_SIZE, info.data, function(err){
                if(err) {
                    window.console.log(err);
                }
                if (info.data.length < BLOCK_SIZE) {
                    window.console.log("receive complete, ", Date);
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
    global.downloaders = {};
    if ("some condition") {
        fileDowloadV4.downloadFile(args);
    }
	server.listen(12345);
}

exports.main = main;
