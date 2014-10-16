var fs = require('fs');

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
	io.sockets.on('connection', function(socket){
		global.socket = socket;
		socket.on('send', function(data){
			data = fs.readFileSync('Advice.mp3');
			socket.emit('send', toArrayBuffer(data));
		});
		socket.on('receive', function(data){
            if (data.constructor === ArrayBuffer) {
                console.log("start wrting to file");
                fs.writeFileSync('Advice.mp3', toBuffer(data));
            } else {
                console.log("data type wrong!");
            }
		});
	});
	server.listen(12345);
})();

