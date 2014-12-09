var fs = require('fs');

process.on("uncaughtException", function(err){
  fs.appendFileSync('err.txt', err);
});

function main(window){
	var express = require("express");
	var app = express();
	var http = require('http');
	var server = http.createServer(app);
	var io = require('socket.io').listen(server);
  server.listen(12345);

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

  var my_uid = 'zuoyao';
  // var my_uid = 'lizhihua';

	io.sockets.on('connection', function(socket) {
    global.socket = socket;
    socket.emit("initpeer", my_uid);  // create Peer for download/upload
    var fileDowloadV4 = require('./fileDownloadV4/downloaderV4.js');
    var fileUploadV4 = require('./fileDownloadV4/uploaderV4.js');
    fileUploadV4.initWindow(window);
    fileDowloadV4.initWindow(window);
    var hash = 473225162;  // Advice.mp3
    var size = 11156847;
    if (my_uid === 'lizhihua') {
      var uploader_uids = 'zuoyao';
      var fileInfo = {hash: hash, size: size, file_to_save: 'Advice.mp3'};
      fileDowloadV4.downloadFile(fileInfo, my_uid, uploader_uids);

      // test pause and resume
      setTimeout(function(){
        fileDowloadV4.pauseFileDownload(hash);
        setTimeout(function(){
          fileDowloadV4.resumeFileDownload(hash);
        }, 5000);
      }, 5000);
    }
    if (my_uid === 'zuoyao') {
      var downloader_uid = 'lizhihua';
      var filesize = fs.statSync('Advice.mp3').size;  // 实际中接收传来的size和hash
      fileUploadV4.initV4Upload(my_uid, downloader_uid, hash, filesize);
    }
  });

}

exports.main = main;
