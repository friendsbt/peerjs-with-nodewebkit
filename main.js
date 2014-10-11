var fs = require('fs');
var express = require(path_s.join(global.exec_path,"express"));
var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require(path_s.join(global.exec_path,'socket.io')).listen(server);	
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
		var data = fs.readFileSync('Advice.mp3');
		socket.emit('send', data);
	});
	socket.on('receive', function(data){
		fs.writeFileSync('Advice.mp3', data);
	});
}
server.listen(12345);