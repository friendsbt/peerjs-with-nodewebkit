var fs = require('fs');
var raf = require('random-access-file');
var xxhash = require('xxhashjs');

var BLOCK_SIZE = 1024;

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
  var fileUploadV4 = require('fileDownloadV4/uploaderV4.js');

	app.use(express.static(__dirname + '/static'));
	app.set("views", __dirname+"/views/");
	app.set("view engine", "jade");
	app.set("view options", {layout:false});
	app.use(express.bodyParser());
	app.use(express.cookieParser());
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
        // TODO: 何时接收完成
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
  global.downloaders = {};  // node 环境中保存所有downloader
  fileUploadV4.initWindow(window);
  if ("some condition") {
    fileDowloadV4.downloadFile(args);
  }
  if ("some condition2") {
    var my_uid = 'zuoyao';
    var downloader_uid = 'lizhihua';
    var filesize = fs.statSync('Advice.mp3').size;  // 实际中接收传来的size
    var hash = 473225162;
    fileUploadV4.initV4Upload(my_uid, downloader_uid, hash, filesize);
  }
	server.listen(12345);
}

exports.main = main;
